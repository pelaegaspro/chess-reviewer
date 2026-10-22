import React from 'react';
import { Game, GameAnalysis, MoveAnalysis } from '../types';
import { CatCoachBubble } from './CatCoachBubble';
import { ClassificationBadge } from './ClassificationBadge';
import { EvalGraph } from './EvalGraph';
import { Star, Play } from 'lucide-react';

interface ReviewSummaryProps {
  game: Game;
  analysis: GameAnalysis;
  moves: MoveAnalysis[];
  whitePlayer: string;
  blackPlayer: string;
  userColor?: 'white' | 'black';
  onSelectPly: (ply: number) => void;
  onStartReview: () => void;
}

export const ReviewSummary: React.FC<ReviewSummaryProps> = ({
  game,
  analysis,
  moves,
  whitePlayer,
  blackPlayer,
  userColor = 'white',
  onSelectPly,
  onStartReview
}) => {
  const counts = {
    white: { brilliant: 0, great: 0, best: 0, excellent: 0, good: 0, book: 0, inaccuracy: 0, mistake: 0, missed_win: 0, blunder: 0 },
    black: { brilliant: 0, great: 0, best: 0, excellent: 0, good: 0, book: 0, inaccuracy: 0, mistake: 0, missed_win: 0, blunder: 0 }
  };

  moves.forEach(m => {
    const target = m.color === 'w' ? counts.white : counts.black;
    if (m.classification in target) {
      target[m.classification as keyof typeof target]++;
    }
  });

  const classifications = [
    { key: 'brilliant', label: 'Brilliant' },
    { key: 'great', label: 'Great' },
    { key: 'book', label: 'Book' },
    { key: 'best', label: 'Best' },
    { key: 'excellent', label: 'Excellent' },
    { key: 'good', label: 'Good' },
    { key: 'inaccuracy', label: 'Inaccuracy' },
    { key: 'mistake', label: 'Mistake' },
    { key: 'missed_win', label: 'Missed win' },
    { key: 'blunder', label: 'Blunder' }
  ];

  return (
    <div className="flex flex-col gap-3 font-sans text-white">
      {/* Top: Cat Coach Speech Bubble */}
      <CatCoachBubble
        isSummary={true}
        summaryQuote="Okay, let's see what we can learn from your game then."
        showExplain={false}
        onToggleExplain={() => {}}
        onNext={() => {}}
        hasNext={false}
      />

      {/* Mini Evaluation Timeline Graph */}
      <div className="bg-[#21201d] rounded-2xl border border-[#312e2b] p-3 shadow-md">
        <EvalGraph
          moves={moves}
          currentPly={0}
          onSelectPly={onSelectPly}
        />
      </div>

      {/* Players & Accuracy Card */}
      <div className="bg-[#21201d] rounded-2xl border border-[#312e2b] p-4 shadow-md space-y-3.5">
        {/* Players Row */}
        <div className="space-y-1.5">
          <span className="text-[11px] font-bold text-zinc-400">Players</span>
          <div className="grid grid-cols-2 gap-3">
            {/* White Player */}
            <div className={`flex flex-col items-center justify-center p-2 rounded-xl bg-[#262421] ${
              userColor === 'white' ? 'border-2 border-[#81b64c] shadow-sm' : 'border border-[#363431]'
            }`}>
              <div className="flex items-center gap-1 mb-1.5">
                <span className="text-xs font-bold text-zinc-200 truncate max-w-[100px]">
                  {whitePlayer}
                </span>
                {userColor === 'white' && (
                  <span className="text-[9px] font-black uppercase text-[#81b64c] bg-[#81b64c]/15 px-1 py-0.2 rounded border border-[#81b64c]/30">You</span>
                )}
              </div>
              <div className="w-10 h-10 rounded-lg bg-[#312e2b] flex items-center justify-center text-xl shadow-inner">
                ♙
              </div>
            </div>

            {/* Black Player */}
            <div className={`flex flex-col items-center justify-center p-2 rounded-xl bg-[#262421] ${
              userColor === 'black' ? 'border-2 border-[#81b64c] shadow-sm' : 'border border-[#363431]'
            }`}>
              <div className="flex items-center gap-1 mb-1.5">
                <span className="text-xs font-bold text-zinc-200 truncate max-w-[100px]">
                  {blackPlayer}
                </span>
                {userColor === 'black' && (
                  <span className="text-[9px] font-black uppercase text-[#81b64c] bg-[#81b64c]/15 px-1 py-0.2 rounded border border-[#81b64c]/30">You</span>
                )}
              </div>
              <div className="w-10 h-10 rounded-lg bg-[#312e2b] flex items-center justify-center text-xl shadow-inner">
                ♟
              </div>
            </div>
          </div>
        </div>

        {/* Accuracy Scores Row */}
        <div className="space-y-1.5">
          <span className="text-[11px] font-bold text-zinc-400">Accuracy</span>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-[#262421] border border-[#363431] rounded-xl py-2 flex items-center justify-center">
              <span className={`font-mono text-xl font-black ${userColor === 'white' ? 'text-[#81b64c]' : 'text-white'}`}>
                {analysis.accuracy_white}
              </span>
            </div>
            <div className="bg-[#262421] border border-[#363431] rounded-xl py-2 flex items-center justify-center">
              <span className={`font-mono text-xl font-black ${userColor === 'black' ? 'text-[#81b64c]' : 'text-white'}`}>
                {analysis.accuracy_black}
              </span>
            </div>
          </div>
        </div>

        {/* Skills Star Row */}
        <div className="flex items-center justify-between pt-1 border-t border-[#312e2b]/80 text-xs">
          <span className="text-zinc-400 font-bold">Skills</span>
          <div className="flex items-center gap-1 bg-[#2b2721] px-2.5 py-1 rounded-full border border-amber-600/40 text-amber-300 font-bold text-xs">
            <span>+1</span>
            <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
          </div>
        </div>

        {/* Move Classification Breakdown Table */}
        <div className="pt-2 border-t border-[#312e2b]/80 space-y-1">
          {classifications.map(({ key, label }) => {
            const wCount = counts.white[key as keyof typeof counts.white];
            const bCount = counts.black[key as keyof typeof counts.black];
            return (
              <div
                key={key}
                className="grid grid-cols-12 items-center py-1.5 px-2 rounded-lg hover:bg-[#272522] transition-colors text-xs font-sans"
              >
                {/* White Count */}
                <span className="col-span-3 font-mono font-bold text-zinc-300 text-center">
                  {wCount}
                </span>

                {/* Center Badge & Name */}
                <div className="col-span-6 flex items-center justify-center gap-1.5">
                  <ClassificationBadge classification={key} size="xs" />
                  <span className="text-xs font-semibold text-zinc-300">{label}</span>
                </div>

                {/* Black Count */}
                <span className="col-span-3 font-mono font-bold text-zinc-300 text-center">
                  {bCount}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Big Green Start Review Button (Chess.com Style) */}
      <button
        type="button"
        onClick={onStartReview}
        className="w-full py-3.5 px-4 rounded-xl bg-[#81b64c] hover:bg-[#95c85b] text-white font-black text-base transition-all shadow-lg hover:shadow-[0_4px_20px_rgba(129,182,76,0.4)] active:scale-98 flex items-center justify-center gap-2 tracking-wide font-sans cursor-pointer"
      >
        <Play className="w-5 h-5 fill-white" />
        <span>Start Review</span>
      </button>
    </div>
  );
};
