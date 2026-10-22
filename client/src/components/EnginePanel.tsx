import React, { useState } from 'react';
import { Cpu, ChevronDown, ChevronUp, Zap, Sparkles } from 'lucide-react';
import { MoveAnalysis, GameAnalysis } from '../types';
import { parsePieceFigurine } from '../utils/chessText';

interface EnginePanelProps {
  currentMove?: MoveAnalysis;
  analysis?: GameAnalysis | null;
}

export const EnginePanel: React.FC<EnginePanelProps> = ({
  currentMove,
  analysis
}) => {
  const [showFullLine, setShowFullLine] = useState<boolean>(false);

  // Derive real engine metrics
  const engineName = analysis?.engine_name || 'Stockfish 18 NNUE';
  const engineDepth = analysis?.analysis_depth || 18;
  const engineVersion = analysis?.engine_version ? `v${analysis.engine_version}` : '';

  // Real evaluation
  let evalDisplay = '0.00';
  if (currentMove) {
    const cp = currentMove.evaluation_after;
    const pawns = (cp / 100).toFixed(2);
    evalDisplay = cp > 0 ? `+${pawns}` : pawns;
  }

  const bestFigurine = parsePieceFigurine(currentMove?.best_move_san || '');

  // Real principal variation line with piece figurines
  const pvRaw = currentMove?.principal_variation || '';
  const pvTokens = pvRaw ? pvRaw.split(/\s+/).filter(Boolean) : [];
  const previewTokens = pvTokens.slice(0, 8);
  const displayTokens = showFullLine ? pvTokens : previewTokens;

  return (
    <div className="bg-[#14171F]/95 backdrop-blur-md border border-[#262D3D] rounded-2xl p-4 shadow-xl font-sans space-y-3">
      {/* Engine Header */}
      <div className="flex items-center justify-between border-b border-[#232A38] pb-2.5">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-[#1E2330] border border-[#2E374A] flex items-center justify-center text-[#6CFF93] shadow-sm">
            <Cpu className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-black text-white tracking-wide uppercase font-display">{engineName}</span>
              {engineVersion && (
                <span className="text-[10px] text-zinc-400 font-mono">{engineVersion}</span>
              )}
            </div>
            <span className="text-[10px] text-zinc-400 font-medium">Neural Network Multi-depth Engine</span>
          </div>
        </div>

        <div className="flex items-center gap-2 font-mono text-xs">
          <span className="px-2 py-0.5 rounded-full bg-[#1B1F2A] border border-[#262E3E] text-zinc-300 text-[11px]">
            Depth <span className="text-[#6CFF93] font-bold">{engineDepth}</span>
          </span>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 gap-2 text-xs font-display">
        <div className="bg-[#191D26] p-2.5 rounded-xl border border-[#252D3C]">
          <span className="text-[10px] uppercase font-bold text-zinc-400 block mb-0.5">Evaluation</span>
          <span className={`text-base font-mono font-black ${
            (currentMove?.evaluation_after ?? 0) > 0 ? 'text-[#6CFF93]' :
            (currentMove?.evaluation_after ?? 0) < 0 ? 'text-rose-400' :
            'text-zinc-200'
          }`}>
            {evalDisplay}
          </span>
        </div>

        <div className="bg-[#191D26] p-2.5 rounded-xl border border-[#252D3C]">
          <span className="text-[10px] uppercase font-bold text-zinc-400 block mb-0.5">Engine Choice</span>
          <div className="text-sm font-black text-white flex items-center gap-1 font-display">
            {bestFigurine.glyph && (
              <span className={`text-base ${bestFigurine.glyphColor}`}>{bestFigurine.glyph}</span>
            )}
            <span>{bestFigurine.cleanSan || '—'}</span>
          </div>
        </div>
      </div>

      {/* Engine Principal Variation Line */}
      {pvTokens.length > 0 && (
        <div className="bg-[#191D26] p-3 rounded-xl border border-[#252D3C] space-y-2">
          <div className="flex items-center justify-between text-[10px] uppercase font-bold text-zinc-400 font-display">
            <span>Engine Continuation</span>
            {pvTokens.length > 8 && (
              <button
                onClick={() => setShowFullLine(prev => !prev)}
                className="text-[#6CFF93] hover:underline flex items-center gap-0.5 lowercase font-sans font-bold"
              >
                {showFullLine ? (
                  <>less <ChevronUp className="w-3 h-3" /></>
                ) : (
                  <>full line ({pvTokens.length}) <ChevronDown className="w-3 h-3" /></>
                )}
              </button>
            )}
          </div>

          <div className="flex flex-wrap gap-1 font-mono text-xs">
            {displayTokens.map((tok, idx) => {
              const fig = parsePieceFigurine(tok);
              return (
                <span
                  key={idx}
                  className={`px-1.5 py-0.5 rounded text-[11px] flex items-center gap-0.5 ${
                    idx === 0
                      ? 'bg-[#6CFF93]/20 text-[#6CFF93] border border-[#6CFF93]/50 font-bold'
                      : 'bg-[#202532] text-zinc-300'
                  }`}
                >
                  {fig.glyph && <span className="opacity-90">{fig.glyph}</span>}
                  <span>{fig.cleanSan}</span>
                </span>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
