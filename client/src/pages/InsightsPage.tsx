import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { PlayerStats, InsightPattern } from '../types';
import { 
  Sparkles, TrendingUp, AlertTriangle, ShieldAlert, Award, 
  RefreshCw, CheckCircle, ArrowRight, Eye, Layers
} from 'lucide-react';

interface InsightsPageProps {
  onSelectGame: (gameId: string) => void;
  onNavigateConnect: () => void;
}

export const InsightsPage: React.FC<InsightsPageProps> = ({
  onSelectGame,
  onNavigateConnect
}) => {
  const [stats, setStats] = useState<PlayerStats | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchInsights = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await api.getInsights();
        setStats(data);
      } catch (err: any) {
        setError(err.message || 'Failed to load player insights');
      } finally {
        setLoading(false);
      }
    };

    fetchInsights();
  }, []);

  if (loading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3">
        <RefreshCw className="w-8 h-8 text-[#1A1919] animate-spin" />
        <p className="text-sm font-medium text-[#71706E]">Computing cross-game patterns & tactical tendencies...</p>
      </div>
    );
  }

  if (error || !stats || stats.totalAnalyzed === 0) {
    return (
      <div className="max-w-xl mx-auto my-14 p-8 bg-white border border-[#E8E6E1] rounded-3xl text-center space-y-4 shadow-sm font-sans">
        <div className="w-14 h-14 rounded-2xl bg-[#6CFF93]/40 flex items-center justify-center mx-auto border border-[#6CFF93]">
          <Sparkles className="w-7 h-7 text-[#0A8A36]" />
        </div>
        <h2 className="text-xl font-black text-[#1A1919]">Insights Require Analyzed Games</h2>
        <p className="text-xs text-[#71706E] max-w-sm mx-auto leading-relaxed font-medium">
          Personal Chess Insights mines patterns across your actual played games. Import your games from Chess.com and analyze at least 1-2 games with Stockfish to unlock concrete coaching patterns.
        </p>
        <button
          onClick={onNavigateConnect}
          className="px-6 py-3 bg-[#6CFF93] hover:bg-[#5FE683] text-[#1A1919] font-black text-xs rounded-full shadow-sm transition-all border border-[#5FE683]"
        >
          Connect & Import Games
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 font-sans">
      {/* Title */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-[#E8E6E1]">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-[#1A1919] tracking-tight flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#6CFF93] flex items-center justify-center border border-[#5FE683]">
              <Sparkles className="w-5 h-5 text-[#1A1919]" />
            </div>
            <span>Personal Chess Insights</span>
          </h1>
          <p className="text-sm text-[#71706E] mt-1 font-medium">
            Grounded cross-game statistical pattern analysis derived directly from Stockfish evaluations.
          </p>
        </div>

        <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white border border-[#E8E6E1] text-xs font-bold text-[#1A1919] shadow-sm">
          <span>Sample:</span>
          <span className="text-[#0A8A36]">{stats.totalAnalyzed} Analyzed Games</span>
        </div>
      </div>

      {/* Phase Accuracy Breakdown */}
      <div className="bg-white border border-[#E8E6E1] rounded-3xl p-6 shadow-sm">
        <h2 className="text-xs font-black uppercase tracking-wider text-[#71706E] mb-4">
          Accuracy Decay Across Game Phases
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-[#F5F4F2] p-4.5 rounded-2xl border border-[#E8E6E1] text-center">
            <span className="text-xs font-bold text-[#71706E]">Opening (Moves 1-10)</span>
            <div className="my-2 text-2xl font-black text-[#0A8A36]">
              {stats.phaseAccuracies.opening}%
            </div>
            <span className="text-[11px] text-[#9E9D9A] font-medium">Theoretical adherence</span>
          </div>

          <div className="bg-[#F5F4F2] p-4.5 rounded-2xl border border-[#E8E6E1] text-center">
            <span className="text-xs font-bold text-[#71706E]">Middlegame (Moves 11-25)</span>
            <div className="my-2 text-2xl font-black text-[#1A1919]">
              {stats.phaseAccuracies.middlegame}%
            </div>
            <span className="text-[11px] text-[#9E9D9A] font-medium">Tactical complexity</span>
          </div>

          <div className="bg-[#F5F4F2] p-4.5 rounded-2xl border border-[#E8E6E1] text-center">
            <span className="text-xs font-bold text-[#71706E]">Endgame (Moves 26+)</span>
            <div className="my-2 text-2xl font-black text-[#1A1919]">
              {stats.phaseAccuracies.endgame}%
            </div>
            <span className="text-[11px] text-[#9E9D9A] font-medium">Time pressure phase</span>
          </div>
        </div>
      </div>

      {/* Detected Weaknesses & Strengths Cards */}
      <div className="space-y-4">
        <h2 className="text-base font-black text-[#1A1919] tracking-tight flex items-center gap-2">
          <span>Identified Tactical Patterns</span>
          <span className="text-xs font-bold text-[#71706E]">({stats.insights.length} detected)</span>
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {stats.insights.map(item => (
            <div
              key={item.id}
              className="p-6 rounded-3xl border border-[#E8E6E1] bg-white shadow-sm flex flex-col justify-between hover:shadow-md transition-all"
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-2.5">
                  <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase ${
                    item.impactLevel === 'Critical' ? 'bg-rose-100 text-rose-700 border border-rose-200' :
                    item.impactLevel === 'Warning' ? 'bg-amber-100 text-amber-700 border border-amber-200' :
                    'bg-[#6CFF93]/35 text-[#0A8A36] border border-[#6CFF93]'
                  }`}>
                    {item.impactLevel}
                  </span>

                  <span className="text-[11px] text-[#71706E] font-bold">
                    Confidence: <span className="text-[#1A1919]">{item.confidence}</span>
                  </span>
                </div>

                <h3 className="text-base font-black text-[#1A1919] mb-1.5">{item.title}</h3>
                <p className="text-xs text-[#71706E] leading-relaxed mb-3 font-medium">{item.description}</p>

                <div className="p-3 rounded-2xl bg-[#F5F4F2] border border-[#E8E6E1] text-xs font-bold text-[#1A1919]">
                  {item.statistic}
                </div>
              </div>

              {/* Representative games links */}
              {item.representativeGameIds.length > 0 && (
                <div className="mt-4 pt-3 border-t border-[#E8E6E1] flex items-center justify-between text-xs">
                  <span className="text-[#71706E] text-[11px] font-medium">Representative Games:</span>
                  <div className="flex items-center gap-1.5">
                    {item.representativeGameIds.map((id, idx) => (
                      <button
                        key={id}
                        onClick={() => onSelectGame(id)}
                        className="px-3 py-1 rounded-full bg-[#1A1919] hover:bg-[#333232] text-[#6CFF93] text-[11px] font-bold transition-colors"
                      >
                        Game #{idx + 1}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Opening Repertoire Performance */}
      {stats.openings.length > 0 && (
        <div className="bg-white border border-[#E8E6E1] rounded-3xl p-6 shadow-sm space-y-4">
          <h2 className="text-xs font-black uppercase tracking-wider text-[#71706E]">
            Opening Repertoire Efficiency
          </h2>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-[#E8E6E1] text-[#71706E] text-[11px] uppercase font-bold">
                  <th className="py-3 px-3">ECO</th>
                  <th className="py-3 px-3">Opening Name</th>
                  <th className="py-3 px-3 text-center">Games</th>
                  <th className="py-3 px-3 text-center">Win Rate</th>
                  <th className="py-3 px-3 text-center">Avg Accuracy</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8E6E1]">
                {stats.openings.map(op => (
                  <tr key={op.eco} className="hover:bg-[#FAFAF8] transition-colors">
                    <td className="py-3 px-3 font-mono font-bold text-[#1A1919]">{op.eco}</td>
                    <td className="py-3 px-3 text-[#1A1919] font-bold">{op.name}</td>
                    <td className="py-3 px-3 text-center text-[#71706E] font-medium">{op.gamesCount}</td>
                    <td className="py-3 px-3 text-center">
                      <span className={`font-bold ${op.winRate >= 50 ? 'text-[#0A8A36]' : 'text-rose-600'}`}>
                        {op.winRate}%
                      </span>
                    </td>
                    <td className="py-3 px-3 text-center font-bold text-[#1A1919]">
                      {op.avgAccuracy}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
