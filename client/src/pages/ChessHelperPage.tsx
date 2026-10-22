import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Chess } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import { api } from '../services/api';
import { realtimeEngine, ProgressUpdate, BestMoveResult } from '../services/realtimeEngine';
import { audioManager } from '../services/audioManager';
import { 
  PositionAnalysisResult, CandidateMove, ExplanationLevel, 
  CompareMovesResult, WhatIfResult 
} from '../types';
import { ChessImageDetector, DetectionResult } from '../utils/ChessImageDetector';
import { BoardEditor } from '../components/BoardEditor';
import { neoCustomPieces, pieceFileMap } from '../utils/chessPieces';
import {
  Upload, FileCode, Edit3, Play, RotateCcw, AlertCircle, AlertTriangle,
  CheckCircle2, RefreshCw, Volume2, VolumeX, Sparkles,
  ChevronLeft, ChevronRight, HelpCircle, ArrowRight, X, Compass, Layers,
  Zap, Target, TrendingUp, Crown, Copy, Bookmark, Share2, GitCompare, Check,
  SlidersHorizontal, MessageSquare, CornerDownRight, ArrowLeftRight,
  Trash2, Undo2, Redo2, RotateCw
} from 'lucide-react';

interface ChessHelperPageProps {
  initialFen?: string;
  onNavigateGameReview?: () => void;
}

type InputMode = 'image' | 'fen' | 'pgn' | 'editor';
type PlayerColor = 'white' | 'black';

// ─── Constants & Helpers for Next Chess Move Calculator ───
const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const KINGS_ONLY_FEN = '4k3/8/8/8/8/8/8/4K3 w - - 0 1';

const WHITE_PALETTE = [
  { piece: 'wK', name: 'King' },
  { piece: 'wQ', name: 'Queen' },
  { piece: 'wR', name: 'Rook' },
  { piece: 'wB', name: 'Bishop' },
  { piece: 'wN', name: 'Knight' },
  { piece: 'wP', name: 'Pawn' },
];

const BLACK_PALETTE = [
  { piece: 'bK', name: 'King' },
  { piece: 'bQ', name: 'Queen' },
  { piece: 'bR', name: 'Rook' },
  { piece: 'bB', name: 'Bishop' },
  { piece: 'bN', name: 'Knight' },
  { piece: 'bP', name: 'Pawn' },
];

function updateFenCastling(fen: string, flag: 'K' | 'Q' | 'k' | 'q', enabled: boolean): string {
  try {
    const parts = fen.split(' ');
    if (parts.length < 4) return fen;
    let castling = parts[2];
    if (castling === '-') castling = '';
    if (enabled) {
      if (!castling.includes(flag)) {
        const order = ['K', 'Q', 'k', 'q'];
        const newFlags = order.filter(f => castling.includes(f) || f === flag).join('');
        castling = newFlags || '-';
      }
    } else {
      castling = castling.replace(flag, '');
      if (!castling) castling = '-';
    }
    parts[2] = castling;
    return parts.join(' ');
  } catch {
    return fen;
  }
}

function toggleFenTurn(fen: string, newTurn?: 'w' | 'b'): string {
  try {
    const parts = fen.split(' ');
    if (parts.length < 2) return fen;
    parts[1] = newTurn ? newTurn : (parts[1] === 'w' ? 'b' : 'w');
    return parts.join(' ');
  } catch {
    return fen;
  }
}

// ─── Helper: win % from centipawns (Lichess formula) ───
function cpToWinPct(cp: number): number {
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
}

