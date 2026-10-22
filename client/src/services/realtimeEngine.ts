/**
 * realtimeEngine.ts
 * 
 * Client-side real-time Stockfish 18 engine manager.
 * Uses a Web Worker with Stockfish WASM for zero-latency analysis
 * directly in the browser. Streams depth updates live.
 */

import { Chess } from 'chess.js';

export interface ProgressUpdate {
  depth: number;
  seldepth?: number;
  scoreCp: number;
  scoreMate?: number;
  nodes?: number;
  nps?: number;
  pv: string[];        // UCI moves
  pvSan: string[];     // SAN moves
  multiPvRank: number; // 1-based
  timeMs?: number;
}

export interface BestMoveResult {
  uci: string;
  san: string;
  ponder?: string;
  topMoves: ProgressUpdate[];
  depth: number;
}

export interface AnalysisOptions {
  depth?: number;
  multiPv?: number;
  onProgress?: (updates: ProgressUpdate[]) => void;
  onBestMove?: (result: BestMoveResult) => void;
  onError?: (err: string) => void;
}

// ─────────────────────────────────────────────
// UCI info line parser
// ─────────────────────────────────────────────
function parseInfoLine(line: string): Partial<ProgressUpdate> | null {
  if (!line.startsWith('info') || !line.includes(' pv ')) return null;

  const get = (key: string): string | undefined => {
    const m = line.match(new RegExp(`\\b${key}\\s+(\\S+)`));
    return m?.[1];
  };

  const depthStr = get('depth');
  const pvMatch = line.match(/\bpv\s+(.+?)(?:\s*$)/);
  if (!depthStr || !pvMatch) return null;

  const depth = parseInt(depthStr, 10);
  const pvRaw = pvMatch[1].trim().split(/\s+/);
  const rankStr = get('multipv');
  const cpStr = get('cp');
  const mateStr = get('mate');
  const nodesStr = get('nodes');
  const npsStr = get('nps');
  const timeStr = get('time');

  let scoreCp = 0;
  let scoreMate: number | undefined;

  if (mateStr) {
    scoreMate = parseInt(mateStr, 10);
    scoreCp = scoreMate > 0 ? 30000 : -30000;
  } else if (cpStr) {
    scoreCp = parseInt(cpStr, 10);
  }

  return {
    depth,
    seldepth: get('seldepth') ? parseInt(get('seldepth')!, 10) : undefined,
    scoreCp,
    scoreMate,
    nodes: nodesStr ? parseInt(nodesStr, 10) : undefined,
    nps: npsStr ? parseInt(npsStr, 10) : undefined,
    pv: pvRaw,
    pvSan: [],
    multiPvRank: rankStr ? parseInt(rankStr, 10) : 1,
    timeMs: timeStr ? parseInt(timeStr, 10) : undefined
  };
}

// Convert UCI pv to SAN moves given start FEN
function ucivToSan(fen: string, uciMoves: string[]): string[] {
  const san: string[] = [];
  try {
    const chess = new Chess(fen);
    for (const uci of uciMoves) {
      if (uci.length < 4) break;
      const from = uci.substring(0, 2);
      const to = uci.substring(2, 4);
      const promo = uci.length > 4 ? uci[4] : undefined;
      const move = chess.move({ from: from as any, to: to as any, promotion: promo as any });
      if (!move) break;
      san.push(move.san);
    }
  } catch { /* */ }
  return san;
}

// ─────────────────────────────────────────────
// Inline Web Worker source (no separate file needed)
// ─────────────────────────────────────────────
const WORKER_SOURCE = `
let sf = null;
let ready = false;
let pendingCmds = [];

async function loadEngine() {
  // Load Stockfish 16 WASM via CDN (reliable, works cross-origin with importScripts)
  try {
    importScripts('https://cdn.jsdelivr.net/npm/stockfish@16/src/stockfish-nnue-16.js');
    // Wait for stockfish global
    if (typeof Stockfish === 'function') {
      sf = await Stockfish();
    } else if (typeof stockfish === 'function') {
      sf = await stockfish();
    }
    if (sf) {
      sf.addMessageListener((msg) => {
        self.postMessage({ type: 'output', data: msg });
      });
      sf.postMessage('uci');
      sf.postMessage('setoption name Threads value 1');
      sf.postMessage('setoption name MultiPV value 3');
      sf.postMessage('isready');
      ready = true;
      for (const cmd of pendingCmds) sf.postMessage(cmd);
      pendingCmds = [];
    }
  } catch(e) {
    self.postMessage({ type: 'error', data: e.message });
  }
}

self.onmessage = function(e) {
  const { type, data } = e.data;
  if (type === 'init') {
    loadEngine();
    return;
  }
  if (type === 'cmd') {
    if (ready && sf) {
      sf.postMessage(data);
    } else {
      pendingCmds.push(data);
    }
  }
};
`;

