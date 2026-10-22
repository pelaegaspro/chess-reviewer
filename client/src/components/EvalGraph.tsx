import React from 'react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, ReferenceLine } from 'recharts';
import { MoveAnalysis } from '../types';

interface EvalGraphProps {
  moves: MoveAnalysis[];
  currentPly: number;
  onSelectPly: (ply: number) => void;
  height?: number;
}

const renderCustomDot = (props: any) => {
  const { cx, cy, payload } = props;
  const empty = <circle key={payload?.ply ?? Math.random()} cx={0} cy={0} r={0} fill="none" />;
  if (!cx || !cy || !payload) return empty;

  const cls = payload.classification;

  // Render colored dots for mistakes / blunders / inaccuracies (matches Chess.com eval timeline)
  let fill: string | null = null;
  let r = 3;

  if (cls === 'blunder') {
    fill = '#ca3431'; // Red
    r = 3.5;
  } else if (cls === 'mistake') {
    fill = '#e6912c'; // Orange
    r = 3;
  } else if (cls === 'inaccuracy') {
    fill = '#f0c15c'; // Yellow
    r = 2.5;
  } else if (cls === 'brilliant') {
    fill = '#1baca6'; // Teal
    r = 3.5;
  } else if (cls === 'great') {
    fill = '#5c8bb0'; // Blue
    r = 3;
  }

  if (!fill) return empty;

  return (
    <circle
      key={`dot-${payload.ply}`}
      cx={cx}
      cy={cy}
      r={r}
      fill={fill}
      stroke="#21201d"
      strokeWidth={1}
      className="cursor-pointer transition-transform hover:scale-150"
    />
  );
};

export const EvalGraph: React.FC<EvalGraphProps> = ({
  moves,
  currentPly,
  onSelectPly,
  height = 80
}) => {
  if (moves.length === 0) {
    return (
      <div className="h-20 flex items-center justify-center text-xs text-zinc-500 bg-[#21201d] rounded-xl">
        No evaluation data available
      </div>
    );
  }

  // Map moves to evaluation points (eval scale clamped between -8 and +8 pawns)
  const data = [
    { ply: 0, move: 'Start', score: 0.15, rawEval: 15, classification: 'book' },
    ...moves.map(m => {
      const pawns = Math.max(-8, Math.min(8, m.evaluation_after / 100));
      return {
        ply: m.ply,
        move: `${m.move_number}${m.color === 'w' ? '.' : '...'}${m.played_move_san}`,
        score: Math.round(pawns * 100) / 100,
        rawEval: m.evaluation_after,
        classification: m.classification
      };
    })
  ];

  return (
    <div className="w-full relative" style={{ height: `${height}px` }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          onClick={(e) => {
            if (e && e.activePayload && e.activePayload.length > 0) {
              const clickedPly = e.activePayload[0].payload.ply;
              onSelectPly(clickedPly);
            }
          }}
          margin={{ top: 4, right: 2, left: 2, bottom: 2 }}
        >
          <defs>
            <linearGradient id="evalGradChesscom" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ffffff" stopOpacity={0.9} />
              <stop offset="50%" stopColor="#ffffff" stopOpacity={0.7} />
              <stop offset="51%" stopColor="#2b2926" stopOpacity={0.7} />
              <stop offset="100%" stopColor="#21201d" stopOpacity={0.9} />
            </linearGradient>
          </defs>
          <XAxis dataKey="ply" hide={true} />
          <YAxis domain={[-6, 6]} hide={true} />
          {/* Middle evaluation baseline */}
          <ReferenceLine y={0} stroke="#484541" strokeWidth={1} />
          {/* Vertical Orange Cursor Line at current ply */}
          <ReferenceLine x={currentPly} stroke="#e6912c" strokeWidth={2} />
          <Tooltip
            content={({ active, payload }) => {
              if (active && payload && payload.length) {
                const item = payload[0].payload;
                const pScore = item.score > 0 ? `+${item.score.toFixed(2)}` : item.score.toFixed(2);
                return (
                  <div className="bg-[#262421] border border-[#3d3a36] text-white px-2 py-1 rounded shadow-lg text-[11px] font-sans">
                    <div className="font-bold">{item.move}</div>
                    <div className="text-zinc-300 font-mono">Eval: {pScore}</div>
                  </div>
                );
              }
              return null;
            }}
          />
          <Area
            type="monotone"
            dataKey="score"
            stroke="#ffffff"
            strokeWidth={1.5}
            fill="url(#evalGradChesscom)"
            dot={renderCustomDot}
            activeDot={{ r: 4, fill: '#e6912c', stroke: '#ffffff', strokeWidth: 1.5 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};
