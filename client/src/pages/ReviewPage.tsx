import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Chess } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import { api } from '../services/api';
import { audioManager, ChessSoundEvent } from '../services/audioManager';
import { FullReviewData, MoveAnalysis, User, ExplanationLevel } from '../types';
import { EvalBar } from '../components/EvalBar';
import { EvalGraph } from '../components/EvalGraph';
import { MoveList } from '../components/MoveList';
import { CatCoachBubble } from '../components/CatCoachBubble';
import { ClassificationBadge } from '../components/ClassificationBadge';
import { ReviewSummary } from '../components/ReviewSummary';
import { SoundSettingsModal } from '../components/SoundSettingsModal';
import { neoCustomPieces } from '../utils/chessPieces';
import { 
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, 
  RotateCcw, Play, Pause, RefreshCw, AlertCircle, ArrowLeft,
  Volume2, VolumeX, Sliders, Calendar, Clock,
  Compass, Heart, Search, Star, Share2, ExternalLink
} from 'lucide-react';

interface ReviewPageProps {
  gameId: string;
  currentUser?: User | null;
  onBack: () => void;
  onOpenInChessHelper?: (fen: string) => void;
}

const getSquareCoordinates = (square: string, orientation: 'white' | 'black') => {
  if (!square || square.length < 2) return null;
  const file = square.charCodeAt(0) - 97;
  const rank = parseInt(square[1], 10);
  const col = orientation === 'white' ? file : 7 - file;
  const row = orientation === 'white' ? 8 - rank : rank - 1;
  return {
    left: `${col * 12.5}%`,
    top: `${row * 12.5}%`,
    width: '12.5%',
    height: '12.5%'
  };
};

// Count captured pieces and calculate material advantage
const getCapturedPiecesAndAdvantage = (fen: string) => {
  const initialCounts: Record<string, number> = { p: 8, n: 2, b: 2, r: 2, q: 1 };
  const currentWhite: Record<string, number> = { p: 0, n: 0, b: 0, r: 0, q: 0 };
  const currentBlack: Record<string, number> = { p: 0, n: 0, b: 0, r: 0, q: 0 };

  const position = fen.split(' ')[0];
  for (const char of position) {
    const lower = char.toLowerCase();
    if (initialCounts[lower] !== undefined) {
      if (char === char.toUpperCase()) {
        currentWhite[lower]++;
      } else {
        currentBlack[lower]++;
      }
    }
  }

  const whiteCaptured: string[] = [];
  const blackCaptured: string[] = [];

  const pieceOrder = ['q', 'r', 'b', 'n', 'p'];
  for (const p of pieceOrder) {
    const missingBlack = Math.max(0, initialCounts[p] - currentBlack[p]);
    for (let i = 0; i < missingBlack; i++) whiteCaptured.push(p);

    const missingWhite = Math.max(0, initialCounts[p] - currentWhite[p]);
    for (let i = 0; i < missingWhite; i++) blackCaptured.push(p.toUpperCase());
  }

  const pieceValues: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9 };
  let whiteMaterial = 0;
  let blackMaterial = 0;
  Object.keys(currentWhite).forEach(k => {
    whiteMaterial += currentWhite[k] * pieceValues[k];
    blackMaterial += currentBlack[k] * pieceValues[k];
  });

  const diff = whiteMaterial - blackMaterial;
  return {
    whiteCaptured,
    blackCaptured,
    whiteAdvantage: diff > 0 ? diff : 0,
    blackAdvantage: diff < 0 ? Math.abs(diff) : 0
  };
};

const getKingSquares = (fen: string): { whiteKing?: string; blackKing?: string } => {
  const rows = fen.split(' ')[0].split('/');
  let whiteKing: string | undefined;
  let blackKing: string | undefined;

  rows.forEach((row, rIdx) => {
    let col = 0;
    for (const char of row) {
      if (/\d/.test(char)) {
        col += parseInt(char, 10);
      } else {
        const file = String.fromCharCode(97 + col);
        const rank = (8 - rIdx).toString();
        const sq = `${file}${rank}`;
        if (char === 'K') whiteKing = sq;
        if (char === 'k') blackKing = sq;
        col += 1;
      }
    }
  });

  return { whiteKing, blackKing };
};