export const ChessHelperPage: React.FC<ChessHelperPageProps> = ({
  initialFen,
  onNavigateGameReview
}) => {
  // ── Input mode & FEN ──────────────────────────────────────────────────────
  const [inputMode, setInputMode] = useState<InputMode>('fen');
  const [currentFen, setCurrentFen] = useState<string>(
    initialFen || START_FEN
  );
  const [playerColor, setPlayerColor] = useState<PlayerColor>('white');

  // ── Next Chess Move Calculator & Setup Mode ──────────────────────────────
  const [boardMode, setBoardMode] = useState<'play' | 'setup'>('play');
  const [selectedPalettePiece, setSelectedPalettePiece] = useState<string | null>(null);
  const [moveHistory, setMoveHistory] = useState<string[]>([
    initialFen || START_FEN
  ]);
  const [historyIndex, setHistoryIndex] = useState<number>(0);
  const [clickedSquare, setClickedSquare] = useState<string | null>(null);
  const [autoReply, setAutoReply] = useState<boolean>(false);
  const [isComputerThinking, setIsComputerThinking] = useState<boolean>(false);

  // ── Image upload ──────────────────────────────────────────────────────────
  const [detectedResult, setDetectedResult] = useState<DetectionResult | null>(null);
  const [imageProcessing, setImageProcessing] = useState(false);
  const [detectedSideToMove, setDetectedSideToMove] = useState<'w' | 'b'>('w');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── FEN input ─────────────────────────────────────────────────────────────
  const [fenInputValue, setFenInputValue] = useState<string>(currentFen);
  const [fenError, setFenError] = useState<string | null>(null);
  const fenDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── PGN input ─────────────────────────────────────────────────────────────
  const [pgnInputValue, setPgnInputValue] = useState<string>('');
  const [pgnMoves, setPgnMoves] = useState<Array<{ ply: number; san: string; fen: string }>>([]);
  const [selectedPgnPly, setSelectedPgnPly] = useState<number>(0);
  const [pgnError, setPgnError] = useState<string | null>(null);

  // ── Real-time engine state ─────────────────────────────────────────────────
  const [liveUpdates, setLiveUpdates] = useState<ProgressUpdate[]>([]);
  const [bestMoveResult, setBestMoveResult] = useState<BestMoveResult | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchDepth, setSearchDepth] = useState(0);
  const [targetDepth, setTargetDepth] = useState<14 | 20 | 26>(20);

  // ── Server-API fallback state ──────────────────────────────────────────────
  const [serverResult, setServerResult] = useState<PositionAnalysisResult | null>(null);
  const [serverAnalyzing, setServerAnalyzing] = useState(false);
  const [useServerMode, setUseServerMode] = useState(false);

  // ── Differentiation Features State ────────────────────────────────────────
  // Feature 2 & 8: Why this move & Explanation Level
  const [explanationLevel, setExplanationLevel] = useState<ExplanationLevel>('intermediate');
  const [moveExplanation, setMoveExplanation] = useState<string | null>(null);
  const [loadingExplanation, setLoadingExplanation] = useState(false);

  // Feature 3: Compare Moves
  const [compareModalOpen, setCompareModalOpen] = useState(false);
  const [compareMovesList, setCompareMovesList] = useState<string[]>([]);
  const [compareCustomInput, setCompareCustomInput] = useState('');
  const [compareResult, setCompareResult] = useState<CompareMovesResult | null>(null);
  const [comparingMoves, setComparingMoves] = useState(false);

  // Feature 4: What-If Exploration
  const [whatIfModalOpen, setWhatIfModalOpen] = useState(false);
  const [whatIfMoveInput, setWhatIfMoveInput] = useState('');
  const [whatIfResult, setWhatIfResult] = useState<WhatIfResult | null>(null);
  const [analyzingWhatIf, setAnalyzingWhatIf] = useState(false);

  // Feature 9 & 10: Saved Positions & Sharing
  const [savedPositionId, setSavedPositionId] = useState<string | null>(null);
  const [shareToast, setShareToast] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // ── Display / navigation ──────────────────────────────────────────────────
  const [displayFen, setDisplayFen] = useState<string>(currentFen);
  const [selectedMoveRank, setSelectedMoveRank] = useState<number>(1);
  const [variationStep, setVariationStep] = useState<number>(0);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [showExplanation, setShowExplanation] = useState(false);
  const [isMuted, setIsMuted] = useState(!audioManager.getSettings().masterEnabled);
  const [fenCopied, setFenCopied] = useState(false);

  const abortControllerRef = useRef<AbortController | null>(null);

  // ── Board orientation = player color ─────────────────────────────────────
  const boardOrientation = playerColor;

  // ── Derived: what color is to move in this FEN ───────────────────────────
  const fenSideToMove = useMemo(() => currentFen.split(' ')[1] as 'w' | 'b', [currentFen]);

  // ── Reset on new position ─────────────────────────────────────────────────
  useEffect(() => {
    setDisplayFen(currentFen);
    setVariationStep(0);
    setLiveUpdates([]);
    setBestMoveResult(null);
    setServerResult(null);
    setShowExplanation(false);
  }, [currentFen]);

  // ── Handle initialFen prop ────────────────────────────────────────────────
  useEffect(() => {
    if (initialFen) {
      setCurrentFen(initialFen);
      setFenInputValue(initialFen);
      setDisplayFen(initialFen);
      startAnalysis(initialFen);
    }
  }, [initialFen]);

  // ═══════════════════════════════════════════════════════════════════════════
  // REAL-TIME ENGINE
  // ═══════════════════════════════════════════════════════════════════════════
  // STOCKFISH 18 POSITION ANALYSIS
  // ═══════════════════════════════════════════════════════════════════════════
  const startAnalysis = useCallback(async (fenOverride?: string) => {
    const fen = fenOverride || currentFen;
    try { new Chess(fen); } catch {
      setAnalysisError('Invalid FEN position.');
      return;
    }
    setAnalysisError(null);
    setLiveUpdates([]);
    setBestMoveResult(null);
    setIsSearching(true);
    setServerAnalyzing(true);
    setSearchDepth(0);
    setVariationStep(0);
    setSelectedMoveRank(1);

    if (abortControllerRef.current) abortControllerRef.current.abort();
    const ctrl = new AbortController();
    abortControllerRef.current = ctrl;

    try {
      const result = await api.analyzePosition(fen, targetDepth, 3, ctrl.signal);
      setServerResult(result);
      setSearchDepth(result.depth);
      if (result.explanation) {
        setMoveExplanation(result.explanation);
      }
      // Play audio cue
      if (!isMuted && result.bestMoveSan) {
        const san = result.bestMoveSan;
        if (san.includes('#')) audioManager.play('checkmate');
        else if (san.includes('+')) audioManager.play('check');
        else if (san.includes('x')) audioManager.play('capture');
        else audioManager.play('best');
      }
    } catch (err: any) {
      if (!err.message?.includes('cancel') && !err.name?.includes('Abort')) {
        setAnalysisError(err.message || 'Position analysis failed');
      }
    } finally {
      setIsSearching(false);
      setServerAnalyzing(false);
    }
  }, [currentFen, isMuted, targetDepth]);

  const stopAnalysis = () => {
    if (abortControllerRef.current) abortControllerRef.current.abort();
    setIsSearching(false);
    setServerAnalyzing(false);
    api.cancelPositionAnalysis();
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // DIFFERENTIATION FEATURE HANDLERS
  // ═══════════════════════════════════════════════════════════════════════════
  // Feature 2 & 8: Explain Move with Explanation Level
  const handleExplainMove = async (lvl: ExplanationLevel = explanationLevel) => {
    if (!currentBestMove) return;
    setLoadingExplanation(true);
    setExplanationLevel(lvl);
    try {
      const res = await api.explainMove({
        fen: currentFen,
        bestMove: currentBestMove.san,
        evalCp: currentEval?.cp ?? 0,
        level: lvl
      });
      setMoveExplanation(res.explanation);
      setShowExplanation(true);
    } catch (err) {
      setMoveExplanation('Stockfish 18 finds this move maximizes positional activity and king safety while preventing tactical counterplay.');
      setShowExplanation(true);
    } finally {
      setLoadingExplanation(false);
    }
  };

  // Feature 3: Compare Moves
  const handleOpenCompare = () => {
    const initialMoves: string[] = [];
    topMovesList.forEach(m => {
      const san = m.pvSan?.[0] || m.pv?.[0];
      if (san && !initialMoves.includes(san) && initialMoves.length < 3) {
        initialMoves.push(san);
      }
    });
    setCompareMovesList(initialMoves);
    setCompareResult(null);
    setCompareModalOpen(true);
  };

  const handleToggleCompareMove = (moveSan: string) => {
    setCompareMovesList(prev => {
      if (prev.includes(moveSan)) {
        return prev.filter(m => m !== moveSan);
      } else {
        if (prev.length >= 3) return [...prev.slice(1), moveSan];
        return [...prev, moveSan];
      }
    });
  };

  const handleAddCustomCompareMove = () => {
    const trimmed = compareCustomInput.trim();
    if (!trimmed) return;
    if (!compareMovesList.includes(trimmed)) {
      if (compareMovesList.length >= 3) {
        setCompareMovesList([...compareMovesList.slice(1), trimmed]);
      } else {
        setCompareMovesList([...compareMovesList, trimmed]);
      }
    }
    setCompareCustomInput('');
  };

  const handleRunCompare = async () => {
    if (compareMovesList.length < 2) return;
    setComparingMoves(true);
    try {
      const res = await api.compareMoves({
        fen: currentFen,
        moves: compareMovesList,
        depth: targetDepth
      });
      setCompareResult(res);
    } catch (err: any) {
      console.error('Failed to compare moves:', err);
    } finally {
      setComparingMoves(false);
    }
  };

  // Feature 4: What-If Exploration
  const handleOpenWhatIf = (initialMove?: string) => {
    setWhatIfMoveInput(initialMove || '');
    setWhatIfResult(null);
    setWhatIfModalOpen(true);
  };

  const handleRunWhatIf = async (moveOverride?: string) => {
    const move = moveOverride || whatIfMoveInput.trim();
    if (!move) return;
    setAnalyzingWhatIf(true);
    try {
      const res = await api.analyzeWhatIf({
        fen: currentFen,
        alternativeMove: move,
        depth: targetDepth
      });
      setWhatIfResult(res);
    } catch (err: any) {
      console.error('Failed to analyze what-if:', err);
    } finally {
      setAnalyzingWhatIf(false);
    }
  };

  // Feature 9 & 10: Save & Share Position
  const handleSavePosition = async () => {
    try {
      setIsSaving(true);
      const side = currentFen.split(' ')[1] === 'w' ? 'White' : 'Black';
      const res = await api.savePosition({
        fen: currentFen,
        title: `Position: ${side} to move`,
        best_move: currentBestMove?.uci,
        best_move_san: currentBestMove?.san,
        evaluation: currentEval?.cp ?? 0,
        tags: ['helper', side.toLowerCase()]
      });
      setSavedPositionId(res.id);
      setShareToast('Position saved to Saved Positions!');
      setTimeout(() => setShareToast(null), 3500);
    } catch (err) {
      console.error('Failed to save position:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSharePosition = async () => {
    try {
      let id = savedPositionId;
      if (!id) {
        setIsSaving(true);
        const side = currentFen.split(' ')[1] === 'w' ? 'White' : 'Black';
        const res = await api.savePosition({
          fen: currentFen,
          title: `Position: ${side} to move`,
          best_move: currentBestMove?.uci,
          best_move_san: currentBestMove?.san,
          evaluation: currentEval?.cp ?? 0,
          tags: ['shared']
        });
        id = res.id;
        setSavedPositionId(id);
        setIsSaving(false);
      }
      const shareUrl = `${window.location.origin}/chess-helper/position/${id}`;
      await navigator.clipboard.writeText(shareUrl);
      setShareToast('Shareable link copied to clipboard!');
      setTimeout(() => setShareToast(null), 3500);
    } catch (err) {
      console.error('Failed to share position:', err);
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // IMAGE INPUT
  // ═══════════════════════════════════════════════════════════════════════════
  const handleImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      setAnalysisError('Unsupported image format. Use PNG, JPG, or WEBP.');
      return;
    }
    try {
      setImageProcessing(true);
      setAnalysisError(null);
      const result = await ChessImageDetector.detectFromImage(file);
      setDetectedResult(result);
      setDetectedSideToMove(result.sideToMove || 'w');
    } catch (err: any) {
      setAnalysisError(err.message || 'Failed to detect chessboard in image.');
    } finally {
      setImageProcessing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleConfirmDetectedPosition = () => {
    if (!detectedResult) return;
    const parts = detectedResult.fen.split(' ');
    parts[1] = detectedSideToMove;
    const finalFen = parts.join(' ');
    setCurrentFen(finalFen);
    setFenInputValue(finalFen);
    setDetectedResult(null);
    startAnalysis(finalFen);
  };

  const handleEditDetectedPosition = () => {
    if (!detectedResult) return;
    const parts = detectedResult.fen.split(' ');
    parts[1] = detectedSideToMove;
    setCurrentFen(parts.join(' '));
    setDetectedResult(null);
    setInputMode('editor');
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // FEN INPUT (auto-analyze on paste)
  // ═══════════════════════════════════════════════════════════════════════════
  const handleFenChange = (val: string) => {
    setFenInputValue(val);
    setFenError(null);
    if (fenDebounceRef.current) clearTimeout(fenDebounceRef.current);
    fenDebounceRef.current = setTimeout(() => {
      try {
        new Chess(val.trim());
        setFenError(null);
        setCurrentFen(val.trim());
        startAnalysis(val.trim());
      } catch {
        setFenError('Invalid FEN string');
      }
    }, 600);
  };

  const handleLoadFen = () => {
    if (fenDebounceRef.current) clearTimeout(fenDebounceRef.current);
    try {
      new Chess(fenInputValue.trim());
      setFenError(null);
      setCurrentFen(fenInputValue.trim());
      startAnalysis(fenInputValue.trim());
    } catch {
      setFenError('Invalid FEN string');
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // PGN INPUT
  // ═══════════════════════════════════════════════════════════════════════════
  const handleLoadPgn = () => {
    try {
      const chess = new Chess();
      chess.loadPgn(pgnInputValue.trim());
      const history = chess.history({ verbose: true });
      if (history.length === 0) { setPgnError('No moves found.'); return; }
      setPgnError(null);
      const replay = new Chess();
      const moves: Array<{ ply: number; san: string; fen: string }> = [];
      history.forEach((m, idx) => {
        replay.move(m);
        moves.push({ ply: idx + 1, san: m.san, fen: replay.fen() });
      });
      setPgnMoves(moves);
      const lastPly = moves.length;
      setSelectedPgnPly(lastPly);
      const targetFen = moves[lastPly - 1].fen;
      setCurrentFen(targetFen);
      startAnalysis(targetFen);
    } catch {
      setPgnError('Invalid PGN.');
    }
  };

  const handleSelectPgnMove = (ply: number) => {
    setSelectedPgnPly(ply);
    const item = pgnMoves.find(m => m.ply === ply);
    if (item) {
      setCurrentFen(item.fen);
      startAnalysis(item.fen);
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // VARIATION STEPPING
  // ═══════════════════════════════════════════════════════════════════════════
  const activePvMoves = useMemo(() => {
    const topMoves = bestMoveResult?.topMoves || liveUpdates;
    const selected = topMoves.find(m => m.multiPvRank === selectedMoveRank);
    return selected?.pv || topMoves[0]?.pv || serverResult?.bestLine.uci || [];
  }, [bestMoveResult, liveUpdates, selectedMoveRank, serverResult]);

  const activePvSan = useMemo(() => {
    const topMoves = bestMoveResult?.topMoves || liveUpdates;
    const selected = topMoves.find(m => m.multiPvRank === selectedMoveRank);
    return selected?.pvSan || topMoves[0]?.pvSan || serverResult?.bestLine.san || [];
  }, [bestMoveResult, liveUpdates, selectedMoveRank, serverResult]);

  const handleVariationStep = useCallback((newStep: number) => {
    const clamped = Math.max(0, Math.min(newStep, activePvMoves.length));
    setVariationStep(clamped);
    if (clamped === 0) { setDisplayFen(currentFen); return; }
    try {
      const chess = new Chess(currentFen);
      for (let i = 0; i < clamped; i++) {
        const uci = activePvMoves[i];
        if (!uci || uci.length < 4) break;
        chess.move({ from: uci.substring(0, 2) as any, to: uci.substring(2, 4) as any, promotion: uci[4] as any });
      }
      setDisplayFen(chess.fen());
    } catch { setDisplayFen(currentFen); }
  }, [activePvMoves, currentFen]);

  // ═══════════════════════════════════════════════════════════════════════════
  // ARROWS for Chessboard
  // ═══════════════════════════════════════════════════════════════════════════
  const arrows = useMemo(() => {
    const arr: Array<{ startSquare: string; endSquare: string; color: string }> = [];
    const topMoves = bestMoveResult?.topMoves || liveUpdates;

    if (variationStep === 0 && topMoves.length > 0) {
      // Show all MultiPV moves as arrows (ranked)
      topMoves.forEach((m, idx) => {
        if (!m.pv?.[0] || m.pv[0].length < 4) return;
        const uci = m.pv[0];
        const from = uci.substring(0, 2);
        const to = uci.substring(2, 4);
        const isSelected = m.multiPvRank === selectedMoveRank;
        const colors = ['rgba(6, 182, 212, 0.9)', 'rgba(99, 102, 241, 0.7)', 'rgba(139, 92, 246, 0.5)'];
        arr.push({ startSquare: from, endSquare: to, color: isSelected ? colors[0] : colors[Math.min(idx, 2)] });
      });
    } else if (variationStep > 0 && activePvMoves[variationStep - 1]) {
      const uci = activePvMoves[variationStep - 1];
      if (uci.length >= 4) {
        arr.push({
          startSquare: uci.substring(0, 2),
          endSquare: uci.substring(2, 4),
          color: 'rgba(108, 255, 147, 0.85)'
        });
      }
    }
    return arr;
  }, [bestMoveResult, liveUpdates, variationStep, selectedMoveRank, activePvMoves]);

  // ═══════════════════════════════════════════════════════════════════════════
  // DERIVED: best move from realtime or server
  // ═══════════════════════════════════════════════════════════════════════════
  const currentBestMove = useMemo(() => {
    if (bestMoveResult) return { san: bestMoveResult.san, uci: bestMoveResult.uci };
    if (liveUpdates[0]) {
      const pvSan = liveUpdates[0].pvSan?.[0] || liveUpdates[0].pv?.[0] || '';
      return { san: pvSan, uci: liveUpdates[0].pv?.[0] || '' };
    }
    if (serverResult) return { san: serverResult.bestMoveSan, uci: serverResult.bestMove };
    return null;
  }, [bestMoveResult, liveUpdates, serverResult]);

  const currentEval = useMemo(() => {
    const topMoves = bestMoveResult?.topMoves || liveUpdates;
    const top = topMoves[0];
    if (!top && !serverResult) return null;
    if (top?.scoreMate !== undefined) {
      const sign = top.scoreMate > 0 ? '+' : '';
      return { text: `M${sign}${top.scoreMate}`, cp: top.scoreCp, isMate: true };
    }
    const cp = top?.scoreCp ?? serverResult?.evaluation.scoreCp ?? 0;
    const pawns = (cp / 100).toFixed(2);
    return { text: cp >= 0 ? `+${pawns}` : pawns, cp, isMate: false };
  }, [bestMoveResult, liveUpdates, serverResult]);

  // Eval bar: 0 = all black, 100 = all white, 50 = even
  const evalBarPct = useMemo(() => {
    if (!currentEval) return 50;
    if (currentEval.isMate) return currentEval.cp > 0 ? 95 : 5;
    return Math.max(5, Math.min(95, cpToWinPct(currentEval.cp)));
  }, [currentEval]);

  const topMovesList = useMemo(() => {
    const tm = bestMoveResult?.topMoves || liveUpdates;
    if (tm.length > 0) return tm;
    if (serverResult?.topMoves) return serverResult.topMoves.map(m => ({
      multiPvRank: m.rank,
      depth: m.depth,
      scoreCp: m.scoreCp,
      scoreMate: m.scoreMate,
      pv: m.pv,
      pvSan: m.pvSan,
      nodes: 0,
      timeMs: 0
    } as ProgressUpdate));
    return [];
  }, [bestMoveResult, liveUpdates, serverResult]);

  const isAnalyzing = isSearching || serverAnalyzing;
  const hasResults = !!currentBestMove;

  const toggleMute = () => {
    const cur = audioManager.getSettings().masterEnabled;
    audioManager.setMasterMuted(cur);
    setIsMuted(cur);
  };

  const copyFen = async () => {
    try { await navigator.clipboard.writeText(currentFen); setFenCopied(true); setTimeout(() => setFenCopied(false), 1500); } catch {}
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // NEXT CHESS MOVE CALCULATOR & BOARD HANDLERS
  // ═══════════════════════════════════════════════════════════════════════════
  const pushNewPosition = useCallback((newFen: string) => {
    setMoveHistory(prev => {
      const next = prev.slice(0, historyIndex + 1);
      return [...next, newFen];
    });
    setHistoryIndex(prev => prev + 1);
    setCurrentFen(newFen);
    setFenInputValue(newFen);
    setDisplayFen(newFen);
    setVariationStep(0);
  }, [historyIndex]);

  // Computer Auto-Reply (play against Stockfish 18)
  const calculateAndPlayReply = useCallback(async (fen: string) => {
    setIsComputerThinking(true);
    try {
      const res = await api.analyzePosition(fen, 14, 1);
      setIsComputerThinking(false);
      const chess = new Chess(fen);
      let moveRes = null;
      if (res.bestMoveSan) {
        try { moveRes = chess.move(res.bestMoveSan); } catch {}
      }
      if (!moveRes && res.bestMove) {
        const from = res.bestMove.substring(0, 2);
        const to = res.bestMove.substring(2, 4);
        const promo = res.bestMove.length > 4 ? res.bestMove.substring(4, 5) : undefined;
        try { moveRes = chess.move({ from, to, promotion: promo as any }); } catch {}
      }
      if (moveRes) {
        const replyFen = chess.fen();
        pushNewPosition(replyFen);
        if (!isMuted) {
          if (moveRes.san.includes('#')) audioManager.play('checkmate');
          else if (moveRes.san.includes('+')) audioManager.play('check');
          else if (moveRes.flags.includes('c') || moveRes.flags.includes('e')) audioManager.play('capture');
          else audioManager.play('move');
        }
        startAnalysis(replyFen);
      }
    } catch (err) {
      console.error('Auto reply failed', err);
      setIsComputerThinking(false);
    }
  }, [pushNewPosition, isMuted, startAnalysis]);

  // Make the top engine move directly onto the board
  const handleMakeBestMove = useCallback(() => {
    if (!currentBestMove?.san && !currentBestMove?.uci) return;
    try {
      const chess = new Chess(currentFen);
      let moveRes = null;
      if (currentBestMove.san) {
        try { moveRes = chess.move(currentBestMove.san); } catch {}
      }
      if (!moveRes && currentBestMove.uci) {
        const from = currentBestMove.uci.substring(0, 2);
        const to = currentBestMove.uci.substring(2, 4);
        const promo = currentBestMove.uci.length > 4 ? currentBestMove.uci.substring(4, 5) : undefined;
        try { moveRes = chess.move({ from, to, promotion: promo as any }); } catch {}
      }
      if (moveRes) {
        const newFen = chess.fen();
        pushNewPosition(newFen);
        if (!isMuted) {
          if (moveRes.san.includes('#')) audioManager.play('checkmate');
          else if (moveRes.san.includes('+')) audioManager.play('check');
          else if (moveRes.flags.includes('c') || moveRes.flags.includes('e')) audioManager.play('capture');
          else audioManager.play('best');
        }
        if (autoReply) {
          calculateAndPlayReply(newFen);
        } else {
          startAnalysis(newFen);
        }
      }
    } catch (err) {
      console.error('Failed to make move:', err);
    }
  }, [currentBestMove, currentFen, isMuted, autoReply, pushNewPosition, calculateAndPlayReply, startAnalysis]);

  // Play a specific candidate move
  const handlePlayCandidateMove = useCallback((moveSanOrUci: string) => {
    try {
      const chess = new Chess(currentFen);
      let moveRes = null;
      try { moveRes = chess.move(moveSanOrUci); } catch {}
      if (!moveRes && moveSanOrUci.length >= 4) {
        const from = moveSanOrUci.substring(0, 2);
        const to = moveSanOrUci.substring(2, 4);
        const promo = moveSanOrUci.length > 4 ? moveSanOrUci.substring(4, 5) : undefined;
        try { moveRes = chess.move({ from, to, promotion: promo as any }); } catch {}
      }
      if (moveRes) {
        const newFen = chess.fen();
        pushNewPosition(newFen);
        if (!isMuted) {
          if (moveRes.san.includes('#')) audioManager.play('checkmate');
          else if (moveRes.san.includes('+')) audioManager.play('check');
          else if (moveRes.flags.includes('c') || moveRes.flags.includes('e')) audioManager.play('capture');
          else audioManager.play('move');
        }
        if (autoReply) {
          calculateAndPlayReply(newFen);
        } else {
          startAnalysis(newFen);
        }
      }
    } catch (err) {
      console.error('Failed to play candidate move:', err);
    }
  }, [currentFen, isMuted, autoReply, pushNewPosition, calculateAndPlayReply, startAnalysis]);

  // Drag-and-drop on board
  const handlePieceDrop = useCallback((args: any, secondArg?: any): boolean => {
    let sourceSquare: string;
    let targetSquare: string;

    if (typeof args === 'object' && args !== null && 'sourceSquare' in args) {
      sourceSquare = args.sourceSquare;
      targetSquare = args.targetSquare;
    } else {
      sourceSquare = args;
      targetSquare = secondArg;
    }

    if (!sourceSquare) return false;
    if (sourceSquare === targetSquare) return false;

    // In Setup Mode: freeform move or off-board removal
    if (boardMode === 'setup') {
      try {
        const chess = new Chess(currentFen);
        const piece = chess.get(sourceSquare as any);
        if (!piece) return false;
        chess.remove(sourceSquare as any);
        if (targetSquare && targetSquare !== 'off-board') {
          chess.put(piece, targetSquare as any);
        }
        const newFen = chess.fen();
        pushNewPosition(newFen);
        startAnalysis(newFen);
        return true;
      } catch {
        return false;
      }
    }

    // In Play Mode: standard legal chess move
    try {
      const chess = new Chess(currentFen);
      const move = chess.move({
        from: sourceSquare,
        to: targetSquare,
        promotion: 'q'
      });
      if (!move) return false;

      const newFen = chess.fen();
      pushNewPosition(newFen);

      if (!isMuted) {
        if (move.san.includes('#')) audioManager.play('checkmate');
        else if (move.san.includes('+')) audioManager.play('check');
        else if (move.flags.includes('c') || move.flags.includes('e')) audioManager.play('capture');
        else audioManager.play('move');
      }

      if (autoReply) {
        calculateAndPlayReply(newFen);
      } else {
        startAnalysis(newFen);
      }
      return true;
    } catch {
      return false;
    }
  }, [boardMode, currentFen, pushNewPosition, isMuted, autoReply, calculateAndPlayReply, startAnalysis]);

  // Click square for piece placement in setup or click-to-move in play
  const handleSquareClick = useCallback((args: any) => {
    const square = typeof args === 'string' ? args : (args?.square || args?.sourceSquare);
    if (!square) return;

    // In Setup mode
    if (boardMode === 'setup') {
      if (selectedPalettePiece === 'trash') {
        try {
          const chess = new Chess(currentFen);
          chess.remove(square as any);
          const newFen = chess.fen();
          pushNewPosition(newFen);
          startAnalysis(newFen);
        } catch {}
        return;
      }
      if (selectedPalettePiece) {
        try {
          const chess = new Chess(currentFen);
          const color = selectedPalettePiece[0] as 'w' | 'b';
          const type = selectedPalettePiece[1].toLowerCase() as 'p'|'n'|'b'|'r'|'q'|'k';
          chess.put({ type, color }, square as any);
          const newFen = chess.fen();
          pushNewPosition(newFen);
          startAnalysis(newFen);
        } catch {}
        return;
      }
    }

    // In Play mode: click-to-move
    if (boardMode === 'play') {
      if (!clickedSquare) {
        try {
          const chess = new Chess(currentFen);
          const piece = chess.get(square as any);
          if (piece && piece.color === chess.turn()) {
            setClickedSquare(square);
          }
        } catch {}
      } else {
        if (clickedSquare === square) {
          setClickedSquare(null);
          return;
        }
        try {
          const chess = new Chess(currentFen);
          const move = chess.move({
            from: clickedSquare,
            to: square,
            promotion: 'q'
          });
          if (move) {
            const newFen = chess.fen();
            pushNewPosition(newFen);
            setClickedSquare(null);
            if (!isMuted) {
              if (move.san.includes('#')) audioManager.play('checkmate');
              else if (move.san.includes('+')) audioManager.play('check');
              else if (move.flags.includes('c') || move.flags.includes('e')) audioManager.play('capture');
              else audioManager.play('move');
            }
            if (autoReply) {
              calculateAndPlayReply(newFen);
            } else {
              startAnalysis(newFen);
            }
            return;
          }
        } catch {}

        try {
          const chess = new Chess(currentFen);
          const piece = chess.get(square as any);
          if (piece && piece.color === chess.turn()) {
            setClickedSquare(square);
            return;
          }
        } catch {}
        setClickedSquare(null);
      }
    }
  }, [boardMode, selectedPalettePiece, clickedSquare, currentFen, pushNewPosition, isMuted, autoReply, calculateAndPlayReply, startAnalysis]);

  // History Navigation: Undo / Redo
  const handleUndo = useCallback(() => {
    if (historyIndex > 0) {
      const targetIdx = historyIndex - 1;
      const targetFen = moveHistory[targetIdx];
      if (targetFen) {
        setHistoryIndex(targetIdx);
        setCurrentFen(targetFen);
        setFenInputValue(targetFen);
        setDisplayFen(targetFen);
        setVariationStep(0);
        startAnalysis(targetFen);
        if (!isMuted) audioManager.play('move');
      }
    }
  }, [historyIndex, moveHistory, isMuted, startAnalysis]);

  const handleRedo = useCallback(() => {
    if (historyIndex < moveHistory.length - 1) {
      const targetIdx = historyIndex + 1;
      const targetFen = moveHistory[targetIdx];
      if (targetFen) {
        setHistoryIndex(targetIdx);
        setCurrentFen(targetFen);
        setFenInputValue(targetFen);
        setDisplayFen(targetFen);
        setVariationStep(0);
        startAnalysis(targetFen);
        if (!isMuted) audioManager.play('move');
      }
    }
  }, [historyIndex, moveHistory, isMuted, startAnalysis]);

  // Board presets
  const handleResetStart = useCallback(() => {
    pushNewPosition(START_FEN);
    startAnalysis(START_FEN);
    if (!isMuted) audioManager.play('move');
  }, [pushNewPosition, isMuted, startAnalysis]);

  const handleClearKingsOnly = useCallback(() => {
    pushNewPosition(KINGS_ONLY_FEN);
    startAnalysis(KINGS_ONLY_FEN);
    if (!isMuted) audioManager.play('move');
  }, [pushNewPosition, isMuted, startAnalysis]);

  const handleRotateBoard = useCallback(() => {
    setPlayerColor(prev => prev === 'white' ? 'black' : 'white');
  }, []);

  const handleToggleSideToMove = useCallback((newSide?: 'w' | 'b') => {
    const updatedFen = toggleFenTurn(currentFen, newSide);
    try {
      new Chess(updatedFen);
      pushNewPosition(updatedFen);
      startAnalysis(updatedFen);
    } catch {
      setShareToast('Cannot change turn in this position');
      setTimeout(() => setShareToast(null), 2000);
    }
  }, [currentFen, pushNewPosition, startAnalysis]);

  const handleToggleCastling = useCallback((flag: 'K' | 'Q' | 'k' | 'q') => {
    const parts = currentFen.split(' ');
    const curCastling = parts[2] || '-';
    const isEnabled = curCastling.includes(flag);
    const updatedFen = updateFenCastling(currentFen, flag, !isEnabled);
    try {
      new Chess(updatedFen);
      pushNewPosition(updatedFen);
      startAnalysis(updatedFen);
    } catch {}
  }, [currentFen, pushNewPosition, startAnalysis]);

  const castlingRights = useMemo(() => currentFen.split(' ')[2] || '-', [currentFen]);

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <div className="w-full max-w-[1550px] mx-auto px-3 sm:px-5 lg:px-6 py-4 font-sans text-white">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="bg-[#16181D] border border-[#242933] rounded-2xl px-5 py-3.5 mb-4 shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#6CFF93] flex items-center justify-center border border-[#5FE683] shadow-xs">
            <Zap className="w-5 h-5 text-[#1A1919]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-black tracking-tight text-white uppercase">Chess Helper</h1>
              <span className="text-[10px] font-black uppercase text-[#6CFF93] bg-[#6CFF93]/20 px-2 py-0.5 rounded-full border border-[#6CFF93]/30">
                Stockfish 18
              </span>
              {isSearching && (
                <span className="text-[10px] font-black uppercase text-cyan-400 bg-cyan-400/10 px-2 py-0.5 rounded-full border border-cyan-400/20 animate-pulse">
                  ⚡ LIVE Depth {searchDepth}
                </span>
              )}
            </div>
            <p className="text-xs text-zinc-400 font-medium">
              Instant best-move · Real-time streaming engine · Upload image or paste FEN/PGN
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Color selector */}
          <div className="flex items-center gap-1 bg-[#1B1E26] p-1 rounded-xl border border-[#2E3646]">
            <button
              type="button"
              onClick={() => setPlayerColor('white')}
              className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 ${
                playerColor === 'white'
                  ? 'bg-zinc-100 text-black shadow-sm'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              ◻ White
            </button>
            <button
              type="button"
              onClick={() => setPlayerColor('black')}
              className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 ${
                playerColor === 'black'
                  ? 'bg-[#111] text-white border border-[#444] shadow-sm'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              ◼ Black
            </button>
          </div>

          {/* Feature 14: Analysis Depth Selector */}
          <div className="flex items-center gap-1 bg-[#1B1E26] p-1 rounded-xl border border-[#2E3646]">
            <span className="text-[10px] font-black uppercase text-zinc-400 px-1.5 flex items-center gap-1">
              <SlidersHorizontal className="w-3 h-3" />
              <span className="hidden sm:inline">Depth</span>
            </span>
            {([
              { label: 'Quick (14)', depth: 14 as const },
              { label: 'Balanced (20)', depth: 20 as const },
              { label: 'Deep (26)', depth: 26 as const },
            ]).map(d => (
              <button
                key={d.depth}
                type="button"
                onClick={() => {
                  setTargetDepth(d.depth);
                  startAnalysis(currentFen);
                }}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
                  targetDepth === d.depth
                    ? 'bg-cyan-500 text-black shadow-sm font-black'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>

          <button type="button" onClick={toggleMute}
            className={`p-2 rounded-xl border text-xs font-bold transition-all flex items-center gap-1.5 ${
              isMuted ? 'bg-rose-950/30 border-rose-900/40 text-rose-300' : 'bg-[#1F232B] hover:bg-[#282E3B] border-[#2E3646] text-zinc-300'
            }`}>
            {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4 text-[#6CFF93]" />}
          </button>

          {onNavigateGameReview && (
            <button type="button" onClick={onNavigateGameReview}
              className="px-3.5 py-2 rounded-xl bg-[#1F232B] hover:bg-[#282E3B] border border-[#2E3646] text-xs font-bold text-zinc-300 transition-all flex items-center gap-1.5">
              <span>Game Review</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Toast Notification */}
      {shareToast && (
        <div className="fixed bottom-6 right-6 z-50 bg-[#16181D] border border-[#6CFF93] text-[#6CFF93] px-4 py-3 rounded-xl shadow-2xl flex items-center gap-2.5 text-xs font-bold animate-in fade-in slide-in-from-bottom-2">
          <CheckCircle2 className="w-4 h-4 text-[#6CFF93]" />
          <span>{shareToast}</span>
        </div>
      )}

      {/* ── Input Mode Bar ──────────────────────────────────────────────────── */}
      <div className="bg-[#16181D] border border-[#242933] rounded-2xl p-2 mb-4 shadow-sm flex flex-wrap items-center gap-1.5">
        {[
          { mode: 'image' as InputMode, icon: <Upload className="w-3.5 h-3.5" />, label: 'Upload Image', onClick: () => { setInputMode('image'); fileInputRef.current?.click(); } },
          { mode: 'fen' as InputMode, icon: <FileCode className="w-3.5 h-3.5" />, label: 'Paste FEN', onClick: () => setInputMode('fen') },
          { mode: 'pgn' as InputMode, icon: <Layers className="w-3.5 h-3.5" />, label: 'Paste PGN', onClick: () => setInputMode('pgn') },
          { mode: 'editor' as InputMode, icon: <Edit3 className="w-3.5 h-3.5" />, label: 'Board Editor', onClick: () => setInputMode('editor') },
        ].map(({ mode, icon, label, onClick }) => (
          <button key={mode} type="button" onClick={onClick}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition-all ${
              inputMode === mode ? 'bg-[#6CFF93] text-[#1A1919] shadow-sm' : 'text-zinc-400 hover:text-white hover:bg-[#1F232B]'
            }`}
          >
            {icon}<span>{label}</span>
          </button>
        ))}
        <input type="file" ref={fileInputRef} onChange={handleImageFileChange} accept="image/png,image/jpeg,image/jpg,image/webp" className="hidden" />

        {/* Analyze / Stop buttons */}
        <div className="ml-auto flex items-center gap-2">
          {isAnalyzing ? (
            <button type="button" onClick={stopAnalysis}
              className="px-4 py-2 rounded-xl bg-rose-950/40 hover:bg-rose-900/60 border border-rose-900/40 text-rose-300 text-xs font-black transition-all flex items-center gap-1.5">
              <X className="w-3.5 h-3.5" /><span>Stop</span>
            </button>
          ) : (
            <button type="button" onClick={() => startAnalysis()}
              className="px-4 py-2 rounded-xl bg-[#6CFF93] hover:bg-[#5FE683] text-[#1A1919] text-xs font-black transition-all flex items-center gap-1.5 shadow-sm border border-[#5FE683]">
              <Play className="w-3.5 h-3.5 fill-current" /><span>Analyze</span>
            </button>
          )}
        </div>
      </div>

      {/* ── Input Panels ───────────────────────────────────────────────────── */}

      {/* FEATURE 1: ENHANCED IMAGE DETECTION CONFIRMATION PREVIEW */}
      {detectedResult && (
        <div className="bg-[#1B1E26] border border-cyan-500/40 rounded-2xl p-5 mb-4 shadow-xl space-y-4 animate-in fade-in">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2.5">
              <Sparkles className="w-5 h-5 text-cyan-400" />
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-black uppercase text-white tracking-wider">Position Detected</h3>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                    detectedResult.confidence >= 85
                      ? 'bg-emerald-950/40 text-emerald-300 border-emerald-800/40'
                      : 'bg-amber-950/40 text-amber-300 border-amber-800/40'
                  }`}>
                    {detectedResult.confidence}% confidence
                  </span>
                </div>
                <p className="text-xs text-zinc-300 mt-0.5">{detectedResult.message}</p>
              </div>
            </div>
            <button type="button" onClick={() => setDetectedResult(null)} className="text-zinc-400 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Low confidence warning if confidence < 85% */}
          {detectedResult.confidence < 85 && (
            <div className="bg-amber-950/30 border border-amber-500/40 rounded-xl p-3 text-xs text-amber-200 flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-amber-300">Confidence below 85%:</span>
                <p className="text-zinc-300 mt-0.5">
                  Some piece types or square alignments may require verification. Compare the cropped image with the detected digital board below, or click <strong>Edit in Board Editor</strong> to make adjustments.
                </p>
              </div>
            </div>
          )}

          {/* Dual Board Preview (Crop vs Recognized Digital Position) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-[#121316] p-4 rounded-xl border border-[#2E3646] items-center">
            {/* 1. Cropped Screenshot */}
            <div className="space-y-1.5 text-center">
              <span className="text-[10px] font-black uppercase text-zinc-400 tracking-wider block">Cropped Image</span>
              <div className="relative aspect-square max-w-[210px] mx-auto rounded-xl overflow-hidden border border-[#242933] bg-black flex items-center justify-center shadow-inner">
                {detectedResult.boardCropDataUrl
                  ? <img src={detectedResult.boardCropDataUrl} alt="Detected Board" className="w-full h-full object-contain" />
                  : <span className="text-xs text-zinc-500">No preview</span>}
              </div>
            </div>

            {/* 2. Recognized Digital Chessboard */}
            <div className="space-y-1.5 text-center">
              <span className="text-[10px] font-black uppercase text-cyan-400 tracking-wider block">Recognized Board</span>
              <div className="aspect-square max-w-[210px] mx-auto rounded-xl overflow-hidden border border-cyan-500/30 shadow-md">
                <Chessboard
                  options={{
                    position: detectedResult.fen,
                    boardOrientation: detectedSideToMove === 'w' ? 'white' : 'black',
                    allowDragging: false,
                    pieces: neoCustomPieces as any,
                    darkSquareStyle: { backgroundColor: '#769656' },
                    lightSquareStyle: { backgroundColor: '#eeeed2' }
                  }}
                />
              </div>
            </div>

            {/* 3. FEN & Side to Move Verification */}
            <div className="space-y-3">
              <div>
                <label className="block text-[10px] font-black uppercase text-zinc-400 tracking-wider mb-1">Detected FEN</label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={detectedResult.fen}
                    onChange={(e) => setDetectedResult({ ...detectedResult, fen: e.target.value })}
                    className="w-full px-3 py-2 bg-[#1B1E26] rounded-xl border border-[#2E3646] font-mono text-xs text-white focus:outline-none focus:border-cyan-400"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(detectedResult.fen);
                      setShareToast('FEN copied to clipboard!');
                      setTimeout(() => setShareToast(null), 2500);
                    }}
                    className="p-2 rounded-xl bg-[#1F232B] hover:bg-[#282E3B] border border-[#2E3646] text-zinc-300"
                    title="Copy FEN"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="bg-[#16181D] p-3 rounded-xl border border-[#242933] space-y-2">
                <span className="text-xs font-black text-white block">Side to move:</span>
                <div className="flex items-center gap-4">
                  {(['w', 'b'] as const).map(side => (
                    <label key={side} className="flex items-center gap-1.5 text-xs font-bold cursor-pointer">
                      <input
                        type="radio"
                        name="sideToMove"
                        checked={detectedSideToMove === side}
                        onChange={() => setDetectedSideToMove(side)}
                        className="accent-cyan-400"
                      />
                      <span>{side === 'w' ? '◻ White to move' : '◼ Black to move'}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 pt-1">
            <button
              type="button"
              onClick={handleConfirmDetectedPosition}
              className="px-5 py-2.5 rounded-xl bg-[#6CFF93] hover:bg-[#5FE683] text-[#1A1919] text-xs font-black transition-all flex items-center gap-2 shadow-sm border border-[#5FE683]"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>Analyze Detected Position</span>
            </button>
            <button
              type="button"
              onClick={handleEditDetectedPosition}
              className="px-4 py-2.5 rounded-xl bg-[#1F232B] hover:bg-[#282E3B] border border-[#2E3646] text-white text-xs font-bold transition-all flex items-center gap-2"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>Edit in Board Editor</span>
            </button>
            <button
              type="button"
              onClick={() => setDetectedResult(null)}
              className="px-3.5 py-2.5 rounded-xl text-zinc-400 hover:text-white text-xs font-bold transition-all"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* FEN INPUT */}
      {inputMode === 'fen' && (
        <div className="bg-[#16181D] border border-[#242933] rounded-2xl p-4 mb-4 shadow-sm space-y-2">
          <label className="block text-xs font-black uppercase tracking-wider text-zinc-400">Paste FEN — auto-analyzes</label>
          <div className="flex gap-2">
            <input type="text" value={fenInputValue}
              onChange={(e) => handleFenChange(e.target.value)}
              placeholder="Paste any FEN string here..."
              className="flex-1 px-3.5 py-2.5 rounded-xl bg-[#1B1E26] border border-[#2E3646] text-xs font-mono text-white focus:outline-none focus:border-cyan-500" />
            <button type="button" onClick={handleLoadFen}
              className="px-4 py-2.5 rounded-xl bg-[#1F232B] hover:bg-[#282E3B] border border-[#2E3646] text-white text-xs font-black transition-all shrink-0">
              Load &amp; Analyze
            </button>
          </div>
          {fenError && <div className="text-xs text-rose-400 flex items-center gap-1.5 font-bold"><AlertCircle className="w-3.5 h-3.5" />{fenError}</div>}
        </div>
      )}

      {/* PGN INPUT */}
      {inputMode === 'pgn' && (
        <div className="bg-[#16181D] border border-[#242933] rounded-2xl p-4 mb-4 shadow-sm space-y-3">
          <label className="block text-xs font-black uppercase tracking-wider text-zinc-400">Paste PGN</label>
          <textarea rows={3} value={pgnInputValue}
            onChange={(e) => { setPgnInputValue(e.target.value); setPgnError(null); }}
            placeholder="1. e4 e5 2. Nf3 Nc6 3. Bc4..."
            className="w-full px-3.5 py-2.5 rounded-xl bg-[#1B1E26] border border-[#2E3646] text-xs font-mono text-white focus:outline-none focus:border-cyan-500" />
          <div className="flex items-center justify-between">
            <button type="button" onClick={handleLoadPgn}
              className="px-5 py-2 rounded-xl bg-[#1F232B] hover:bg-[#282E3B] border border-[#2E3646] text-white text-xs font-black transition-all">
              Load Game
            </button>
            <span className="text-[11px] text-zinc-400">Click any move to analyze that position</span>
          </div>
          {pgnError && <div className="text-xs text-rose-400 flex items-center gap-1.5 font-bold"><AlertCircle className="w-3.5 h-3.5" />{pgnError}</div>}
          {pgnMoves.length > 0 && (
            <div className="p-3 bg-[#1B1E26] rounded-xl border border-[#242933] space-y-2">
              <span className="text-[10px] font-black uppercase tracking-wider text-zinc-400 block">Moves (click to jump)</span>
              <div className="flex flex-wrap gap-1 max-h-36 overflow-y-auto pr-1">
                {pgnMoves.map(m => (
                  <button key={m.ply} type="button" onClick={() => handleSelectPgnMove(m.ply)}
                    className={`px-2 py-1 rounded text-xs font-mono transition-all ${
                      selectedPgnPly === m.ply ? 'bg-cyan-500 text-black font-black' : 'bg-[#121316] text-zinc-300 hover:text-white border border-[#242933]'
                    }`}>
                    {m.ply % 2 === 1 ? `${Math.ceil(m.ply / 2)}. ` : ''}{m.san}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* BOARD EDITOR */}
      {inputMode === 'editor' && (
        <div className="mb-4">
          <BoardEditor
            initialFen={currentFen}
            onAnalyze={(fen) => {
              setCurrentFen(fen);
              setFenInputValue(fen);
              setInputMode('fen');
              startAnalysis(fen);
            }}
            onCancel={() => setInputMode('fen')}
          />
        </div>
      )}

      {/* Image processing loader */}
      {imageProcessing && (
        <div className="p-6 bg-[#16181D] border border-[#242933] rounded-2xl text-center space-y-2 mb-4">
          <RefreshCw className="w-6 h-6 animate-spin text-cyan-400 mx-auto" />
          <p className="text-xs font-bold text-zinc-300">Detecting chessboard...</p>
        </div>
      )}

      {/* Error */}
      {analysisError && (
        <div className="p-3.5 bg-rose-950/30 border border-rose-900/60 rounded-xl text-xs text-rose-300 flex items-center gap-2 mb-4">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" /><span>{analysisError}</span>
        </div>
      )}

      {/* ── MAIN 2-COLUMN LAYOUT ──────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">

        {/* LEFT: Board (7/12) */}
        <div className="lg:col-span-7 flex gap-3">
          {/* Eval bar */}
          <div className="flex flex-col items-center justify-between w-5 shrink-0 py-1">
            <div className="flex-1 w-3 rounded-full overflow-hidden bg-[#111] border border-[#2A2F3C] relative">
              {/* White portion at top */}
              <div className="w-full bg-zinc-100 transition-all duration-300 absolute top-0 left-0 right-0"
                style={{ height: `${100 - evalBarPct}%` }} />
              {/* Black portion at bottom */}
              <div className="w-full bg-[#111] absolute bottom-0 left-0 right-0"
                style={{ height: `${evalBarPct}%` }} />
            </div>
            <div className="mt-1 text-[9px] font-black text-zinc-400 rotate-90 whitespace-nowrap">EVAL</div>
          </div>

          {/* Board */}
          {/* Board */}
          <div className="flex-1 bg-[#16181D] border border-[#242933] rounded-2xl p-4 shadow-xl">
            {/* Board Header: Mode Switcher & FEN info */}
            <div className="flex flex-wrap items-center justify-between pb-3 border-b border-[#242933] gap-2 text-xs">
              <div className="flex items-center gap-1.5 bg-[#1B1E26] p-1 rounded-xl border border-[#2E3646]">
                <button
                  type="button"
                  onClick={() => setBoardMode('play')}
                  className={`px-3 py-1 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 ${
                    boardMode === 'play'
                      ? 'bg-cyan-500 text-black shadow-xs'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  <Play className="w-3 h-3 fill-current" />
                  <span>Play / Move</span>
                </button>
                <button
                  type="button"
                  onClick={() => setBoardMode('setup')}
                  className={`px-3 py-1 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 ${
                    boardMode === 'setup'
                      ? 'bg-[#6CFF93] text-[#1A1919] shadow-xs'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  <Edit3 className="w-3 h-3" />
                  <span>Setup Board</span>
                </button>
              </div>

              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded border ${
                  fenSideToMove === 'w'
                    ? 'text-zinc-100 bg-zinc-100/10 border-zinc-500/30'
                    : 'text-zinc-400 bg-zinc-800/50 border-zinc-700/50'
                }`}>
                  {fenSideToMove === 'w' ? '◻ White' : '◼ Black'} to move
                </span>
                <button type="button" onClick={copyFen} title="Copy FEN"
                  className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all flex items-center gap-1 ${
                    fenCopied ? 'text-[#6CFF93]' : 'text-zinc-400 hover:text-white'
                  }`}>
                  <Copy className="w-3 h-3" />{fenCopied ? 'Copied!' : 'FEN'}
                </button>
              </div>
            </div>

            {/* Setup Mode: Piece Bank Palette */}
            {boardMode === 'setup' && (
              <div className="mt-3 p-3 bg-[#1B1E26] border border-[#2E3646] rounded-xl space-y-2 animate-in fade-in">
                <div className="flex items-center justify-between text-[11px] text-zinc-400 font-bold">
                  <span>Piece Bank (click piece then square, or drag pieces on board):</span>
                  {selectedPalettePiece && (
                    <button
                      type="button"
                      onClick={() => setSelectedPalettePiece(null)}
                      className="text-xs text-rose-400 hover:underline"
                    >
                      Deselect
                    </button>
                  )}
                </div>

                {/* White Pieces */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] font-black uppercase text-zinc-500 w-12">White:</span>
                  {WHITE_PALETTE.map(p => (
                    <button
                      key={p.piece}
                      type="button"
                      onClick={() => setSelectedPalettePiece(selectedPalettePiece === p.piece ? null : p.piece)}
                      className={`w-9 h-9 rounded-lg p-1 transition-all border flex items-center justify-center ${
                        selectedPalettePiece === p.piece
                          ? 'bg-[#6CFF93]/20 border-[#6CFF93] ring-2 ring-[#6CFF93]'
                          : 'bg-[#16181D] border-[#2A2F3C] hover:border-zinc-500'
                      }`}
                      title={`Select White ${p.name}`}
                    >
                      <img src={pieceFileMap[p.piece]} alt={p.name} className="w-full h-full object-contain" />
                    </button>
                  ))}
                </div>

                {/* Black Pieces */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] font-black uppercase text-zinc-500 w-12">Black:</span>
                  {BLACK_PALETTE.map(p => (
                    <button
                      key={p.piece}
                      type="button"
                      onClick={() => setSelectedPalettePiece(selectedPalettePiece === p.piece ? null : p.piece)}
                      className={`w-9 h-9 rounded-lg p-1 transition-all border flex items-center justify-center ${
                        selectedPalettePiece === p.piece
                          ? 'bg-[#6CFF93]/20 border-[#6CFF93] ring-2 ring-[#6CFF93]'
                          : 'bg-[#16181D] border-[#2A2F3C] hover:border-zinc-500'
                      }`}
                      title={`Select Black ${p.name}`}
                    >
                      <img src={pieceFileMap[p.piece]} alt={p.name} className="w-full h-full object-contain" />
                    </button>
                  ))}

                  {/* Eraser Tool */}
                  <div className="ml-auto flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setSelectedPalettePiece(selectedPalettePiece === 'trash' ? null : 'trash')}
                      className={`h-9 px-3 rounded-lg border text-xs font-bold transition-all flex items-center gap-1.5 ${
                        selectedPalettePiece === 'trash'
                          ? 'bg-rose-500/20 text-rose-300 border-rose-500 ring-2 ring-rose-500'
                          : 'bg-[#16181D] text-zinc-400 border-[#2A2F3C] hover:text-rose-400 hover:border-rose-900'
                      }`}
                      title="Eraser: click any piece on the board to remove it"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Eraser</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Chessboard */}
            <div className="w-full max-w-[520px] mx-auto aspect-square rounded-xl overflow-hidden shadow-2xl border border-[#262B35] bg-[#2d3139] my-3">
              <Chessboard
                options={{
                  position: displayFen,
                  boardOrientation: boardOrientation,
                  arrows: arrows,
                  allowDragging: true,
                  onPieceDrop: handlePieceDrop,
                  onSquareClick: handleSquareClick,
                  squareStyles: clickedSquare ? {
                    [clickedSquare]: { backgroundColor: 'rgba(108, 255, 147, 0.45)', borderRadius: '4px' }
                  } : undefined,
                  pieces: neoCustomPieces as any,
                  darkSquareStyle: { backgroundColor: '#769656' },
                  lightSquareStyle: { backgroundColor: '#eeeed2' }
                }}
              />
            </div>

            {/* ── Next Chess Move Calculator Action Bar ────────────────────────── */}
            <div className="space-y-3 pt-2 mb-3">
              {/* Row 1: Primary Action & Board Operations */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-wrap flex-1">
                  {/* Calculate Next Move */}
                  <button
                    type="button"
                    onClick={() => startAnalysis()}
                    disabled={isAnalyzing}
                    className="flex-1 min-w-[150px] py-2.5 px-4 rounded-xl bg-[#6CFF93] hover:bg-[#5FE683] disabled:opacity-50 text-[#1A1919] font-black text-xs transition-all flex items-center justify-center gap-2 shadow-sm border border-[#5FE683]"
                  >
                    <Zap className="w-4 h-4 fill-current" />
                    <span>Calculate Next Move</span>
                  </button>

                  {/* Make Move */}
                  <button
                    type="button"
                    onClick={handleMakeBestMove}
                    disabled={!currentBestMove}
                    className="py-2.5 px-3.5 rounded-xl bg-[#1B1E26] hover:bg-[#252A36] disabled:opacity-40 border border-[#2E3646] text-white font-black text-xs transition-all flex items-center gap-1.5"
                    title={currentBestMove ? `Make move ${currentBestMove.san}` : 'No move calculated yet'}
                  >
                    <Play className="w-3.5 h-3.5 fill-current text-[#6CFF93]" />
                    <span>Make Move</span>
                  </button>
                </div>

                {/* History & Board manipulation buttons */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  {/* Undo */}
                  <button
                    type="button"
                    onClick={handleUndo}
                    disabled={historyIndex <= 0}
                    className="p-2.5 rounded-xl bg-[#1B1E26] hover:bg-[#252A36] disabled:opacity-30 border border-[#2E3646] text-zinc-300 hover:text-white text-xs font-bold transition-all"
                    title="Undo move"
                  >
                    <Undo2 className="w-4 h-4" />
                  </button>

                  {/* Redo */}
                  <button
                    type="button"
                    onClick={handleRedo}
                    disabled={historyIndex >= moveHistory.length - 1}
                    className="p-2.5 rounded-xl bg-[#1B1E26] hover:bg-[#252A36] disabled:opacity-30 border border-[#2E3646] text-zinc-300 hover:text-white text-xs font-bold transition-all"
                    title="Redo move"
                  >
                    <Redo2 className="w-4 h-4" />
                  </button>

                  {/* Reset Start */}
                  <button
                    type="button"
                    onClick={handleResetStart}
                    className="px-3 py-2.5 rounded-xl bg-[#1B1E26] hover:bg-[#252A36] border border-[#2E3646] text-zinc-300 hover:text-white text-xs font-bold transition-all flex items-center gap-1"
                    title="Reset to initial standard position"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Reset</span>
                  </button>

                  {/* Kings Only */}
                  <button
                    type="button"
                    onClick={handleClearKingsOnly}
                    className="px-3 py-2.5 rounded-xl bg-[#1B1E26] hover:bg-[#252A36] border border-[#2E3646] text-zinc-300 hover:text-white text-xs font-bold transition-all flex items-center gap-1"
                    title="Clear board except Kings (Kings Only)"
                  >
                    <Crown className="w-3.5 h-3.5 text-amber-400" />
                    <span className="hidden sm:inline">Kings Only</span>
                  </button>

                  {/* Rotate / Flip Board */}
                  <button
                    type="button"
                    onClick={handleRotateBoard}
                    className="p-2.5 rounded-xl bg-[#1B1E26] hover:bg-[#252A36] border border-[#2E3646] text-zinc-300 hover:text-white text-xs font-bold transition-all"
                    title="Flip board orientation"
                  >
                    <RotateCw className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Row 2: Turn & Castling & Auto-Reply Rules Controls */}
              <div className="p-3 bg-[#1B1E26] rounded-xl border border-[#242933] flex flex-wrap items-center justify-between gap-3 text-xs">
                {/* Side to Move Toggle */}
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black uppercase text-zinc-500">Turn:</span>
                  <button
                    type="button"
                    onClick={() => handleToggleSideToMove()}
                    className={`px-3 py-1.5 rounded-lg font-black text-xs transition-all flex items-center gap-1.5 border ${
                      fenSideToMove === 'w'
                        ? 'bg-zinc-100 text-black border-zinc-300'
                        : 'bg-[#111] text-white border-[#444]'
                    }`}
                    title="Click to toggle side to move"
                  >
                    <span>{fenSideToMove === 'w' ? '◻ White to move' : '◼ Black to move'}</span>
                    <ArrowLeftRight className="w-3 h-3 text-zinc-400" />
                  </button>
                </div>

                {/* Castling rights */}
                <div className="flex items-center gap-2.5 flex-wrap">
                  <span className="text-[10px] font-black uppercase text-zinc-500">Castle:</span>
                  {[
                    { flag: 'K' as const, label: 'W O-O' },
                    { flag: 'Q' as const, label: 'W O-O-O' },
                    { flag: 'k' as const, label: 'B O-O' },
                    { flag: 'q' as const, label: 'B O-O-O' },
                  ].map(({ flag, label }) => (
                    <label key={flag} className="flex items-center gap-1 cursor-pointer text-[11px] font-bold text-zinc-300 hover:text-white">
                      <input
                        type="checkbox"
                        checked={castlingRights.includes(flag)}
                        onChange={() => handleToggleCastling(flag)}
                        className="accent-[#6CFF93] rounded"
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>

                {/* Computer Auto-Reply Toggle */}
                <label className="flex items-center gap-2 cursor-pointer ml-auto text-xs font-bold text-cyan-300 hover:text-cyan-200">
                  <input
                    type="checkbox"
                    checked={autoReply}
                    onChange={(e) => setAutoReply(e.target.checked)}
                    className="accent-cyan-400 rounded"
                  />
                  <span>Auto-reply (play vs Stockfish 18)</span>
                </label>
              </div>

              {/* Computer Thinking Indicator */}
              {isComputerThinking && (
                <div className="p-2.5 bg-cyan-950/30 border border-cyan-500/40 rounded-xl flex items-center justify-center gap-2 text-xs font-black text-cyan-300 animate-pulse">
                  <RefreshCw className="w-4 h-4 animate-spin text-cyan-400" />
                  <span>Stockfish 18 is making its move...</span>
                </div>
              )}
            </div>

            {/* Variation transport */}
            {activePvMoves.length > 0 && (
              <div className="flex items-center justify-between bg-[#1B1E26] border border-[#242933] p-2.5 rounded-xl">
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-[10px] font-black uppercase text-zinc-400">Variation:</span>
                  <span className="font-mono font-bold text-cyan-400">
                    {variationStep === 0 ? 'Start' : `${variationStep}/${activePvMoves.length}`}
                  </span>
                  {variationStep < activePvSan.length && (
                    <span className="font-mono text-[#6CFF93] font-black">→ {activePvSan[variationStep]}</span>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  {[
                    { label: '⏮', action: () => handleVariationStep(0), disabled: variationStep === 0 },
                    { label: '‹', action: () => handleVariationStep(variationStep - 1), disabled: variationStep === 0 },
                    { label: '›', action: () => handleVariationStep(variationStep + 1), disabled: variationStep >= activePvMoves.length },
                    { label: '⏭', action: () => handleVariationStep(activePvMoves.length), disabled: variationStep >= activePvMoves.length },
                  ].map(({ label, action, disabled }, i) => (
                    <button key={i} type="button" onClick={action} disabled={disabled}
                      className="px-2.5 py-1 rounded bg-[#242A36] hover:bg-[#2F3746] disabled:opacity-30 text-xs font-bold text-white transition-all min-w-[28px]">
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: Analysis Panel (5/12) */}
        <div className="lg:col-span-5 flex flex-col gap-3">

          {/* Live search status */}
          {isAnalyzing && (
            <div className="bg-[#16181D] border border-cyan-500/30 rounded-2xl p-4 shadow-xl space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse" />
                  <span className="text-xs font-black text-white uppercase tracking-wider">
                    ⚡ Stockfish 18 Calculating... (Target Depth {targetDepth})
                  </span>
                </div>
                <span className="text-[10px] font-mono font-bold text-cyan-400">NNUE Engine</span>
              </div>
              <div className="p-3 bg-[#1B2533] rounded-xl border border-cyan-800/30 flex items-center justify-between">
                <div className="space-y-0.5">
                  <span className="text-xs text-white font-black block">Evaluating candidate moves &amp; position...</span>
                  <span className="text-[11px] text-zinc-400">Finding the strongest tactical continuation</span>
                </div>
                <RefreshCw className="w-5 h-5 text-cyan-400 animate-spin shrink-0" />
              </div>
            </div>
          )}

          {/* No analysis yet */}
          {!hasResults && !isAnalyzing && (
            <div className="bg-[#16181D] border border-[#242933] rounded-2xl p-6 shadow-xl text-center space-y-3">
              <Target className="w-10 h-10 text-zinc-600 mx-auto" />
              <div>
                <h3 className="text-sm font-black text-white uppercase tracking-wider">Ready for Analysis</h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Upload an image, paste FEN/PGN, or build a position and click Analyze.
                </p>
              </div>
              <button type="button" onClick={() => startAnalysis()}
                className="w-full py-3 px-4 rounded-xl bg-[#6CFF93] hover:bg-[#5FE683] text-[#1A1919] font-black text-xs transition-all flex items-center justify-center gap-2 shadow-sm border border-[#5FE683]">
                <Zap className="w-4 h-4" /><span>Analyze Now</span>
              </button>
            </div>
          )}

          {/* Best move card */}
          {hasResults && (
            <div className="bg-[#16181D] border border-[#242933] rounded-2xl p-4 shadow-xl space-y-4">

              {/* Action Toolbar: Save Position, Share, Compare, What-If */}
              <div className="flex items-center justify-between gap-1.5 pb-1 border-b border-[#242933] text-xs">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleSavePosition}
                    disabled={isSaving}
                    className={`px-3 py-1.5 rounded-lg border text-xs font-bold transition-all flex items-center gap-1.5 ${
                      savedPositionId
                        ? 'bg-amber-950/40 text-amber-300 border-amber-800/40'
                        : 'bg-[#1B1E26] hover:bg-[#252A36] text-zinc-300 border-[#2E3646]'
                    }`}
                    title="Bookmark position to Saved Positions"
                  >
                    {savedPositionId ? <Check className="w-3.5 h-3.5 text-amber-400" /> : <Bookmark className="w-3.5 h-3.5 text-amber-400" />}
                    <span>{savedPositionId ? 'Saved' : 'Save'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleSharePosition}
                    className="px-3 py-1.5 rounded-lg bg-[#1B1E26] hover:bg-[#252A36] border border-[#2E3646] text-xs font-bold text-zinc-300 transition-all flex items-center gap-1.5"
                    title="Generate shareable link for this position"
                  >
                    <Share2 className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Share</span>
                  </button>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleOpenCompare}
                    className="px-2.5 py-1.5 rounded-lg bg-[#1B1E26] hover:bg-[#252A36] border border-[#2E3646] text-xs font-bold text-cyan-300 transition-all flex items-center gap-1"
                    title="Compare 2-3 candidate moves side by side"
                  >
                    <ArrowLeftRight className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Compare</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleOpenWhatIf()}
                    className="px-2.5 py-1.5 rounded-lg bg-[#1B1E26] hover:bg-[#252A36] border border-[#2E3646] text-xs font-bold text-[#6CFF93] transition-all flex items-center gap-1"
                    title="What if you played an alternative move?"
                  >
                    <HelpCircle className="w-3.5 h-3.5 text-[#6CFF93]" />
                    <span>What If?</span>
                  </button>
                </div>
              </div>

              {/* Best move display */}
              <div className="p-4 rounded-xl bg-[#1B1E26] border border-[#6CFF93]/20 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase text-zinc-400 tracking-wider">
                    {playerColor === 'white' ? '◻ White' : '◼ Black'}'s Best Move
                  </span>
                  <span className="text-[10px] font-bold text-zinc-400">
                    {bestMoveResult ? `Depth ${bestMoveResult.depth}` : `Depth ${searchDepth || targetDepth}`}
                    {isSearching && <span className="ml-1 text-cyan-400 animate-pulse">▸</span>}
                  </span>
                </div>
                <div className="flex items-baseline justify-between">
                  <div className="text-4xl font-black text-[#6CFF93] font-mono tracking-tight">
                    {currentBestMove?.san || '...'}
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] font-bold text-zinc-400 block uppercase">Evaluation</span>
                    <span className={`text-xl font-black font-mono ${
                      currentEval
                        ? currentEval.cp > 100 ? 'text-white' : currentEval.cp < -100 ? 'text-zinc-500' : 'text-zinc-300'
                        : 'text-zinc-300'
                    }`}>
                      {currentEval?.text || '...'}
                    </span>
                  </div>
                </div>

                {/* Direct Make This Move action */}
                <button
                  type="button"
                  onClick={handleMakeBestMove}
                  disabled={!currentBestMove}
                  className="w-full mt-2 py-2.5 px-4 rounded-xl bg-[#6CFF93] hover:bg-[#5FE683] disabled:opacity-40 text-[#1A1919] font-black text-xs transition-all flex items-center justify-center gap-2 shadow-sm border border-[#5FE683]"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Make This Move ({currentBestMove?.san || '...'})</span>
                </button>
              </div>

              {/* Top 3 moves */}
              {topMovesList.length > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase text-zinc-400 tracking-wider block">Top Candidate Moves</span>
                    <button
                      type="button"
                      onClick={handleOpenCompare}
                      className="text-[10px] font-bold text-cyan-400 hover:underline flex items-center gap-1"
                    >
                      <ArrowLeftRight className="w-3 h-3" />
                      <span>Compare these</span>
                    </button>
                  </div>
                  {topMovesList.map((m) => {
                    const scoreText = m.scoreMate !== undefined
                      ? `M${Math.abs(m.scoreMate)}`
                      : m.scoreCp >= 0 ? `+${(m.scoreCp / 100).toFixed(2)}` : (m.scoreCp / 100).toFixed(2);
                    const isSelected = m.multiPvRank === selectedMoveRank;
                    const moveSan = m.pvSan?.[0] || m.pv?.[0] || '';
                    return (
                      <div key={m.multiPvRank} onClick={() => { setSelectedMoveRank(m.multiPvRank); handleVariationStep(0); }}
                        className={`p-2.5 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                          isSelected ? 'bg-[#1E2A36] border-cyan-500/70 shadow-sm' : 'bg-[#121316] border-[#242933] hover:border-[#384152]'
                        }`}>
                        <div className="flex items-center gap-2.5">
                          <span className="w-5 h-5 rounded-lg text-[10px] font-black text-center leading-5 bg-[#1F232B] text-zinc-300">
                            {m.multiPvRank}
                          </span>
                          <span className="text-base font-black font-mono text-white">
                            {moveSan}
                          </span>
                          {isSelected && (
                            <span className="text-[10px] text-cyan-400 font-bold">← selected</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handlePlayCandidateMove(moveSan);
                            }}
                            className="px-2 py-1 rounded bg-[#6CFF93]/15 hover:bg-[#6CFF93]/25 text-[#6CFF93] border border-[#6CFF93]/30 text-[10px] font-black transition-all flex items-center gap-1"
                            title={`Play ${moveSan} on the board`}
                          >
                            <Play className="w-2.5 h-2.5 fill-current" />
                            <span>Play</span>
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenWhatIf(moveSan);
                            }}
                            className="text-[10px] font-bold text-zinc-400 hover:text-white px-1.5 py-0.5 rounded hover:bg-[#282E3B]"
                            title={`Explore what happens if ${moveSan} is played`}
                          >
                            What If?
                          </button>
                          <span className="text-sm font-black font-mono text-zinc-200">{scoreText}</span>
                          <span className="text-[10px] text-zinc-500 font-mono">d{m.depth}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* PV line */}
              {activePvSan.length > 0 && (
                <div className="p-3 rounded-xl bg-[#1B1E26] border border-[#242933] space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase text-zinc-400 tracking-wider">
                      Best Continuation (Move #{selectedMoveRank})
                    </span>
                    <span className="text-[10px] text-zinc-400 font-mono">{activePvSan.length} moves</span>
                  </div>
                  <div className="flex flex-wrap gap-1 font-mono text-xs max-h-24 overflow-y-auto">
                    {activePvSan.map((san, idx) => (
                      <span key={idx} onClick={() => handleVariationStep(idx + 1)}
                        className={`cursor-pointer px-1.5 py-0.5 rounded transition-all ${
                          variationStep === idx + 1
                            ? 'bg-cyan-500 text-black font-black'
                            : 'text-zinc-300 hover:text-white hover:bg-[#202530]'
                        }`}>
                        {idx % 2 === 0 ? `${Math.ceil((idx + (fenSideToMove === 'b' ? 2 : 1)) / 2)}.` : ''}{san}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* FEATURE 2 & 8: Why This Move with Depth Explanation Level */}
              <div className="p-3.5 rounded-xl bg-[#1B1E26] border border-[#242933] space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase text-zinc-400 tracking-wider">
                    Why This Move?
                  </span>
                  <div className="inline-flex bg-[#121316] p-0.5 rounded-lg border border-[#2E3646] text-[10px]">
                    {(['beginner', 'intermediate', 'advanced'] as ExplanationLevel[]).map(lvl => (
                      <button
                        key={lvl}
                        type="button"
                        onClick={() => handleExplainMove(lvl)}
                        className={`px-2 py-0.5 rounded font-bold capitalize transition-all ${
                          explanationLevel === lvl
                            ? 'bg-cyan-500 text-black shadow-sm'
                            : 'text-zinc-400 hover:text-white'
                        }`}
                      >
                        {lvl}
                      </button>
                    ))}
                  </div>
                </div>

                {showExplanation ? (
                  <div className="p-3 bg-[#121316] rounded-xl border border-cyan-500/20 text-xs text-zinc-300 space-y-2">
                    <div className="font-bold text-white flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <TrendingUp className="w-3.5 h-3.5 text-cyan-400" />
                        <span>Why {currentBestMove?.san}? ({explanationLevel})</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowExplanation(false)}
                        className="text-[10px] text-zinc-400 hover:text-white"
                      >
                        Hide
                      </button>
                    </div>

                    {loadingExplanation ? (
                      <div className="py-2 text-center text-zinc-400 animate-pulse font-medium">
                        Analyzing move concepts with Stockfish 18...
                      </div>
                    ) : (
                      <p className="leading-relaxed text-zinc-300 font-normal">
                        {moveExplanation || serverResult?.explanation || 'Stockfish 18 NNUE calculates this as the objective best continuation. It maximizes piece mobility, secures king safety, and refutes opponent counter-tactics.'}
                      </p>
                    )}
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleExplainMove()}
                    disabled={loadingExplanation}
                    className="w-full py-2.5 rounded-xl bg-[#1F232B] hover:bg-[#282E3B] border border-[#2E3646] text-xs font-bold text-zinc-200 transition-all flex items-center justify-center gap-2"
                  >
                    <HelpCircle className="w-4 h-4 text-cyan-400" />
                    <span>Why is {currentBestMove?.san} the best move?</span>
                  </button>
                )}
              </div>

              {/* Re-analyze Button */}
              <button type="button" onClick={() => startAnalysis()} disabled={isAnalyzing}
                className="w-full py-2.5 rounded-xl bg-[#1F232B] hover:bg-[#282E3B] border border-[#2E3646] text-xs font-bold text-zinc-300 transition-all flex items-center justify-center gap-2">
                <RefreshCw className={`w-3.5 h-3.5 ${isAnalyzing ? 'animate-spin' : ''}`} />
                <span>Re-analyze with Stockfish 18</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* =========================================================================
          FEATURE 3: COMPARE MOVES MODAL / PANEL
          ========================================================================= */}
      {compareModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#16181D] border border-[#2E3646] rounded-2xl w-full max-w-3xl shadow-2xl p-6 space-y-5 animate-in fade-in zoom-in-95 max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-cyan-950/60 border border-cyan-800/40 flex items-center justify-center">
                  <ArrowLeftRight className="w-5 h-5 text-cyan-400" />
                </div>
                <div>
                  <h3 className="text-base font-black text-white uppercase tracking-tight">Compare Candidate Moves</h3>
                  <p className="text-xs text-zinc-400">
                    Side-by-side Stockfish 18 evaluation of 2–3 moves with comparative rationale.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCompareModalOpen(false)}
                className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-[#202530]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Candidate selection */}
            <div className="p-4 bg-[#121316] rounded-xl border border-[#242933] space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black uppercase text-zinc-400">Selected Moves (2–3):</span>
                <span className="text-xs text-zinc-500 font-mono">{compareMovesList.length}/3 selected</span>
              </div>

              {/* Selected move chips */}
              <div className="flex flex-wrap items-center gap-2">
                {compareMovesList.map(move => (
                  <span
                    key={move}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1F232B] border border-cyan-500/40 text-cyan-300 text-xs font-black font-mono"
                  >
                    <span>{move}</span>
                    <button
                      type="button"
                      onClick={() => handleToggleCompareMove(move)}
                      className="text-zinc-400 hover:text-rose-400"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}

                {compareMovesList.length < 3 && (
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={compareCustomInput}
                      onChange={e => setCompareCustomInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleAddCustomCompareMove(); }}
                      placeholder="Add move (e.g. Nf6)..."
                      className="px-3 py-1.5 rounded-lg bg-[#1B1E26] border border-[#2E3646] text-xs font-mono text-white focus:outline-none focus:border-cyan-500 w-36"
                    />
                    <button
                      type="button"
                      onClick={handleAddCustomCompareMove}
                      className="px-2.5 py-1.5 rounded-lg bg-[#242A36] hover:bg-[#2F3746] text-xs font-bold text-white"
                    >
                      Add
                    </button>
                  </div>
                )}
              </div>

              {/* Quick candidate suggestions */}
              {topMovesList.length > 0 && (
                <div className="pt-2 border-t border-[#242933] flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] uppercase font-bold text-zinc-500">Quick add from top engine moves:</span>
                  {topMovesList.map(m => {
                    const san = m.pvSan?.[0] || m.pv?.[0];
                    if (!san) return null;
                    const isAdded = compareMovesList.includes(san);
                    return (
                      <button
                        key={san}
                        type="button"
                        onClick={() => handleToggleCompareMove(san)}
                        className={`px-2 py-0.5 rounded text-[11px] font-mono font-bold transition-colors ${
                          isAdded
                            ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                            : 'bg-[#1B1E26] text-zinc-400 hover:text-white border border-[#282E3B]'
                        }`}
                      >
                        {isAdded ? `✓ ${san}` : `+ ${san}`}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Run Button */}
            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleRunCompare}
                disabled={compareMovesList.length < 2 || comparingMoves}
                className="px-5 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 disabled:opacity-40 disabled:cursor-not-allowed text-black text-xs font-black transition-all flex items-center gap-2 shadow-sm"
              >
                {comparingMoves ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Calculating deep comparative lines...</span>
                  </>
                ) : (
                  <>
                    <ArrowLeftRight className="w-3.5 h-3.5" />
                    <span>Compare Moves (Depth {targetDepth})</span>
                  </>
                )}
              </button>
            </div>

            {/* Comparison Results */}
            {compareResult && (
              <div className="space-y-4 pt-2 border-t border-[#242933] animate-in fade-in">
                {/* Side-by-side move cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {compareResult.moves.map((cand, idx) => {
                    const isBest = cand.move === compareResult.bestMove || cand.san === compareResult.bestMoveSan;
                    const evalPawns = cand.scoreMate !== undefined
                      ? `M${cand.scoreMate}`
                      : `${cand.scoreCp >= 0 ? '+' : ''}${(cand.scoreCp / 100).toFixed(2)}`;

                    return (
                      <div
                        key={idx}
                        className={`p-4 rounded-xl border flex flex-col justify-between gap-3 ${
                          isBest
                            ? 'bg-emerald-950/20 border-emerald-500/50 shadow-md'
                            : 'bg-[#121316] border-[#242933]'
                        }`}
                      >
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] font-black uppercase tracking-wider text-zinc-400">
                              Candidate #{idx + 1}
                            </span>
                            {isBest && (
                              <span className="text-[10px] font-black uppercase text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-800/60">
                                Best
                              </span>
                            )}
                          </div>
                          <div className="text-2xl font-black font-mono text-white">
                            {cand.san || cand.move}
                          </div>
                          <div className="text-sm font-black font-mono mt-1 text-cyan-300">
                            Eval: {evalPawns}
                          </div>
                        </div>

                        {cand.pv && cand.pv.length > 0 && (
                          <div className="text-[11px] font-mono text-zinc-400 bg-[#16181D] p-2 rounded-lg border border-[#242933]">
                            <span className="text-[9px] uppercase font-bold text-zinc-500 block">Line:</span>
                            <span className="line-clamp-2">{cand.pvSan?.join(' ') || cand.pv.join(' ')}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Comparative Engine Analysis Rationale */}
                {compareResult.comparison && (
                  <div className="p-4 bg-cyan-950/20 border border-cyan-500/40 rounded-xl space-y-2">
                    <div className="flex items-center gap-2 text-cyan-300 text-xs font-black uppercase">
                      <TrendingUp className="w-4 h-4" />
                      <span>Comparative Analysis</span>
                    </div>
                    <p className="text-xs text-zinc-200 leading-relaxed font-semibold">
                      {compareResult.comparison.summary}
                    </p>
                    <p className="text-xs text-zinc-300 leading-relaxed">
                      {compareResult.comparison.whyAIsStronger}
                    </p>
                    <div className="text-[11px] font-mono text-cyan-400 font-bold pt-1">
                      Delta: {(compareResult.comparison.evalDelta / 100).toFixed(2)} pawns difference
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* =========================================================================
          FEATURE 4: WHAT IF? ALTERNATIVE MOVE MODAL / PANEL
          ========================================================================= */}
      {whatIfModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#16181D] border border-[#2E3646] rounded-2xl w-full max-w-2xl shadow-2xl p-6 space-y-5 animate-in fade-in zoom-in-95 max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-950/60 border border-emerald-800/40 flex items-center justify-center">
                  <HelpCircle className="w-5 h-5 text-[#6CFF93]" />
                </div>
                <div>
                  <h3 className="text-base font-black text-white uppercase tracking-tight">What If? Exploration</h3>
                  <p className="text-xs text-zinc-400">
                    Test what happens if an alternative move is played instead of the engine's best move.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setWhatIfModalOpen(false)}
                className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-[#202530]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Input Move */}
            <div className="space-y-3 bg-[#121316] p-4 rounded-xl border border-[#242933]">
              <label className="block text-xs font-black uppercase text-zinc-400">Alternative Move to Test</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={whatIfMoveInput}
                  onChange={e => setWhatIfMoveInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleRunWhatIf(); }}
                  placeholder="e.g. Nf6, Be7, d5, exd5..."
                  className="flex-1 px-3.5 py-2.5 rounded-xl bg-[#1B1E26] border border-[#2E3646] text-sm font-mono text-white focus:outline-none focus:border-[#6CFF93]"
                />
                <button
                  type="button"
                  onClick={() => handleRunWhatIf()}
                  disabled={!whatIfMoveInput.trim() || analyzingWhatIf}
                  className="px-5 py-2.5 rounded-xl bg-[#6CFF93] hover:bg-[#5FE683] disabled:opacity-40 text-[#1A1919] text-xs font-black transition-all flex items-center gap-2"
                >
                  {analyzingWhatIf ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Analyzing...</span>
                    </>
                  ) : (
                    <>
                      <Zap className="w-3.5 h-3.5" />
                      <span>Analyze What If</span>
                    </>
                  )}
                </button>
              </div>

              {/* Quick candidate chips */}
              {topMovesList.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap pt-1">
                  <span className="text-[10px] uppercase font-bold text-zinc-500">Suggested alternatives:</span>
                  {topMovesList.map(m => {
                    const san = m.pvSan?.[0] || m.pv?.[0];
                    if (!san || san === currentBestMove?.san) return null;
                    return (
                      <button
                        key={san}
                        type="button"
                        onClick={() => {
                          setWhatIfMoveInput(san);
                          handleRunWhatIf(san);
                        }}
                        className="px-2 py-0.5 rounded text-[11px] font-mono bg-[#1B1E26] hover:bg-[#282E3B] text-zinc-300 hover:text-white border border-[#282E3B]"
                      >
                        {san}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Results */}
            {whatIfResult && (
              <div className="space-y-4 pt-2 border-t border-[#242933] animate-in fade-in">
                {/* Comparison Banner */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3.5 rounded-xl bg-[#121316] border border-emerald-500/40">
                    <span className="text-[10px] font-black uppercase text-emerald-400 block mb-1">Engine Best Move</span>
                    <div className="text-xl font-mono font-black text-white">{whatIfResult.baseline.bestMoveSan}</div>
                    <div className="text-xs font-mono text-zinc-400 mt-1">
                      Eval: {whatIfResult.baseline.scoreMate !== undefined ? `M${whatIfResult.baseline.scoreMate}` : `${whatIfResult.baseline.scoreCp >= 0 ? '+' : ''}${(whatIfResult.baseline.scoreCp / 100).toFixed(2)}`}
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-[#121316] border border-amber-500/40">
                    <span className="text-[10px] font-black uppercase text-amber-400 block mb-1">What-If Move</span>
                    <div className="text-xl font-mono font-black text-white">{whatIfResult.userMove.san}</div>
                    <div className="text-xs font-mono text-zinc-400 mt-1">
                      Eval: {whatIfResult.whatIf.scoreMate !== undefined ? `M${whatIfResult.whatIf.scoreMate}` : `${whatIfResult.whatIf.scoreCp >= 0 ? '+' : ''}${(whatIfResult.whatIf.scoreCp / 100).toFixed(2)}`}
                    </div>
                  </div>
                </div>

                {/* Eval Difference & Refutation */}
                <div className="p-4 bg-amber-950/20 border border-amber-500/30 rounded-xl space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-amber-300">Eval Difference:</span>
                    <span className="font-mono font-black text-amber-400">
                      {whatIfResult.evalDifferencePawns > 0 ? '+' : ''}{whatIfResult.evalDifferencePawns.toFixed(2)} pawns
                    </span>
                  </div>

                  <div className="text-xs text-zinc-300 leading-relaxed font-normal">
                    {whatIfResult.explanation}
                  </div>

                  {whatIfResult.whatIf.bestOpponentReply && (
                    <div className="pt-2 border-t border-amber-900/30 flex items-center justify-between text-xs">
                      <span className="text-zinc-400">Opponent's Best Refutation:</span>
                      <span className="font-mono font-black text-white bg-[#16181D] px-2 py-0.5 rounded border border-[#2E3646]">
                        {whatIfResult.whatIf.bestOpponentReply}
                      </span>
                    </div>
                  )}

                  {whatIfResult.whatIf.continuationSan && whatIfResult.whatIf.continuationSan.length > 0 && (
                    <div className="text-[11px] font-mono text-zinc-400">
                      <span className="text-zinc-500 font-sans text-[10px] uppercase font-bold block">Refutation Continuation:</span>
                      <span>{whatIfResult.whatIf.continuationSan.slice(0, 6).join(' ')}</span>
                    </div>
                  )}
                </div>

                {/* Load on Board Button */}
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setCurrentFen(whatIfResult.resultingFen);
                      setFenInputValue(whatIfResult.resultingFen);
                      setWhatIfModalOpen(false);
                      startAnalysis(whatIfResult.resultingFen);
                    }}
                    className="px-4 py-2 rounded-xl bg-[#1F232B] hover:bg-[#282E3B] border border-[#2E3646] text-xs font-bold text-white flex items-center gap-1.5 transition-all"
                  >
                    <span>Load What-If Position onto Board</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
