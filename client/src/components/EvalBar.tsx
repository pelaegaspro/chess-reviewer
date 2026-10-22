import React from 'react';

interface EvalBarProps {
  scoreCp: number; // Positive = White winning
  scoreMate?: number;
  orientation?: 'white' | 'black';
}

export const EvalBar: React.FC<EvalBarProps> = ({
  scoreCp,
  scoreMate,
  orientation = 'white'
}) => {
  let whitePercent = 50;

  if (scoreMate !== undefined) {
    whitePercent = scoreMate > 0 ? 100 : 0;
  } else {
    const val = 1 / (1 + Math.pow(10, -scoreCp / 400));
    whitePercent = Math.min(Math.max(val * 100, 3), 97);
  }

  const bottomPercent = orientation === 'white' ? whitePercent : 100 - whitePercent;

  let label = '0.0';
  if (scoreMate !== undefined) {
    label = scoreMate > 0 ? `M${scoreMate}` : `-M${Math.abs(scoreMate)}`;
  } else {
    const pawns = (scoreCp / 100).toFixed(1);
    label = scoreCp > 0 ? `+${pawns}` : pawns;
  }

  const isWhiteAdvantage = scoreMate ? scoreMate > 0 : scoreCp >= 0;

  return (
    <div className="relative w-6 h-full min-h-[380px] rounded-lg overflow-hidden flex flex-col justify-end bg-[#121316] border border-[#2A303C] shadow-sm select-none shrink-0">
      {/* Black section (top) */}
      <div 
        className="w-full bg-[#1E222A] transition-all duration-250 ease-out"
        style={{ height: `${100 - bottomPercent}%` }}
      />

      {/* Center 0.0 marker line */}
      <div className="absolute top-1/2 left-0 right-0 h-[1px] bg-zinc-600/60 z-10 pointer-events-none" />

      {/* White section (bottom) */}
      <div 
        className="w-full bg-[#E5E7EB] transition-all duration-250 ease-out"
        style={{ height: `${bottomPercent}%` }}
      />

      {/* Numerical score label */}
      <div 
        className={`absolute w-full text-center text-[9px] font-mono font-black tracking-tight py-0.5 z-20 ${
          isWhiteAdvantage ? 'bottom-1 text-black' : 'top-1 text-white'
        }`}
      >
        {label}
      </div>
    </div>
  );
};
