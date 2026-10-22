import React, { useEffect, useRef } from 'react';
import { MoveAnalysis } from '../types';
import { parsePieceFigurine } from '../utils/chessText';
import { ClassificationBadge } from './ClassificationBadge';

interface MoveListProps {
  moves: MoveAnalysis[];
  currentPly: number;
  onSelectPly: (ply: number) => void;
}

export const MoveList: React.FC<MoveListProps> = ({
  moves,
  currentPly,
  onSelectPly
}) => {
  const activeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (activeRef.current) {
      activeRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [currentPly]);

  const pairs: Array<{
    moveNumber: number;
    white?: MoveAnalysis;
    black?: MoveAnalysis;
  }> = [];

  for (const m of moves) {
    const moveIdx = m.move_number;
    let pair = pairs.find(p => p.moveNumber === moveIdx);
    if (!pair) {
      pair = { moveNumber: moveIdx };
      pairs.push(pair);
    }
    if (m.color === 'w') pair.white = m;
    else pair.black = m;
  }

  const renderMoveCell = (moveAnalysis?: MoveAnalysis) => {
    if (!moveAnalysis) {
      return <span className="text-zinc-600 px-2 py-1 text-xs select-none font-mono">—</span>;
    }
    const isSelected = currentPly === moveAnalysis.ply;
    const { glyph, glyphColor, cleanSan } = parsePieceFigurine(moveAnalysis.played_move_san);

    return (
      <button
        type="button"
        ref={isSelected ? activeRef : null}
        onClick={() => onSelectPly(moveAnalysis.ply)}
        className={`w-full text-left px-2 py-1 rounded-md flex items-center justify-between text-xs transition-all ${
          isSelected
            ? 'bg-[#363431] text-white font-bold shadow-sm ring-1 ring-zinc-500/50'
            : 'text-zinc-300 hover:bg-[#2c2a26] hover:text-white'
        }`}
      >
        <div className="flex items-center gap-1.5 truncate font-sans">
          {/* Classification Badge inline */}
          {moveAnalysis.classification && (
            <ClassificationBadge classification={moveAnalysis.classification} size="xs" />
          )}

          {/* Piece Figurine + SAN */}
          <div className="flex items-center gap-0.5">
            {glyph && (
              <span className={`text-sm leading-none select-none ${glyphColor}`}>
                {glyph}
              </span>
            )}
            <span className="font-semibold text-xs tracking-tight">{cleanSan}</span>
          </div>
        </div>
      </button>
    );
  };

  return (
    <div className="bg-[#21201d] rounded-2xl border border-[#312e2b] flex flex-col h-[280px] shadow-md overflow-hidden font-sans">
      {/* Move Rows */}
      <div className="overflow-y-auto flex-1 p-2 space-y-0.5 custom-scrollbar">
        {pairs.map(pair => (
          <div
            key={pair.moveNumber}
            className="grid grid-cols-12 gap-1.5 items-center px-2 py-0.5 rounded-lg hover:bg-[#262421]/60 transition-colors text-xs"
          >
            {/* Move number */}
            <span className="col-span-2 text-zinc-500 text-xs font-mono select-none pl-1">
              {pair.moveNumber}.
            </span>

            {/* White move */}
            <div className="col-span-5">
              {renderMoveCell(pair.white)}
            </div>

            {/* Black move */}
            <div className="col-span-5">
              {renderMoveCell(pair.black)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
