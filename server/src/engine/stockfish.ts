// @ts-ignore
import initStockfish from 'stockfish';
import { Chess } from 'chess.js';
import { spawn, ChildProcessWithoutNullStreams } from 'node:child_process';
import fs from 'node:fs';
import readline from 'node:readline';

export interface EngineEvaluation {
  bestMove: string;
  bestMoveSan?: string;
  scoreCp: number; // Normalized from White's perspective (positive = White advantage)
  scoreMate?: number; // Mate in N moves from White's perspective (positive = White mates)
  pv: string[]; // Principal variation UCI moves
  depth: number;
  winProb: number; // 0 to 1 for White
}

export interface CandidateMove {
  rank: number;
  move: string;
  san: string;
  scoreCp: number;
  scoreMate?: number;
  depth: number;
  pv: string[];
  pvSan: string[];
}

export interface PositionAnalysisResult {
  fen: string;
  bestMove: string;
  bestMoveSan: string;
  evaluation: {
    scoreCp: number;
    scoreMate?: number;
    depth: number;
    sideToMove: 'w' | 'b';
    text: string;
  };
  topMoves: CandidateMove[];
  bestLine: {
    uci: string[];
    san: string[];
  };
  depth: number;
  engineName: string;
  nodes?: number;
  timeMs?: number;
}

interface EvalQueueItem {
  type: 'single' | 'position';
  fen: string;
  depth: number;
  multiPv?: number;
  resolve: (res: any) => void;
  reject: (err: any) => void;
}

interface StockfishBackend {
  type: 'native' | 'wasm';
  path?: string;
  sendCommand(cmd: string): void;
  destroy?(): void;
}

function findNativeStockfish(): string | null {
  if (process.env.STOCKFISH_PATH && fs.existsSync(process.env.STOCKFISH_PATH)) {
    return process.env.STOCKFISH_PATH;
  }

  const commonPaths = [
    '/usr/games/stockfish',
    '/usr/local/bin/stockfish',
    '/usr/bin/stockfish'
  ];

  for (const p of commonPaths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }

  return null;
}

export function uciToSan(fen: string, uciMoves: string[]): string[] {
  try {
    const tempChess = new Chess(fen);
    const sans: string[] = [];
    for (const u of uciMoves) {
      if (!u || u.length < 4) break;
      const from = u.substring(0, 2);
      const to = u.substring(2, 4);
      const promotion = u.length > 4 ? u[4] : undefined;
      const res = tempChess.move({ from: from as any, to: to as any, promotion: promotion as any });
      if (res) sans.push(res.san);
      else break;
    }
    return sans;
  } catch {
    return [];
  }
}

export class StockfishEngine {
  private backend: StockfishBackend | null = null;
  private isInitialized: boolean = false;
  private isProcessing: boolean = false;
  private queue: EvalQueueItem[] = [];
  private currentEval: {
    type: 'single' | 'position';
    fen: string;
    depth: number;
    multiPv?: number;
    isWhiteToMove: boolean;
    scoreCp: number;
    scoreMate?: number;
    pv: string[];
    reachedDepth: number;
    multiPvLines: Map<number, { scoreCp: number; scoreMate?: number; depth: number; pv: string[] }>;
    resolve: (res: any) => void;
    reject: (err: any) => void;
    timer: NodeJS.Timeout;
  } | null = null;

