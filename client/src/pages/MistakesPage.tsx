import React, { useState, useEffect, useCallback } from 'react';
import { Chess } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import { api } from '../services/api';
import { audioManager } from '../services/audioManager';
import { MistakeItem, MistakePattern, WhatIfResult } from '../types';
import { neoCustomPieces } from '../utils/chessPieces';
import { 
  AlertTriangle, Target, Swords, Play, RefreshCw, 
  ChevronRight, Sparkles, CheckCircle2, XCircle, ArrowRight,
  TrendingDown, ShieldAlert, Award, Compass, Eye, BookOpen, Layers
} from 'lucide-react';

interface MistakesPageProps {
  onOpenInChessHelper: (fen: string) => void;
  onSelectGameReview: (gameId: string) => void;
}

export const MistakesPage: React.FC<MistakesPageProps> = ({
  onOpenInChessHelper,
  onSelectGameReview
}) => {
  const [patterns, setPatterns] = useState<MistakePattern[]>([]);
  const [totalGamesSampled, setTotalGamesSampled] = useState<number>(0);
  const [mistakes, setMistakes] = useState<MistakeItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [phaseFilter, setPhaseFilter] = useState<string>('all');
  const [expandedPatternId, setExpandedPatternId] = useState<string | null>(null);

  // Practice Mode State
  const [practiceMistake, setPracticeMistake] = useState<MistakeItem | null>(null);
  const [practiceFen, setPracticeFen] = useState<string>('');
  const [practiceUserMove, setPracticeUserMove] = useState<string | null>(null);
  const [practiceAnalyzing, setPracticeAnalyzing] = useState<boolean>(false);
  const [practiceResult, setPracticeResult] = useState<WhatIfResult | null>(null);
  const [practiceFeedback, setPracticeFeedback] = useState<{ isBest: boolean; text: string } | null>(null);

  const fetchMistakesData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [patternsRes, mistakesRes] = await Promise.all([
        api.getMistakePatterns(),
        api.getMistakeCollection({
          category: categoryFilter !== 'all' ? categoryFilter : undefined,
          phase: phaseFilter !== 'all' ? phaseFilter : undefined,
          limit: 40
        })
      ]);
      setPatterns(patternsRes.patterns || []);
      setTotalGamesSampled(patternsRes.totalGamesAnalyzed || 0);
      setMistakes(mistakesRes.mistakes || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load mistakes');
    } finally {
      setLoading(false);
    }
  }, [categoryFilter, phaseFilter]);

  useEffect(() => {
    fetchMistakesData();
  }, [fetchMistakesData]);

  // Start Practice session for a mistake
  const handleStartPractice = (item: MistakeItem) => {
    setPracticeMistake(item);
    setPracticeFen(item.fen);
    setPracticeUserMove(null);
    setPracticeResult(null);
    setPracticeFeedback(null);
  };

  // Handle piece move in Practice mode
  const handlePracticePieceDrop = (args: any): boolean => {
    const sourceSquare = args?.sourceSquare;
    const targetSquare = args?.targetSquare;
    if (!practiceMistake || practiceAnalyzing || !sourceSquare || !targetSquare) return false;

    try {
      const chess = new Chess(practiceFen);
      const move = chess.move({
        from: sourceSquare as any,
        to: targetSquare as any,
        promotion: 'q'
      });
      if (!move) return false;

      // Play move sound
      if (move.captured) audioManager.play('capture');
      else audioManager.play('move');

      setPracticeUserMove(move.san);
      setPracticeAnalyzing(true);

      // Check if user played Stockfish's best move directly
      const isBestMove = move.san.replace(/[+#]/g, '') === practiceMistake.bestMoveSan.replace(/[+#]/g, '');

      if (isBestMove) {
        audioManager.play('best');
        setPracticeFeedback({
          isBest: true,
          text: `🎯 Excellent! You found Stockfish's top recommended move (${practiceMistake.bestMoveSan}).`
        });
      } else {
        audioManager.play('blunder');
      }

      // Analyze user's move with What-If engine asynchronously
      api.analyzeWhatIf(practiceFen, move.san, 18).then(whatIf => {
        setPracticeResult(whatIf);
        if (!isBestMove) {
          setPracticeFeedback({
            isBest: false,
            text: `You played ${move.san} (${whatIf.evalDifferencePawns >= 0 ? '+' : ''}${whatIf.evalDifferencePawns} vs best move ${practiceMistake.bestMoveSan}).`
          });
        }
      }).catch(err => {
        console.error('What-if practice analysis failed:', err);
      }).finally(() => {
        setPracticeAnalyzing(false);
      });

      return true;
    } catch {
      setPracticeAnalyzing(false);
      return false;
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 font-sans">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-[#E8E6E1]">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center font-bold">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-[#1A1919] tracking-tight">
              My Mistakes &amp; Practice
            </h1>
          </div>
          <p className="text-sm text-[#71706E] mt-1 font-medium">
            Turn your blunders into strengths. Identify personal mistake patterns and practice key positions until mastered.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchMistakesData}
            className="px-4 py-2 rounded-full bg-white hover:bg-[#F5F4F2] text-[#1A1919] font-bold text-xs shadow-sm transition-all border border-[#D5D3CE] flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh Analysis</span>
          </button>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────────────
          SECTION 1: PERSONAL MISTAKE PATTERNS (Feature 5)
          ───────────────────────────────────────────────────────────────────────── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-black text-[#1A1919] flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#0A8A36]" />
              <span>Your Recurring Patterns</span>
            </h2>
            <p className="text-xs text-[#71706E]">
              Cross-game pattern detection based on {totalGamesSampled} analyzed games in your library.
            </p>
          </div>
        </div>

        {patterns.length === 0 ? (
          <div className="bg-white border border-[#E8E6E1] rounded-3xl p-6 text-center shadow-sm">
            <Award className="w-8 h-8 text-[#0A8A36] mx-auto mb-2 opacity-80" />
            <h3 className="text-sm font-bold text-[#1A1919]">No Critical Recurring Flaws Detected Yet</h3>
            <p className="text-xs text-[#71706E] mt-1 max-w-md mx-auto">
              Analyze more games with Game Review to discover meaningful patterns across openings, tactics, and endgames.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {patterns.map((p) => {
              const isExpanded = expandedPatternId === p.id;
              return (
                <div 
                  key={p.id}
                  className="bg-white border border-[#E8E6E1] rounded-3xl p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between space-y-4"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 text-[10px] font-black uppercase tracking-wider border border-amber-200">
                        Recurring Flaw
                      </span>
                      <span className="text-xs font-black text-rose-600 flex items-center gap-1">
                        <TrendingDown className="w-3.5 h-3.5" />
                        -{p.avgEvalDropPawns} avg drop
                      </span>
                    </div>

                    <h3 className="text-base font-black text-[#1A1919] tracking-tight">{p.name}</h3>
                    <p className="text-xs text-[#71706E] font-medium leading-relaxed">{p.description}</p>
                  </div>

                  <div className="pt-3 border-t border-[#F0EFEA] space-y-3">
                    <div className="flex items-center justify-between text-xs font-bold text-[#1A1919]">
                      <span>Appeared in:</span>
                      <span className="font-mono text-[#0A8A36]">
                        {p.gameCount} of your {p.totalGamesSampled} games ({p.frequencyPct}%)
                      </span>
                    </div>

                    <button
                      onClick={() => setExpandedPatternId(isExpanded ? null : p.id)}
                      className="w-full py-2 px-3 rounded-xl bg-[#F5F4F2] hover:bg-[#EBE9E4] text-[#1A1919] text-xs font-bold transition-all flex items-center justify-center gap-1.5"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>{isExpanded ? 'Hide Positions' : 'View Positions & Games'}</span>
                    </button>

                    {/* Expandable Example Positions */}
                    {isExpanded && (
                      <div className="space-y-2 pt-2 border-t border-dashed border-[#D5D3CE] animate-in fade-in">
                        {p.examples.map((ex, idx) => (
                          <div 
                            key={idx}
                            className="bg-[#FBFBFA] border border-[#E8E6E1] rounded-xl p-2.5 text-xs flex items-center justify-between gap-2"
                          >
                            <div>
                              <p className="font-bold text-[#1A1919]">vs {ex.opponent}</p>
                              <p className="text-[11px] text-[#71706E]">
                                Move {ex.moveNumber}: played <span className="font-mono font-bold text-rose-600">{ex.playedMoveSan}</span> (best: <span className="font-mono font-bold text-[#0A8A36]">{ex.bestMoveSan}</span>)
                              </p>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                onClick={() => handleStartPractice({
                                  id: `${ex.gameId}_${ex.moveNumber}`,
                                  gameId: ex.gameId,
                                  opponentName: ex.opponent,
                                  playedAt: ex.playedAt,
                                  moveNumber: ex.moveNumber,
                                  ply: ex.moveNumber * 2,
                                  userColor: 'w',
                                  playedMoveSan: ex.playedMoveSan,
                                  bestMoveSan: ex.bestMoveSan,
                                  fen: ex.fen,
                                  evalBefore: 0,
                                  evalAfter: 0,
                                  centipawnLoss: 200,
                                  evalSwingPawns: '2.0',
                                  classification: ex.classification as any,
                                  explanation: '',
                                  phase: 'middlegame',
                                  isTactical: true
                                })}
                                className="px-2 py-1 rounded-lg bg-[#6CFF93] hover:bg-[#5FE683] text-[#1A1919] font-black text-[10px] flex items-center gap-1"
                              >
                                <Play className="w-2.5 h-2.5 fill-current" />
                                <span>Practice</span>
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ─────────────────────────────────────────────────────────────────────────
          SECTION 2: INTERACTIVE PRACTICE MODAL (Feature 7)
          ───────────────────────────────────────────────────────────────────────── */}
      {practiceMistake && (
        <div className="bg-[#1A1919] text-white border border-[#2E2C29] rounded-3xl p-6 shadow-2xl space-y-6">
          <div className="flex items-start justify-between border-b border-[#2E2C29] pb-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full bg-[#6CFF93]/20 text-[#6CFF93] text-[10px] font-black uppercase tracking-wider border border-[#6CFF93]/30">
                  Interactive Practice
                </span>
                <span className="text-xs text-zinc-400">vs {practiceMistake.opponentName} • Move {practiceMistake.moveNumber}</span>
              </div>
              <h2 className="text-xl font-black text-white tracking-tight">
                What Would You Play?
              </h2>
              <p className="text-xs text-zinc-400">
                In this actual game position, a critical move was missed. Play your best move on the board to test yourself.
              </p>
            </div>
            <button
              onClick={() => setPracticeMistake(null)}
              className="p-1.5 rounded-lg bg-zinc-800 text-zinc-400 hover:text-white"
            >
              ✕
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            {/* Interactive Board */}
            <div className="lg:col-span-6 flex justify-center">
              <div className="w-full max-w-[420px] aspect-square rounded-2xl overflow-hidden shadow-2xl border border-zinc-700 bg-zinc-900">
                <Chessboard
                  options={{
                    position: practiceFen,
                    boardOrientation: practiceMistake.userColor === 'b' ? 'black' : 'white',
                    allowDragging: !practiceAnalyzing,
                    onPieceDrop: handlePracticePieceDrop,
                    pieces: neoCustomPieces as any,
                    darkSquareStyle: { backgroundColor: '#769656' },
                    lightSquareStyle: { backgroundColor: '#eeeed2' }
                  }}
                />
              </div>
            </div>

            {/* Practice Result & Feedback */}
            <div className="lg:col-span-6 space-y-5">
              {!practiceResult ? (
                <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-6 text-center space-y-3">
                  <Target className="w-10 h-10 text-[#6CFF93] mx-auto animate-bounce" />
                  <h3 className="text-base font-black text-white">Find the Best Continuation</h3>
                  <p className="text-xs text-zinc-400 max-w-sm mx-auto leading-relaxed">
                    Make your move by dragging any piece on the board. Stockfish 18 will evaluate your choice against the best line.
                  </p>
                </div>
              ) : (
                <div className="space-y-4 animate-in fade-in">
                  {/* Feedback Card */}
                  <div className={`p-4 rounded-2xl border flex items-start gap-3 ${
                    practiceFeedback?.isBest
                      ? 'bg-[#0A8A36]/15 border-[#0A8A36]/40 text-[#6CFF93]'
                      : 'bg-rose-950/30 border-rose-900/40 text-rose-300'
                  }`}>
                    {practiceFeedback?.isBest ? (
                      <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5 text-[#6CFF93]" />
                    ) : (
                      <XCircle className="w-5 h-5 shrink-0 mt-0.5 text-rose-400" />
                    )}
                    <div className="space-y-1 text-xs">
                      <p className="font-bold text-sm text-white">{practiceFeedback?.text}</p>
                      <p className="text-zinc-300 leading-relaxed">{practiceResult.explanation}</p>
                    </div>
                  </div>

                  {/* Side-by-Side Evaluation */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3.5 space-y-1">
                      <span className="text-[10px] font-black uppercase text-zinc-400 tracking-wider">Your Move</span>
                      <p className="text-base font-black text-white font-mono">{practiceResult.userMove.san}</p>
                      <span className="text-xs font-mono text-zinc-400">
                        Eval: {(practiceResult.whatIf.scoreCp / 100).toFixed(2)}
                      </span>
                    </div>

                    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3.5 space-y-1">
                      <span className="text-[10px] font-black uppercase text-[#6CFF93] tracking-wider">Stockfish Best Move</span>
                      <p className="text-base font-black text-[#6CFF93] font-mono">{practiceResult.baseline.bestMoveSan}</p>
                      <span className="text-xs font-mono text-zinc-400">
                        Eval: {(practiceResult.baseline.scoreCp / 100).toFixed(2)}
                      </span>
                    </div>
                  </div>

                  {/* Continuation preview */}
                  {practiceResult.whatIf.continuationSan.length > 0 && (
                    <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-3 text-xs space-y-1">
                      <span className="text-[10px] font-bold text-zinc-400 uppercase">Opponent Refutation / Response:</span>
                      <p className="font-mono text-zinc-300 font-bold">
                        {practiceResult.whatIf.continuationSan.slice(0, 4).join(' ')}
                      </p>
                    </div>
                  )}

                  {/* Action row */}
                  <div className="flex flex-wrap items-center gap-3 pt-2">
                    <button
                      onClick={() => handleStartPractice(practiceMistake)}
                      className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-bold text-xs transition-all flex items-center gap-1.5"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Retry Position</span>
                    </button>

                    <button
                      onClick={() => onOpenInChessHelper(practiceMistake.fen)}
                      className="px-4 py-2 rounded-xl bg-[#6CFF93] hover:bg-[#5FE683] text-[#1A1919] font-black text-xs transition-all flex items-center gap-1.5 shadow-sm"
                    >
                      <Compass className="w-3.5 h-3.5" />
                      <span>Analyze Deeper in Chess Helper</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────────────
          SECTION 3: MISTAKE COLLECTION (Feature 6)
          ───────────────────────────────────────────────────────────────────────── */}
      <div className="space-y-4 pt-4 border-t border-[#E8E6E1]">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-black text-[#1A1919] flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-[#0A8A36]" />
              <span>Mistake Collection</span>
            </h2>
            <p className="text-xs text-[#71706E]">
              Important moments where critical evaluation was lost across your analyzed library.
            </p>
          </div>

          {/* Filter tabs */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Category */}
            <div className="flex items-center gap-1 bg-[#F5F4F2] p-1 rounded-full border border-[#E8E6E1] text-xs font-bold">
              {(['all', 'blunder', 'mistake', 'inaccuracy'] as const).map(cat => (
                <button
                  key={cat}
                  onClick={() => setCategoryFilter(cat)}
                  className={`px-3 py-1 rounded-full capitalize transition-all ${
                    categoryFilter === cat ? 'bg-white text-[#1A1919] shadow-sm' : 'text-[#71706E] hover:text-[#1A1919]'
                  }`}
                >
                  {cat === 'all' ? 'All Mistakes' : `${cat}s`}
                </button>
              ))}
            </div>

            {/* Phase */}
            <div className="flex items-center gap-1 bg-[#F5F4F2] p-1 rounded-full border border-[#E8E6E1] text-xs font-bold">
              {(['all', 'tactical', 'opening', 'middlegame', 'endgame'] as const).map(ph => (
                <button
                  key={ph}
                  onClick={() => setPhaseFilter(ph)}
                  className={`px-3 py-1 rounded-full capitalize transition-all ${
                    phaseFilter === ph ? 'bg-white text-[#1A1919] shadow-sm' : 'text-[#71706E] hover:text-[#1A1919]'
                  }`}
                >
                  {ph}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Mistake Items Grid */}
        {mistakes.length === 0 ? (
          <div className="bg-white border border-[#E8E6E1] rounded-3xl p-8 text-center shadow-sm">
            <CheckCircle2 className="w-8 h-8 text-[#0A8A36] mx-auto mb-2 opacity-80" />
            <p className="text-sm font-bold text-[#1A1919]">No mistakes matching selected filters</p>
            <p className="text-xs text-[#71706E] mt-1">Try selecting different categories or import new games.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {mistakes.map((m) => {
              const isBlunder = m.classification === 'blunder';
              return (
                <div
                  key={m.id}
                  className="bg-white border border-[#E8E6E1] rounded-3xl p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between space-y-4"
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                        isBlunder ? 'bg-rose-100 text-rose-700 border border-rose-200' : 'bg-amber-100 text-amber-700 border border-amber-200'
                      }`}>
                        {m.classification}
                      </span>
                      <span className="text-xs font-bold text-rose-600 font-mono">
                        -{m.evalSwingPawns} pawns
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs text-[#71706E]">
                      <span className="font-bold text-[#1A1919]">vs {m.opponentName}</span>
                      <span>Move {m.moveNumber} ({m.phase})</span>
                    </div>

                    {/* Move Comparison Row */}
                    <div className="bg-[#FBFBFA] border border-[#E8E6E1] rounded-2xl p-3 flex items-center justify-between text-xs">
                      <div>
                        <span className="text-[10px] text-[#71706E] uppercase font-bold block">You Played</span>
                        <span className="font-mono font-black text-rose-600 text-sm">{m.playedMoveSan}</span>
                      </div>
                      <ArrowRight className="w-4 h-4 text-[#D5D3CE]" />
                      <div className="text-right">
                        <span className="text-[10px] text-[#0A8A36] uppercase font-bold block">Best Move</span>
                        <span className="font-mono font-black text-[#0A8A36] text-sm">{m.bestMoveSan}</span>
                      </div>
                    </div>

                    {m.explanation && (
                      <p className="text-xs text-[#71706E] line-clamp-2 leading-relaxed">
                        {m.explanation}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 pt-2 border-t border-[#F0EFEA]">
                    <button
                      onClick={() => handleStartPractice(m)}
                      className="flex-1 py-2 px-3 rounded-xl bg-[#6CFF93] hover:bg-[#5FE683] text-[#1A1919] text-xs font-black transition-all flex items-center justify-center gap-1.5 shadow-sm"
                    >
                      <Play className="w-3 h-3 fill-current" />
                      <span>Practice</span>
                    </button>

                    <button
                      onClick={() => onOpenInChessHelper(m.fen)}
                      className="py-2 px-3 rounded-xl bg-[#F5F4F2] hover:bg-[#EBE9E4] text-[#1A1919] text-xs font-bold transition-all flex items-center gap-1"
                      title="Open in Chess Helper"
                    >
                      <Compass className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