// ─────────────────────────────────────────────
// RealtimeEngine singleton
// ─────────────────────────────────────────────
class RealtimeEngine {
  private worker: Worker | null = null;
  private isReady: boolean = false;
  private currentFen: string = '';
  private currentOptions: AnalysisOptions = {};
  private pvMap: Map<number, ProgressUpdate> = new Map();
  private isAnalyzing: boolean = false;
  private useServerFallback: boolean = false;

  constructor() {
    this.init();
  }

  private init() {
    try {
      const blob = new Blob([WORKER_SOURCE], { type: 'application/javascript' });
      const url = URL.createObjectURL(blob);
      this.worker = new Worker(url);
      this.worker.onmessage = this.handleWorkerMessage.bind(this);
      this.worker.onerror = (e) => {
        console.warn('[RealtimeEngine] Worker error, switching to server fallback:', e.message);
        this.useServerFallback = true;
      };
      this.worker.postMessage({ type: 'init' });
    } catch (e) {
      console.warn('[RealtimeEngine] Web Worker unavailable, using server fallback');
      this.useServerFallback = true;
    }
  }

  private handleWorkerMessage(event: MessageEvent) {
    const { type, data } = event.data;
    if (type === 'error') {
      console.warn('[RealtimeEngine] Engine error:', data);
      this.useServerFallback = true;
      return;
    }
    if (type !== 'output') return;

    const line: string = data;

    if (line === 'readyok') {
      this.isReady = true;
      return;
    }

    if (line.startsWith('info') && this.isAnalyzing) {
      const parsed = parseInfoLine(line);
      if (parsed && parsed.pv && parsed.pv.length > 0) {
        // Compute SAN for PV
        parsed.pvSan = ucivToSan(this.currentFen, parsed.pv);
        const update = parsed as ProgressUpdate;
        this.pvMap.set(update.multiPvRank, update);

        // Fire onProgress with all current top moves
        if (this.currentOptions.onProgress) {
          const allUpdates = Array.from(this.pvMap.values())
            .sort((a, b) => a.multiPvRank - b.multiPvRank);
          this.currentOptions.onProgress(allUpdates);
        }
      }
      return;
    }

    if (line.startsWith('bestmove') && this.isAnalyzing) {
      this.isAnalyzing = false;
      const parts = line.split(' ');
      const uci = parts[1] || '';
      const ponder = parts[3] || undefined;

      // Convert best move to SAN
      let san = uci;
      try {
        const chess = new Chess(this.currentFen);
        const from = uci.substring(0, 2);
        const to = uci.substring(2, 4);
        const promo = uci.length > 4 ? uci[4] : undefined;
        const mv = chess.move({ from: from as any, to: to as any, promotion: promo as any });
        if (mv) san = mv.san;
      } catch { /* */ }

      const topMovesArr = Array.from(this.pvMap.values())
        .sort((a, b) => a.multiPvRank - b.multiPvRank);

      const depth = topMovesArr[0]?.depth || 0;

      if (this.currentOptions.onBestMove) {
        this.currentOptions.onBestMove({ uci, san, ponder, topMoves: topMovesArr, depth });
      }
    }
  }

  private sendCmd(cmd: string) {
    if (this.worker) {
      this.worker.postMessage({ type: 'cmd', data: cmd });
    }
  }

  analyze(fen: string, options: AnalysisOptions = {}) {
    this.currentFen = fen;
    this.currentOptions = options;
    this.pvMap.clear();
    this.isAnalyzing = true;

    const depth = options.depth ?? 22;
    const multiPv = options.multiPv ?? 3;

    if (this.useServerFallback) {
      // If engine unavailable, caller gets nothing — page will use server API instead
      if (options.onError) {
        options.onError('Engine unavailable, using server analysis.');
      }
      return;
    }

    this.sendCmd('stop');
    this.sendCmd('ucinewgame');
    this.sendCmd(`setoption name MultiPV value ${multiPv}`);
    this.sendCmd(`position fen ${fen}`);
    this.sendCmd(`go depth ${depth}`);
  }

  stop() {
    if (this.isAnalyzing) {
      this.sendCmd('stop');
      this.isAnalyzing = false;
    }
  }

  get isWorkerReady(): boolean {
    return this.isReady && !this.useServerFallback;
  }

  get needsServerFallback(): boolean {
    return this.useServerFallback;
  }
}

// Export singleton
export const realtimeEngine = new RealtimeEngine();