  async init(): Promise<void> {
    if (this.isInitialized) return;

    const nativePath = findNativeStockfish();
    const threads = parseInt(process.env.STOCKFISH_THREADS || '', 10) || (nativePath ? 2 : 1);
    const hash = parseInt(process.env.STOCKFISH_HASH || '', 10) || (nativePath ? 128 : 32);

    if (nativePath) {
      console.log(`[Stockfish] Spawning native Stockfish binary at: ${nativePath}`);
      try {
        const proc: ChildProcessWithoutNullStreams = spawn(nativePath, [], {
          stdio: ['pipe', 'pipe', 'pipe']
        });

        const rl = readline.createInterface({
          input: proc.stdout,
          terminal: false
        });

        rl.on('line', (line: string) => {
          this.parseLine(line);
        });

        proc.stderr.on('data', (chunk) => {
          console.warn('[Stockfish Native Stderr]:', chunk.toString());
        });

        proc.on('error', (err) => {
          console.error('[Stockfish Native Process Error]:', err);
        });

        this.backend = {
          type: 'native',
          path: nativePath,
          sendCommand: (cmd: string) => {
            if (proc.stdin && !proc.stdin.destroyed) {
              proc.stdin.write(cmd + '\n');
            }
          },
          destroy: () => {
            proc.kill();
          }
        };

        this.backend.sendCommand('uci');
        this.backend.sendCommand(`setoption name Threads value ${threads}`);
        this.backend.sendCommand(`setoption name Hash value ${hash}`);
        this.isInitialized = true;
        console.log(`[Stockfish] Native C++ engine initialized (Threads: ${threads}, Hash: ${hash}MB).`);
        return;
      } catch (err) {
        console.warn('[Stockfish] Failed to spawn native binary, falling back to WASM engine:', err);
      }
    }

    // WASM Fallback for local development without binary
    console.log('[Stockfish] Native binary not found. Initializing Emscripten JS/WASM engine fallback...');
    const nativeFetch = globalThis.fetch;
    this.setupStdoutInterceptor();
    const wasmEngine = await initStockfish();

    if (typeof nativeFetch === 'function') {
      globalThis.fetch = nativeFetch;
    }

    this.backend = {
      type: 'wasm',
      sendCommand: (cmd: string) => wasmEngine.sendCommand(cmd)
    };

    this.backend.sendCommand('uci');
    this.backend.sendCommand('setoption name Threads value 1');
    this.backend.sendCommand('setoption name Hash value 32');

    this.isInitialized = true;
    console.log('[Stockfish] WASM engine fallback initialized and ready.');
  }

  getEngineInfo() {
    const remoteUrl = process.env.STOCKFISH_REMOTE_URL?.trim();
    if (remoteUrl) {
      return {
        type: 'remote',
        url: remoteUrl,
        isReady: true,
        engineName: 'Stockfish 19 (Google Colab Remote)',
        threads: 2,
        hashMb: 256
      };
    }

    return {
      type: this.backend?.type || 'uninitialized',
      path: this.backend?.path || null,
      isReady: this.isInitialized,
      threads: parseInt(process.env.STOCKFISH_THREADS || '', 10) || (this.backend?.type === 'native' ? 2 : 1),
      hashMb: parseInt(process.env.STOCKFISH_HASH || '', 10) || (this.backend?.type === 'native' ? 128 : 32)
    };
  }

  private sendCommand(cmd: string): void {
    if (this.backend) {
      this.backend.sendCommand(cmd);
    }
  }