export const ReviewPage: React.FC<ReviewPageProps> = ({ gameId, currentUser, onBack, onOpenInChessHelper }) => {
  const [data, setData] = useState<FullReviewData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [currentPly, setCurrentPly] = useState<number>(0);
  const [boardOrientation, setBoardOrientation] = useState<'white' | 'black'>('white');
  const [autoPlay, setAutoPlay] = useState<boolean>(false);
  const [activeRightTab, setActiveRightTab] = useState<'analysis' | 'summary'>('summary');

  const [showBestArrow, setShowBestArrow] = useState<boolean>(true);
  const [showExplain, setShowExplain] = useState<boolean>(false);
  const [soundModalOpen, setSoundModalOpen] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(() => !audioManager.getSettings().masterEnabled);
  const [analysisProgress, setAnalysisProgress] = useState<number | null>(null);

  const loadGameData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.getGameReview(gameId);
      setData(res);

      let defaultOrient: 'white' | 'black' = 'white';

      if (res.userColor) {
        defaultOrient = res.userColor;
      } else {
        const black = (res.game.black_player || '').toLowerCase();
        const white = (res.game.white_player || '').toLowerCase();

        const candidateNames: string[] = [];
        if (currentUser?.username) candidateNames.push(currentUser.username.toLowerCase());
        if (currentUser?.email) candidateNames.push(currentUser.email.split('@')[0].toLowerCase());
        if ((currentUser as any)?.chesscom_username) candidateNames.push((currentUser as any).chesscom_username.toLowerCase());

        const storedChessUser = localStorage.getItem('chess_username') || localStorage.getItem('aether_chess_username');
        if (storedChessUser) candidateNames.push(storedChessUser.toLowerCase());

        const isBlack = candidateNames.some(name => name && (black === name || (name.length >= 3 && black.includes(name))));
        const isWhite = candidateNames.some(name => name && (white === name || (name.length >= 3 && white.includes(name))));

        if (isBlack && !isWhite) {
          defaultOrient = 'black';
        } else if (isWhite && !isBlack) {
          defaultOrient = 'white';
        } else if (isBlack) {
          defaultOrient = 'black';
        }
      }

      setBoardOrientation(defaultOrient);

      if (res.game.analysis_status !== 'analyzed') {
        pollProgress();
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load game review');
    } finally {
      setLoading(false);
    }
  }, [gameId, currentUser]);

  const pollProgress = async () => {
    const timer = setInterval(async () => {
      try {
        const prog = await api.getAnalysisProgress(gameId);
        if (prog) {
          setAnalysisProgress(prog.percentage || 0);
          if (prog.status === 'completed' || prog.percentage === 100) {
            clearInterval(timer);
            setAnalysisProgress(null);
            loadGameData();
          } else if (prog.status === 'failed') {
            clearInterval(timer);
            setAnalysisProgress(null);
            setError('Stockfish analysis failed for this game.');
          }
        }
      } catch {
        clearInterval(timer);
      }
    }, 2000);
  };

  useEffect(() => {
    loadGameData();
  }, [loadGameData]);

  // Compute game replay position at current ply
  const getPositionAtPly = useCallback((ply: number): {
    fen: string;
    lastMove?: [string, string];
    isCapture?: boolean;
    isCheck?: boolean;
    isCheckmate?: boolean;
    isCastle?: boolean;
    isPromotion?: boolean;
  } => {
    if (!data) return { fen: 'start' };
    const chess = new Chess();
    try {
      chess.loadPgn(data.game.pgn);
      const history = chess.history({ verbose: true });
      const replay = new Chess();

      let lastMoveSquares: [string, string] | undefined = undefined;
      let isCapture = false;
      let isCheck = false;
      let isCheckmate = false;
      let isCastle = false;
      let isPromotion = false;

      for (let i = 0; i < ply && i < history.length; i++) {
        const m = history[i];
        const res = replay.move(m);
        if (i === ply - 1 && res) {
          lastMoveSquares = [res.from, res.to];
          isCapture = !!res.captured;
          isCheck = replay.inCheck();
          isCheckmate = replay.isCheckmate();
          isCastle = res.flags.includes('k') || res.flags.includes('q');
          isPromotion = !!res.promotion;
        }
      }

      return {
        fen: replay.fen(),
        lastMove: lastMoveSquares,
        isCapture,
        isCheck,
        isCheckmate,
        isCastle,
        isPromotion
      };
    } catch {
      return { fen: 'start' };
    }
  }, [data]);

  const currentMoveAnalysis: MoveAnalysis | undefined = data?.moves.find(m => m.ply === currentPly);
  const currentPosition = useMemo(() => getPositionAtPly(currentPly), [getPositionAtPly, currentPly]);
  const currentScoreCp = currentMoveAnalysis?.evaluation_after ?? 0;

  // Explanation level & dynamic coach explanation
  const [explanationLevel, setExplanationLevel] = useState<ExplanationLevel>('intermediate');
  const [customExplanation, setCustomExplanation] = useState<string | null>(null);
  const [loadingExplanation, setLoadingExplanation] = useState<boolean>(false);
  const [bookmarkedFens, setBookmarkedFens] = useState<Set<string>>(new Set());

  // Fetch explanation when explain is toggled, level changes, or move changes
  useEffect(() => {
    if (!showExplain || !currentMoveAnalysis || !currentPosition?.fen || currentPosition.fen === 'start') {
      setCustomExplanation(null);
      return;
    }

    let active = true;
    setLoadingExplanation(true);

    api.explainMove({
      fen: currentPosition.fen,
      playedMove: currentMoveAnalysis.played_move_san,
      bestMove: currentMoveAnalysis.best_move_san,
      evalCp: currentMoveAnalysis.evaluation_after,
      level: explanationLevel,
      classification: currentMoveAnalysis.classification
    }).then(res => {
      if (active) {
        setCustomExplanation(res.explanation);
        setLoadingExplanation(false);
      }
    }).catch(err => {
      console.warn('Could not fetch dynamic explanation:', err);
      if (active) {
        setCustomExplanation(null);
        setLoadingExplanation(false);
      }
    });

    return () => { active = false; };
  }, [showExplain, currentPly, explanationLevel, currentMoveAnalysis, currentPosition?.fen]);

  // Bookmark current position handler
  const handleBookmarkCurrentPosition = async () => {
    if (!currentPosition?.fen || currentPosition.fen === 'start' || !data) return;
    try {
      const moveNumber = Math.floor(currentPly / 2) + 1;
      const title = `${data.game.white_player} vs ${data.game.black_player} (Move ${moveNumber})`;
      await api.savePosition({
        fen: currentPosition.fen,
        title,
        game_id: gameId,
        move_number: moveNumber,
        played_move: currentMoveAnalysis?.played_move_san || undefined,
        best_move: currentMoveAnalysis?.best_move_san || undefined,
        evaluation: currentMoveAnalysis?.evaluation_after || 0,
        tags: currentMoveAnalysis?.classification ? [currentMoveAnalysis.classification] : ['review']
      });
      setBookmarkedFens(prev => new Set(prev).add(currentPosition.fen));
    } catch (err) {
      console.error('Failed to save position:', err);
    }
  };

  // Sound playback synchronization with deduplication (Authentic Chess.com Audio)
  useEffect(() => {
    if (!data || currentPly === 0) return;

    // Determine whether this ply was played by the user or opponent
    const isUserTurn = currentMoveAnalysis?.color === (data?.userColor === 'black' ? 'b' : 'w');
    const classification = (currentMoveAnalysis?.classification || '').toLowerCase();

    let soundToPlay: ChessSoundEvent;
    if (classification === 'brilliant') {
      soundToPlay = 'brilliant';
    } else if (classification === 'blunder') {
      soundToPlay = 'blunder';
    } else if (currentPosition.isCheckmate) {
      soundToPlay = 'checkmate';
    } else if (currentPosition.isCheck) {
      soundToPlay = 'check';
    } else if (currentPosition.isPromotion) {
      soundToPlay = 'promotion';
    } else if (currentPosition.isCastle) {
      soundToPlay = 'castle';
    } else if (currentPosition.isCapture) {
      soundToPlay = 'capture';
    } else {
      soundToPlay = isUserTurn ? 'move' : 'move_opponent';
    }

    audioManager.play(soundToPlay, `${gameId}-${currentPly}`);
  }, [currentPly, data, currentPosition, currentMoveAnalysis, gameId]);

  const toggleMute = () => {
    const willMute = !isMuted;
    setIsMuted(willMute);
    audioManager.setMasterMuted(willMute);
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setCurrentPly(prev => Math.max(0, prev - 1));
      } else if (e.key === 'ArrowRight' || e.key === 'Enter') {
        e.preventDefault();
        if (data) {
          setCurrentPly(prev => Math.min(data.moves.length, prev + 1));
        }
      } else if (e.key === 'Home') {
        e.preventDefault();
        setCurrentPly(0);
      } else if (e.key === 'End') {
        e.preventDefault();
        if (data) setCurrentPly(data.moves.length);
      } else if (e.key === ' ') {
        e.preventDefault();
        setAutoPlay(prev => !prev);
      } else if (e.key.toLowerCase() === 'b') {
        setShowBestArrow(prev => !prev);
      } else if (e.key.toLowerCase() === 'e') {
        setShowExplain(prev => !prev);
      } else if (e.key.toLowerCase() === 'f') {
        setBoardOrientation(prev => prev === 'white' ? 'black' : 'white');
      } else if (e.key.toLowerCase() === 'm') {
        toggleMute();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [data, isMuted]);

  // Automatically switch between Summary (ply 0) and Move-by-Move review (ply > 0)
  useEffect(() => {
    if (currentPly > 0) {
      setActiveRightTab('analysis');
    } else {
      setActiveRightTab('summary');
    }
  }, [currentPly]);

  // Autoplay timer
  useEffect(() => {
    if (!autoPlay || !data) return;
    const totalPlies = data.moves.length;
    if (currentPly >= totalPlies) {
      setAutoPlay(false);
      return;
    }

    const interval = setInterval(() => {
      setCurrentPly(prev => {
        if (prev >= totalPlies) {
          setAutoPlay(false);
          return prev;
        }
        return prev + 1;
      });
    }, 1300);

    return () => clearInterval(interval);
  }, [autoPlay, currentPly, data]);

  // Arrows for react-chessboard matching Chess.com warm orange arrow
  const arrows = useMemo(() => {
    const arr: Array<{ startSquare: string; endSquare: string; color: string }> = [];

    // Played move arrow (warm orange/yellow like Chess.com)
    if (currentPosition.lastMove) {
      arr.push({
        startSquare: currentPosition.lastMove[0],
        endSquare: currentPosition.lastMove[1],
        color: 'rgba(245, 158, 11, 0.88)' // Amber/orange played move arrow
      });
    }

    // Best move arrow if requested and different from played move
    if (currentMoveAnalysis && showBestArrow && currentMoveAnalysis.best_move && currentMoveAnalysis.best_move.length >= 4) {
      const bFrom = currentMoveAnalysis.best_move.substring(0, 2);
      const bTo = currentMoveAnalysis.best_move.substring(2, 4);
      if (!currentPosition.lastMove || bFrom !== currentPosition.lastMove[0] || bTo !== currentPosition.lastMove[1]) {
        arr.push({ startSquare: bFrom, endSquare: bTo, color: 'rgba(6, 182, 212, 0.85)' });
      }
    }
    return arr;
  }, [currentPosition.lastMove, currentMoveAnalysis, showBestArrow]);

  // Square highlighting styles
  const squareStyles = useMemo(() => {
    const styles: Record<string, React.CSSProperties> = {};
    if (currentPosition.lastMove) {
      styles[currentPosition.lastMove[0]] = { backgroundColor: 'rgba(250, 204, 21, 0.28)' };
      styles[currentPosition.lastMove[1]] = { backgroundColor: 'rgba(250, 204, 21, 0.38)' };
    }

    if (currentPosition.isCheck) {
      const kings = getKingSquares(currentPosition.fen);
      const activeKing = currentPly % 2 === 1 ? kings.blackKing : kings.whiteKing;
      if (activeKing) {
        styles[activeKing] = {
          background: 'radial-gradient(ellipse at center, rgba(239, 68, 68, 0.85) 0%, rgba(239, 68, 68, 0.2) 70%)'
        };
      }
    }

    return styles;
  }, [currentPosition, currentPly]);

  if (loading) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center gap-3 font-sans text-white">
        <RefreshCw className="w-8 h-8 text-[#81b64c] animate-spin" />
        <p className="text-sm font-medium text-zinc-400">Loading Game Review...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-md mx-auto my-14 p-6 bg-[#21201d] border border-[#312e2b] rounded-2xl text-center shadow-xl text-white font-sans space-y-4">
        <AlertCircle className="w-10 h-10 text-rose-500 mx-auto" />
        <h3 className="text-base font-black">Analysis Unavailable</h3>
        <p className="text-xs text-zinc-400">{error || 'Could not load game'}</p>
        <button onClick={onBack} className="py-2 px-4 rounded-xl bg-[#81b64c] text-white text-xs font-bold">
          Back to Dashboard
        </button>
      </div>
    );
  }

  const { game, analysis, moves } = data;
  const isAnalyzed = game.analysis_status === 'analyzed';

  const captured = getCapturedPiecesAndAdvantage(currentPosition.fen);

  const topPlayer = boardOrientation === 'white' ? {
    name: game.black_player,
    rating: game.black_rating,
    color: 'black',
    advantage: captured.blackAdvantage,
    captured: captured.blackCaptured
  } : {
    name: game.white_player,
    rating: game.white_rating,
    color: 'white',
    advantage: captured.whiteAdvantage,
    captured: captured.whiteCaptured
  };

  const bottomPlayer = boardOrientation === 'white' ? {
    name: game.white_player,
    rating: game.white_rating,
    color: 'white',
    advantage: captured.whiteAdvantage,
    captured: captured.whiteCaptured
  } : {
    name: game.black_player,
    rating: game.black_rating,
    color: 'black',
    advantage: captured.blackAdvantage,
    captured: captured.blackCaptured
  };

  // Subtle move annotation badge on the board square
  const playedToSquare = currentMoveAnalysis?.played_move?.substring(2, 4);
  const targetCoords = playedToSquare ? getSquareCoordinates(playedToSquare, boardOrientation) : null;

  return (
    <div className="w-full max-w-[1550px] mx-auto px-3 sm:px-5 lg:px-6 py-3 font-sans text-white">
      {/* Sound Settings Modal */}
      <SoundSettingsModal
        isOpen={soundModalOpen}
        onClose={() => setSoundModalOpen(false)}
        onSettingsChange={() => setIsMuted(!audioManager.getSettings().masterEnabled)}
      />

      {/* TOP APP BAR (Compact, Chess.com styling) */}
      <div className="bg-[#21201d] border border-[#312e2b] rounded-xl px-4 py-2.5 mb-3 shadow-sm flex flex-wrap items-center justify-between gap-3">
        {/* Left: Back button & Players */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="p-2 rounded-lg bg-[#272522] hover:bg-[#312e2b] border border-[#363431] text-zinc-300 hover:text-white transition-colors flex items-center gap-1.5 text-xs font-bold"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Back</span>
          </button>

          <div className="h-5 w-[1px] bg-[#363431] hidden sm:block" />

          <div className="flex items-center gap-2 text-xs">
            <span className="font-bold text-white">{game.white_player}</span>
            <span className="text-zinc-500 font-mono">({game.white_rating ?? '?'})</span>
            <span className="text-zinc-600 font-bold">vs</span>
            <span className="font-bold text-white">{game.black_player}</span>
            <span className="text-zinc-500 font-mono">({game.black_rating ?? '?'})</span>
          </div>
        </div>

        {/* Center: Opening & Details */}
        <div className="hidden md:flex items-center gap-4 text-xs text-zinc-400">
          <span className="font-medium text-zinc-200">{game.opening || 'Standard Chess'}</span>
          {game.eco && (
            <span className="px-1.5 py-0.5 rounded bg-[#272522] border border-[#363431] font-mono text-[10px] text-zinc-400">
              {game.eco}
            </span>
          )}
          <div className="flex items-center gap-1 text-[11px] text-zinc-500">
            <Calendar className="w-3.5 h-3.5" />
            <span>{new Date(game.played_at).toLocaleDateString()}</span>
          </div>
        </div>

        {/* Right: Quick Tools */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleMute}
            className={`p-2 rounded-lg border transition-colors ${
              isMuted
                ? 'bg-rose-950/60 border-rose-800 text-rose-400'
                : 'bg-[#272522] border-[#363431] text-[#81b64c] hover:text-white'
            }`}
            title={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>

          <button
            type="button"
            onClick={() => setSoundModalOpen(true)}
            className="p-2 rounded-lg bg-[#272522] hover:bg-[#312e2b] border border-[#363431] text-zinc-300 hover:text-white transition-colors"
            title="Audio settings"
          >
            <Sliders className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => setBoardOrientation(prev => prev === 'white' ? 'black' : 'white')}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#272522] hover:bg-[#312e2b] border border-[#363431] text-xs font-bold text-zinc-200 transition-colors"
            title="Flip board (F)"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Flip</span>
          </button>

          {onOpenInChessHelper && (
            <button
              type="button"
              onClick={() => onOpenInChessHelper(currentPosition.fen)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#81b64c] hover:bg-[#95c85b] text-white text-xs font-bold transition-all shadow-sm"
              title="Open position in Chess Helper"
            >
              <Compass className="w-3.5 h-3.5" />
              <span>Helper</span>
            </button>
          )}
        </div>
      </div>

      {/* Game Source & Engine Evaluation Sub-Bar */}
      <div className="bg-[#1c1b18] border border-[#2b2926] rounded-xl px-4 py-2 mb-3 shadow-sm flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-2.5">
          {game.platform === 'chess.com' ? (
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-md bg-[#272522] border border-[#3b3834] text-[10px] font-black tracking-wider text-emerald-400 uppercase">
                SOURCE: Chess.com
              </span>
              {game.original_url && (
                <a
                  href={game.original_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-2.5 py-1 rounded-md bg-[#252320] hover:bg-[#312e2b] border border-[#363431] text-[11px] font-bold text-zinc-300 hover:text-white transition-all flex items-center gap-1.5 active:scale-98"
                >
                  <span>Open Original Game</span>
                  <ExternalLink className="w-3 h-3 text-zinc-400" />
                </a>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-md bg-[#272522] border border-[#3b3834] text-[10px] font-black tracking-wider text-zinc-400 uppercase">
                SOURCE: {game.platform === 'manual' ? 'PGN Import' : game.platform}
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 text-zinc-400 text-xs font-medium">
          <span className="w-2 h-2 rounded-full bg-[#81b64c] animate-pulse"></span>
          <span>Analysis: <strong className="text-zinc-200">AetherChess</strong> • <strong className="text-[#81b64c]">Stockfish 18</strong></span>
        </div>
      </div>

      {/* Analysis Progress Banner if analyzing */}
      {!isAnalyzed && (
        <div className="mb-3 p-3 rounded-xl bg-[#21201d] border border-[#312e2b] shadow-sm flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-xs font-bold text-zinc-200">
            <span className="flex items-center gap-2">
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#81b64c]" />
              Stockfish 18 NNUE analyzing game...
            </span>
            <span className="text-[#81b64c] font-mono font-black">{analysisProgress ?? 0}%</span>
          </div>
          <div className="w-full h-1.5 rounded-full bg-[#2a2825] overflow-hidden">
            <div
              className="h-full bg-[#81b64c] transition-all duration-300"
              style={{ width: `${analysisProgress ?? 10}%` }}
            />
          </div>
        </div>
      )}

      {/* 2-COLUMN CHESS.COM GAME REVIEW LAYOUT */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* =========================================================================
            LEFT COLUMN (lg:col-span-7): Chess Board + Eval Bar + Player Cards
            ========================================================================= */}
        <div className="lg:col-span-7 flex flex-col gap-2">
          {/* Top Opponent Bar */}
          <div className="flex items-center justify-between bg-[#21201d] border border-[#312e2b] px-3.5 py-2 rounded-xl">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-[#2b2926] border border-[#363431] flex items-center justify-center p-1 shadow-inner">
                <img
                  src={topPlayer.color === 'white' ? '/pieces/neo/wk.png' : '/pieces/neo/bk.png'}
                  alt={topPlayer.color}
                  className="w-full h-full object-contain pointer-events-none"
                />
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-xs font-bold text-white">{topPlayer.name}</span>
                <span className="text-[11px] font-mono text-zinc-400">({topPlayer.rating || '?'})</span>
              </div>
              {topPlayer.advantage > 0 && (
                <span className="text-[10px] font-mono font-bold text-[#81b64c]">+{topPlayer.advantage}</span>
              )}
            </div>

            {/* Captured Pieces by Opponent */}
            <div className="flex items-center gap-0.5">
              {topPlayer.captured.map((p, idx) => {
                const isWhite = p === p.toUpperCase();
                const src = `/pieces/neo/${isWhite ? 'w' : 'b'}${p.toLowerCase()}.png`;
                return (
                  <img
                    key={idx}
                    src={src}
                    alt={p}
                    className="w-4 h-4 object-contain opacity-90 -ml-1 first:ml-0 pointer-events-none select-none"
                  />
                );
              })}
            </div>
          </div>

          {/* Board Container with Vertical Eval Bar */}
          <div className="flex gap-2 items-stretch justify-center">
            <EvalBar
              scoreCp={currentScoreCp}
              orientation={boardOrientation}
            />

            <div className="relative flex-1 max-w-[540px] aspect-square rounded-xl overflow-hidden shadow-2xl border border-[#363431] bg-[#769656]">
              <Chessboard
                options={{
                  position: currentPosition.fen,
                  boardOrientation: boardOrientation,
                  arrows: arrows,
                  squareStyles: squareStyles,
                  allowDragging: false,
                  pieces: neoCustomPieces as any,
                  darkSquareStyle: { backgroundColor: '#769656' },
                  lightSquareStyle: { backgroundColor: '#eeeed2' }
                }}
              />

              {/* Classification Badge on the target square (Chess.com style) */}
              {currentMoveAnalysis && targetCoords && currentMoveAnalysis.classification && (
                <div
                  className="absolute pointer-events-none z-20"
                  style={{
                    left: targetCoords.left,
                    top: targetCoords.top,
                    width: targetCoords.width,
                    height: targetCoords.height
                  }}
                >
                  <div className="absolute -top-1.5 -right-1.5 transform">
                    <ClassificationBadge classification={currentMoveAnalysis.classification} size="md" />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Bottom Player Bar */}
          <div className="flex items-center justify-between bg-[#21201d] border border-[#312e2b] px-3.5 py-2 rounded-xl">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-[#2b2926] border border-[#363431] flex items-center justify-center p-1 shadow-inner">
                <img
                  src={bottomPlayer.color === 'white' ? '/pieces/neo/wk.png' : '/pieces/neo/bk.png'}
                  alt={bottomPlayer.color}
                  className="w-full h-full object-contain pointer-events-none"
                />
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-xs font-bold text-white">{bottomPlayer.name}</span>
                <span className="text-[11px] font-mono text-zinc-400">({bottomPlayer.rating || '?'})</span>
                {((data?.userColor === bottomPlayer.color) || (!data?.userColor && boardOrientation === bottomPlayer.color)) && (
                  <span className="text-[9px] font-black uppercase text-[#81b64c] bg-[#81b64c]/15 px-1 py-0.2 rounded border border-[#81b64c]/30">
                    You
                  </span>
                )}
              </div>
              {bottomPlayer.advantage > 0 && (
                <span className="text-[10px] font-mono font-bold text-[#81b64c]">+{bottomPlayer.advantage}</span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setBoardOrientation(prev => prev === 'white' ? 'black' : 'white')}
                className="p-1 rounded hover:bg-[#312e2b] text-zinc-400 hover:text-white transition-colors flex items-center gap-1 text-[10px] font-bold"
                title="Flip board (F)"
              >
                <RotateCcw className="w-3 h-3" />
                <span className="hidden sm:inline">Flip</span>
              </button>

              {/* Captured Pieces by Player */}
              <div className="flex items-center gap-0.5">
                {bottomPlayer.captured.map((p, idx) => {
                  const isWhite = p === p.toUpperCase();
                  const src = `/pieces/neo/${isWhite ? 'w' : 'b'}${p.toLowerCase()}.png`;
                  return (
                    <img
                      key={idx}
                      src={src}
                      alt={p}
                      className="w-4 h-4 object-contain opacity-90 -ml-1 first:ml-0 pointer-events-none select-none"
                    />
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* =========================================================================
            RIGHT COLUMN (lg:col-span-5): Chess.com Game Review Panel (Cat Coach)
            ========================================================================= */}
        <div className="lg:col-span-5 bg-[#262421] border border-[#363431] rounded-2xl p-4 shadow-xl flex flex-col gap-3 font-sans">
          {/* Header of the Review Box */}
          <div className="flex items-center justify-between pb-2.5 border-b border-[#363431]">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  if (activeRightTab === 'analysis' || currentPly > 0) {
                    setCurrentPly(0);
                    setActiveRightTab('summary');
                  } else {
                    onBack();
                  }
                }}
                className="p-1 rounded-lg hover:bg-[#312e2b] text-zinc-400 hover:text-white transition-colors"
                title={activeRightTab === 'analysis' ? "Back to Summary" : "Back to Library"}
              >
                <ChevronLeft className="w-5 h-5" />
              </button>

              <button
                type="button"
                className="p-1 rounded-lg hover:bg-[#312e2b] text-zinc-400 hover:text-rose-400 transition-colors"
                title="Favorite"
              >
                <Heart className="w-4 h-4" />
              </button>

              {/* Green Game Review Badge */}
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#272f22] border border-[#3e4f35]">
                <div className="w-4 h-4 rounded-full bg-[#81b64c] flex items-center justify-center text-[10px] text-white">
                  ★
                </div>
                <span className="text-xs font-black text-[#81b64c] tracking-wide">
                  Game Review
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setActiveRightTab(prev => prev === 'analysis' ? 'summary' : 'analysis')}
              className="p-1.5 rounded-lg hover:bg-[#312e2b] text-zinc-400 hover:text-white transition-colors"
              title="Toggle View"
            >
              <Search className="w-4 h-4" />
            </button>
          </div>

          {/* VIEW A: Summary View (media_1788729982748.png & media_1788729994083.png) */}
          {activeRightTab === 'summary' && analysis && (
            <ReviewSummary
              game={game}
              analysis={analysis}
              moves={moves}
              whitePlayer={game.white_player}
              blackPlayer={game.black_player}
              userColor={data?.userColor || boardOrientation}
              onSelectPly={ply => {
                setCurrentPly(ply);
                setActiveRightTab('analysis');
              }}
              onStartReview={() => {
                setCurrentPly(1);
                setActiveRightTab('analysis');
              }}
            />
          )}

          {/* VIEW B: Move-by-Move Review View (media_1788730011567.png & media_1788730025822.png) */}
          {activeRightTab === 'analysis' && (
            <div className="flex flex-col gap-3">
              {/* Cat Coach Speech Bubble + Explain & Next Buttons */}
              <CatCoachBubble
                currentMove={currentMoveAnalysis}
                openingName={game.opening}
                showExplain={showExplain}
                onToggleExplain={() => setShowExplain(prev => !prev)}
                onNext={() => setCurrentPly(prev => Math.min(moves.length, prev + 1))}
                hasNext={currentPly < moves.length}
                onPrevious={() => setCurrentPly(prev => Math.max(0, prev - 1))}
                hasPrevious={currentPly > 0}
                showBest={showBestArrow}
                onToggleBest={() => setShowBestArrow(prev => !prev)}
                explanationLevel={explanationLevel}
                onChangeExplanationLevel={setExplanationLevel}
                onOpenInChessHelper={() => onOpenInChessHelper?.(currentPosition.fen)}
                onBookmark={handleBookmarkCurrentPosition}
                isBookmarked={bookmarkedFens.has(currentPosition.fen)}
                customExplanation={customExplanation}
                isLoadingExplanation={loadingExplanation}
              />

              {/* Move Notation Table with inline classification badges */}
              <MoveList
                moves={moves}
                currentPly={currentPly}
                onSelectPly={ply => setCurrentPly(ply)}
              />

              {/* Bottom Section: Evaluation Graph Timeline + Navigation + Skills/Share */}
              <div className="bg-[#21201d] rounded-2xl border border-[#312e2b] p-3 shadow-md space-y-2">
                <EvalGraph
                  moves={moves}
                  currentPly={currentPly}
                  onSelectPly={ply => setCurrentPly(ply)}
                  height={65}
                />

                {/* Navigation Buttons: |< < ▶ > >| */}
                <div className="flex items-center justify-between pt-1 border-t border-[#312e2b]">
                  <button
                    type="button"
                    onClick={() => setCurrentPly(0)}
                    disabled={currentPly === 0}
                    className="p-2 rounded-lg hover:bg-[#2c2a26] text-zinc-400 hover:text-white disabled:opacity-25 transition-colors"
                    title="First move (Home)"
                  >
                    <ChevronsLeft className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    onClick={() => setCurrentPly(prev => Math.max(0, prev - 1))}
                    disabled={currentPly === 0}
                    className="p-2 rounded-lg hover:bg-[#2c2a26] text-zinc-400 hover:text-white disabled:opacity-25 transition-colors"
                    title="Previous move (Arrow Left)"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    onClick={() => setAutoPlay(prev => !prev)}
                    className="p-2 rounded-lg hover:bg-[#2c2a26] text-zinc-200 hover:text-white transition-colors"
                    title="Auto play (Space)"
                  >
                    {autoPlay ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-current" />}
                  </button>

                  <button
                    type="button"
                    onClick={() => setCurrentPly(prev => Math.min(moves.length, prev + 1))}
                    disabled={currentPly >= moves.length}
                    className="p-2 rounded-lg hover:bg-[#2c2a26] text-zinc-400 hover:text-white disabled:opacity-25 transition-colors"
                    title="Next move (Arrow Right / Enter)"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    onClick={() => setCurrentPly(moves.length)}
                    disabled={currentPly >= moves.length}
                    className="p-2 rounded-lg hover:bg-[#2c2a26] text-zinc-400 hover:text-white disabled:opacity-25 transition-colors"
                    title="Last move (End)"
                  >
                    <ChevronsRight className="w-4 h-4" />
                  </button>
                </div>

                {/* Skills & Share Buttons */}
                <div className="flex items-center justify-around pt-1 border-t border-[#312e2b]/60 text-xs font-bold text-zinc-400">
                  <button
                    type="button"
                    className="flex items-center gap-1.5 py-1 px-3 rounded-lg hover:text-white hover:bg-[#2c2a26] transition-colors"
                  >
                    <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                    <span>Skills</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (navigator.clipboard) {
                        navigator.clipboard.writeText(window.location.href);
                        alert('Game link copied to clipboard!');
                      }
                    }}
                    className="flex items-center gap-1.5 py-1 px-3 rounded-lg hover:text-white hover:bg-[#2c2a26] transition-colors"
                  >
                    <Share2 className="w-3.5 h-3.5" />
                    <span>Share</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
