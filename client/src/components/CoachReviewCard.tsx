import React from 'react';
import { MoveAnalysis } from '../types';
import { 
  parsePieceFigurine, 
  getDynamicCommentary 
} from '../utils/chessText';
import { 
  ChevronLeft, ChevronRight, Lightbulb, Compass,
  Sparkles, TrendingUp, TrendingDown, ArrowRight
} from 'lucide-react';

interface CoachReviewCardProps {
  currentMove?: MoveAnalysis;
  accuracy?: number;
  qualityCounts?: {
    best: number;
    inaccuracies: number;
    mistakes: number;
    blunders: number;
  };
  openingName?: string;
  showExplain: boolean;
  onToggleExplain: () => void;
  showBest: boolean;
  onToggleBest: () => void;
  onPrevious: () => void;
  onNext: () => void;
  hasPrevious: boolean;
  hasNext: boolean;
}

export const CoachReviewCard: React.FC<CoachReviewCardProps> = ({
  currentMove,
  accuracy,
  qualityCounts,
  openingName,
  showExplain,
  onToggleExplain,
  showBest,
  onToggleBest,
  onPrevious,
  onNext,
  hasPrevious,
  hasNext
}) => {
  const commentary = getDynamicCommentary(currentMove, openingName);
  const { glyph, glyphColor, cleanSan } = parsePieceFigurine(currentMove?.played_move_san || '');
  const bestFigurine = parsePieceFigurine(currentMove?.best_move_san || '');

  // Numerical Stockfish evaluation
  let evalFormatted = '0.00';
  if (currentMove) {
    const cp = currentMove.evaluation_after;
    const pawns = (cp / 100).toFixed(2);
    evalFormatted = cp > 0 ? `+${pawns}` : pawns;
  }

  const isPositiveEval = (currentMove?.evaluation_after ?? 0) >= 0;

  return (
    <div className="bg-[#14171F]/95 backdrop-blur-md border border-[#262D3D] rounded-2xl p-4 shadow-xl font-sans space-y-3.5 transition-all">
      {/* Top Header: Game Review Accuracy Pill & Quality Indicators */}
      {accuracy !== undefined && (
        <div className="pb-3 border-b border-[#232A38] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#6CFF93] animate-pulse" />
            <span className="text-[11px] font-black uppercase tracking-wider text-zinc-300 font-display">
              Game Review
            </span>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-baseline gap-1 bg-[#1C202B] px-2.5 py-1 rounded-full border border-[#2D3546]">
              <span className="text-sm font-black text-[#6CFF93] font-mono tracking-tight">{accuracy}%</span>
              <span className="text-[10px] text-zinc-400 font-bold uppercase">Accuracy</span>
            </div>

            {qualityCounts && (
              <div className="hidden sm:flex items-center gap-1 text-[11px] font-mono">
                <span className="px-2 py-0.5 rounded bg-emerald-950/80 border border-emerald-500/40 text-[#6CFF93] font-bold" title="Best moves">
                  {qualityCounts.best}✓
                </span>
                {qualityCounts.blunders > 0 && (
                  <span className="px-2 py-0.5 rounded bg-rose-950/80 border border-rose-500/40 text-rose-300 font-bold" title="Blunders">
                    {qualityCounts.blunders}??
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Critical Move Banner: Large Figurine Notation + Stylish Badge */}
      {currentMove ? (
        <div className="space-y-3">
          {/* Badge & Eval Row */}
          <div className="flex items-center justify-between">
            {/* Glowing Classification Badge */}
            <div className={`px-3 py-1 rounded-full border text-xs font-black tracking-wide flex items-center gap-1.5 shadow-md ${commentary.badge.pillBg} ${commentary.badge.pillBorder} ${commentary.badge.textColor} ${commentary.badge.glowColor}`}>
              <span className="text-xs">{commentary.badge.symbol}</span>
              <span className="font-display uppercase">{commentary.badge.label}</span>
            </div>

            {/* Numerical Stockfish Score */}
            <div className="flex items-center gap-1.5">
              {isPositiveEval ? (
                <TrendingUp className="w-3.5 h-3.5 text-[#6CFF93]" />
              ) : (
                <TrendingDown className="w-3.5 h-3.5 text-rose-400" />
              )}
              <span className={`font-mono text-sm font-black px-2 py-0.5 rounded-lg bg-[#1B1F2A] border border-[#262E3E] ${
                isPositiveEval ? 'text-[#6CFF93]' : 'text-rose-400'
              }`}>
                {evalFormatted}
              </span>
            </div>
          </div>

          {/* Move Notation Display with Figurines */}
          <div className="flex items-baseline justify-between bg-[#191D26] border border-[#252D3C] rounded-xl px-3.5 py-2.5">
            <div className="flex items-baseline gap-2">
              <span className="text-zinc-400 font-mono text-xs select-none">
                {currentMove.move_number}{currentMove.color === 'w' ? '.' : '...'}
              </span>
              <div className="flex items-center gap-1">
                {glyph && (
                  <span className={`text-2xl leading-none select-none ${glyphColor}`}>
                    {glyph}
                  </span>
                )}
                <span className="text-2xl font-black font-display tracking-tight text-white">
                  {cleanSan}
                </span>
              </div>
            </div>

            {/* If there was a better move, display it with figurine */}
            {currentMove.best_move_san && currentMove.best_move_san !== currentMove.played_move_san && (
              <div className="text-right text-xs">
                <span className="text-[10px] uppercase font-bold text-zinc-400 block">Best Move</span>
                <span className="font-display font-black text-[#6CFF93] flex items-center justify-end gap-1">
                  {bestFigurine.glyph && <span>{bestFigurine.glyph}</span>}
                  <span>{bestFigurine.cleanSan}</span>
                </span>
              </div>
            )}
          </div>

          {/* Dynamic Coach Review Dialogue */}
          <div className="bg-[#181C25] border border-[#242C3B] rounded-xl p-3.5 space-y-2 relative overflow-hidden">
            {/* Subtle left accent bar */}
            <div className={`absolute left-0 top-0 bottom-0 w-1 ${
              commentary.badge.pillBorder.replace('border-', 'bg-')
            }`} />

            <div className="pl-1 space-y-1">
              <div className={`text-xs font-black font-display tracking-wide ${commentary.badge.textColor}`}>
                {commentary.headline}
              </div>
              <p className="text-xs text-zinc-200 leading-relaxed font-normal">
                {commentary.analysisText}
              </p>
            </div>

            {/* Evaluation Swing Callout if blunder/mistake */}
            {commentary.evalDifferenceText && (
              <div className="pl-1 pt-1.5 border-t border-[#262E3E] flex items-center justify-between text-[11px] text-zinc-400">
                <span>Evaluation impact:</span>
                <span className="font-mono font-bold text-rose-400 bg-rose-950/40 px-2 py-0.5 rounded border border-rose-800/40">
                  {commentary.evalDifferenceText}
                </span>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="py-6 text-center space-y-2">
          <div className="w-10 h-10 rounded-full bg-[#1F2432] border border-[#2E374A] flex items-center justify-center mx-auto text-[#6CFF93]">
            <Sparkles className="w-5 h-5" />
          </div>
          <div className="text-sm font-black font-display text-white">Start Game Review</div>
          <p className="text-xs text-zinc-400 max-w-xs mx-auto">
            Step through moves to reveal deep Stockfish evaluations and tactical coaching advice.
          </p>
        </div>
      )}

      {/* Review Navigation Toolbar (Chess.com-style controls) */}
      <div className="grid grid-cols-4 gap-1.5 pt-1">
        <button
          type="button"
          onClick={onToggleExplain}
          className={`py-2 px-1 rounded-xl text-xs font-bold font-display border transition-all flex items-center justify-center gap-1.5 ${
            showExplain
              ? 'bg-[#6CFF93]/20 border-[#6CFF93] text-[#6CFF93] shadow-[0_0_12px_rgba(108,255,147,0.2)]'
              : 'bg-[#1C202B] border-[#2A3142] text-zinc-300 hover:text-white hover:border-zinc-500'
          }`}
          title="Explain position"
        >
          <Lightbulb className="w-3.5 h-3.5" />
          <span>Explain</span>
        </button>

        <button
          type="button"
          onClick={onToggleBest}
          className={`py-2 px-1 rounded-xl text-xs font-bold font-display border transition-all flex items-center justify-center gap-1.5 ${
            showBest
              ? 'bg-cyan-950 border-cyan-400 text-cyan-300 shadow-[0_0_12px_rgba(6,182,212,0.25)]'
              : 'bg-[#1C202B] border-[#2A3142] text-zinc-300 hover:text-white hover:border-zinc-500'
          }`}
          title="Toggle best move arrow"
        >
          <Compass className="w-3.5 h-3.5" />
          <span>Best</span>
        </button>

        <button
          type="button"
          onClick={onPrevious}
          disabled={!hasPrevious}
          className="py-2 px-1 rounded-xl text-xs font-bold font-display bg-[#1C202B] border border-[#2A3142] text-zinc-300 hover:text-white disabled:opacity-30 transition-all flex items-center justify-center gap-0.5 active:scale-95"
          title="Previous move (←)"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>Prev</span>
        </button>

        <button
          type="button"
          onClick={onNext}
          disabled={!hasNext}
          className="py-2 px-1 rounded-xl text-xs font-black font-display bg-[#6CFF93] hover:bg-[#5FE683] text-black border border-[#5FE683] disabled:opacity-30 transition-all flex items-center justify-center gap-0.5 shadow-[0_0_15px_rgba(108,255,147,0.3)] active:scale-95"
          title="Next move (→ / Enter)"
        >
          <span>Next</span>
          <ChevronRight className="w-4 h-4 stroke-[3]" />
        </button>
      </div>
    </div>
  );
};