  private setupStdoutInterceptor(): void {
    const originalWrite = process.stdout.write;
    let buffer = '';

    process.stdout.write = (chunk: any, encoding?: any, cb?: any): boolean => {
      const str = typeof chunk === 'string' ? chunk : chunk.toString();
      buffer += str;

      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        this.parseLine(line);
      }

      // Suppress spammy engine UCI lines from console
      if (
        str.startsWith('info depth') ||
        str.startsWith('info string') ||
        str.startsWith('id name') ||
        str.startsWith('id author') ||
        str.startsWith('option name') ||
        str.startsWith('uciok') ||
        str.startsWith('readyok') ||
        str.startsWith('bestmove')
      ) {
        if (typeof cb === 'function') cb();
        return true;
      }

      return originalWrite.call(process.stdout, chunk, encoding, cb);
    };
  }

  private parseLine(line: string): void {
    if (!this.currentEval) return;

    const trimmed = line.trim();

    if (trimmed.startsWith('info') && trimmed.includes('score')) {
      const depthMatch = trimmed.match(/\bdepth\s+(\d+)/);
      let lineDepth = this.currentEval.reachedDepth;
      if (depthMatch) {
        lineDepth = parseInt(depthMatch[1], 10);
        if (lineDepth > this.currentEval.reachedDepth) {
          this.currentEval.reachedDepth = lineDepth;
        }
      }

      const cpMatch = trimmed.match(/\bscore\s+cp\s+(-?\d+)/);
      const mateMatch = trimmed.match(/\bscore\s+mate\s+(-?\d+)/);
      let lineScoreCp = 0;
      let lineScoreMate: number | undefined = undefined;

      if (mateMatch) {
        const rawMate = parseInt(mateMatch[1], 10);
        lineScoreMate = this.currentEval.isWhiteToMove ? rawMate : -rawMate;
        lineScoreCp = lineScoreMate > 0
          ? 10000 - lineScoreMate * 100
          : -10000 - lineScoreMate * 100;
      } else if (cpMatch) {
        const rawCp = parseInt(cpMatch[1], 10);
        lineScoreCp = this.currentEval.isWhiteToMove ? rawCp : -rawCp;
      }

      const pvMatch = trimmed.match(/\bpv\s+(.+)$/);
      let linePv: string[] = [];
      if (pvMatch) {
        linePv = pvMatch[1].trim().split(/\s+/);
      }

      const mpvMatch = trimmed.match(/\bmultipv\s+(\d+)/);
      const mpv = mpvMatch ? parseInt(mpvMatch[1], 10) : 1;

      if (mpv === 1) {
        this.currentEval.scoreCp = lineScoreCp;
        this.currentEval.scoreMate = lineScoreMate;
        if (linePv.length > 0) this.currentEval.pv = linePv;
      }

      this.currentEval.multiPvLines.set(mpv, {
        scoreCp: lineScoreCp,
        scoreMate: lineScoreMate,
        depth: lineDepth,
        pv: linePv
      });
    }

    if (trimmed.startsWith('bestmove')) {
      const parts = trimmed.split(/\s+/);
      const bestMove = parts[1] || (this.currentEval.pv[0] ?? '');

      const evalData = this.currentEval;
      this.currentEval = null;
      clearTimeout(evalData.timer);

      if (evalData.type === 'position') {
        // Reset MultiPV back to 1 for standard evaluations
        this.sendCommand('setoption name MultiPV value 1');

        // Helper to convert UCI moves to SAN
        const uciToSan = (fen: string, uciMoves: string[]): string[] => {
          try {
            const tempChess = new Chess(fen);
            const sans: string[] = [];
            for (const u of uciMoves) {
              if (!u || u.length < 4) break;
              const from = u.substring(0, 2);
              const to = u.substring(2, 4);
              const promotion = u.length > 4 ? u[4] : undefined;
              const res = tempChess.move({ from: from as any, to: to as any, promotion: promotion as any });
              if (res) sans.push(res.san);
              else break;
            }
            return sans;
          } catch {
            return [];
          }
        };

        const sortedRanks = Array.from(evalData.multiPvLines.keys()).sort((a, b) => a - b);
        const topMoves: CandidateMove[] = sortedRanks.map(rank => {
          const line = evalData.multiPvLines.get(rank)!;
          const lineMove = line.pv[0] || (rank === 1 ? bestMove : '');
          const lineSan = uciToSan(evalData.fen, [lineMove])[0] || lineMove;
          const pvSan = uciToSan(evalData.fen, line.pv);
          return {
            rank,
            move: lineMove,
            san: lineSan,
            scoreCp: line.scoreCp,
            scoreMate: line.scoreMate,
            depth: line.depth,
            pv: line.pv,
            pvSan
          };
        });

        const primaryLine = topMoves[0] || {
          rank: 1,
          move: bestMove,
          san: bestMove,
          scoreCp: evalData.scoreCp,
          scoreMate: evalData.scoreMate,
          depth: evalData.reachedDepth || evalData.depth,
          pv: evalData.pv,
          pvSan: []
        };

        const bestMoveSan = uciToSan(evalData.fen, [bestMove])[0] || bestMove;
        const side = evalData.isWhiteToMove ? 'White' : 'Black';
        const formattedCp = (primaryLine.scoreCp / 100).toFixed(2);
        const cpSign = primaryLine.scoreCp >= 0 ? `+${formattedCp}` : formattedCp;

        const evalText = primaryLine.scoreMate !== undefined
          ? `${primaryLine.scoreMate > 0 ? 'White' : 'Black'} Mate in ${Math.abs(primaryLine.scoreMate)}`
          : `${side} ${cpSign}`;

        const result: PositionAnalysisResult = {
          fen: evalData.fen,
          bestMove,
          bestMoveSan,
          evaluation: {
            scoreCp: primaryLine.scoreCp,
            scoreMate: primaryLine.scoreMate,
            depth: evalData.reachedDepth || evalData.depth,
            sideToMove: evalData.isWhiteToMove ? 'w' : 'b',
            text: evalText
          },
          topMoves,
          bestLine: {
            uci: primaryLine.pv,
            san: primaryLine.pvSan
          },
          depth: evalData.reachedDepth || evalData.depth,
          engineName: 'Stockfish 18 NNUE'
        };

        evalData.resolve(result);
      } else {
        // Single move evaluation for full game review
        const boundedCp = Math.min(Math.max(evalData.scoreCp, -2000), 2000);
        const winProb = 2 / (1 + Math.exp(-0.00368208 * boundedCp));

        evalData.resolve({
          bestMove,
          scoreCp: evalData.scoreCp,
          scoreMate: evalData.scoreMate,
          pv: evalData.pv,
          depth: evalData.reachedDepth || evalData.depth,
          winProb: Math.min(Math.max(winProb, 0.0001), 0.9999)
        });
      }

      this.isProcessing = false;
      this.processQueue();
    }
  }

  async evaluateFen(fen: string, depth: number = 12): Promise<EngineEvaluation> {
    const remoteUrl = process.env.STOCKFISH_REMOTE_URL?.trim();
    if (remoteUrl) {
      try {
        const apiKey = process.env.STOCKFISH_API_KEY?.trim();
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (apiKey) headers['X-API-Key'] = apiKey;

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);

        const res = await fetch(`${remoteUrl}/evaluate`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ fen, depth }),
          signal: controller.signal
        });
        clearTimeout(timeout);

        if (res.ok) {
          const data: any = await res.json();
          const boundedCp = Math.min(Math.max(data.scoreCp ?? 0, -2000), 2000);
          const winProb = 2 / (1 + Math.exp(-0.00368208 * boundedCp));

          return {
            bestMove: data.bestMove,
            bestMoveSan: data.bestMoveSan,
            scoreCp: data.scoreCp ?? 0,
            scoreMate: data.scoreMate ?? undefined,
            pv: data.pv || [],
            depth: data.depth || depth,
            winProb: Math.min(Math.max(winProb, 0.0001), 0.9999)
          };
        }
      } catch (err) {
        console.warn('[Stockfish Remote] Colab eval failed, falling back to local engine:', err);
      }
    }

    await this.init();

    return new Promise((resolve, reject) => {
      this.queue.push({ type: 'single', fen, depth, resolve, reject });
      this.processQueue();
    });
  }

  async analyzePosition(
    fen: string,
    options: { depth?: number; multiPv?: number } = {}
  ): Promise<PositionAnalysisResult> {
    const depth = options.depth || 20;
    const multiPv = options.multiPv || 3;

    const remoteUrl = process.env.STOCKFISH_REMOTE_URL?.trim();
    if (remoteUrl) {
      try {
        const apiKey = process.env.STOCKFISH_API_KEY?.trim();
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (apiKey) headers['X-API-Key'] = apiKey;

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 20000);

        const res = await fetch(`${remoteUrl}/analyze`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ fen, depth, multiPv }),
          signal: controller.signal
        });
        clearTimeout(timeout);

        if (res.ok) {
          const data: any = await res.json();
          const side = fen.split(' ')[1] === 'b' ? 'Black' : 'White';
          const scoreCp = data.evaluation?.scoreCp ?? 0;
          const formattedCp = (scoreCp / 100).toFixed(2);
          const cpSign = scoreCp >= 0 ? `+${formattedCp}` : formattedCp;
          const evalText = data.evaluation?.scoreMate !== undefined && data.evaluation?.scoreMate !== null
            ? `${data.evaluation.scoreMate > 0 ? 'White' : 'Black'} Mate in ${Math.abs(data.evaluation.scoreMate)}`
            : `${side} ${cpSign}`;

          const topMoves: CandidateMove[] = (data.topMoves || []).map((tm: any) => ({
            rank: tm.rank,
            move: tm.move,
            san: tm.san,
            scoreCp: tm.scoreCp,
            scoreMate: tm.scoreMate ?? undefined,
            depth: tm.depth || depth,
            pv: tm.pv || [],
            pvSan: uciToSan(fen, tm.pv || [])
          }));

          const primaryLine = topMoves[0] || {
            rank: 1,
            move: data.bestMove,
            san: data.bestMoveSan,
            scoreCp,
            scoreMate: data.evaluation?.scoreMate,
            depth,
            pv: [],
            pvSan: []
          };

          return {
            fen,
            bestMove: data.bestMove,
            bestMoveSan: data.bestMoveSan,
            evaluation: {
              scoreCp,
              scoreMate: data.evaluation?.scoreMate ?? undefined,
              depth: data.evaluation?.depth || depth,
              sideToMove: (fen.split(' ')[1] || 'w') as 'w' | 'b',
              text: evalText
            },
            topMoves,
            bestLine: {
              uci: primaryLine.pv,
              san: primaryLine.pvSan
            },
            depth: data.evaluation?.depth || depth,
            engineName: data.engine || 'Stockfish 19 (Google Colab Remote)'
          };
        }
      } catch (err) {
        console.warn('[Stockfish Remote] Colab analyze failed, falling back to local engine:', err);
      }
    }

    await this.init();

    return new Promise((resolve, reject) => {
      this.queue.push({
        type: 'position',
        fen,
        depth,
        multiPv,
        resolve,
        reject
      });
      this.processQueue();
    });
  }

  cancelCurrentEval(): void {
    if (this.currentEval) {
      clearTimeout(this.currentEval.timer);
      this.currentEval.reject(new Error('Analysis cancelled'));
      this.currentEval = null;
      this.sendCommand('stop');
      this.sendCommand('setoption name MultiPV value 1');
      this.isProcessing = false;
      this.processQueue();
    }
  }

  private processQueue(): void {
    if (this.isProcessing || this.queue.length === 0) return;
    this.isProcessing = true;

    const item = this.queue.shift()!;
    const parts = item.fen.trim().split(/\s+/);
    const sideToMove = parts[1] || 'w';
    const isWhiteToMove = sideToMove === 'w';

    const timeoutMs = item.type === 'position' ? 45000 : 20000;

    const timer = setTimeout(() => {
      if (this.currentEval) {
        const reject = this.currentEval.reject;
        this.currentEval = null;
        this.isProcessing = false;
        try {
          this.sendCommand('stop');
          this.sendCommand('setoption name MultiPV value 1');
        } catch {}
        reject(new Error(`Stockfish timeout for FEN: ${item.fen}`));
        this.processQueue();
      }
    }, timeoutMs);

    this.currentEval = {
      type: item.type,
      fen: item.fen,
      depth: item.depth,
      multiPv: item.multiPv,
      isWhiteToMove,
      scoreCp: 0,
      pv: [],
      reachedDepth: 0,
      multiPvLines: new Map(),
      resolve: item.resolve,
      reject: item.reject,
      timer
    };

    if (item.type === 'position' && item.multiPv) {
      this.sendCommand(`setoption name MultiPV value ${item.multiPv}`);
    }

    this.sendCommand(`position fen ${item.fen}`);
    this.sendCommand(`go depth ${item.depth}`);
  }
}

export const stockfish = new StockfishEngine();
