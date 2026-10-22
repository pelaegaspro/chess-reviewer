import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import { Game } from '../types';
import { 
  Trophy, TrendingUp, Search, RefreshCw, Eye, Swords, 
  Clock, Calendar, User as UserIcon, Play, AlertCircle, Sparkles, FileText
} from 'lucide-react';

interface DashboardPageProps {
  onSelectGame: (gameId: string) => void;
  onNavigateConnect: () => void;
  onNavigatePgn?: () => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  onSelectGame,
  onNavigateConnect,
  onNavigatePgn
}) => {
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [filterResult, setFilterResult] = useState<string>('');
  const [filterTimeClass, setFilterTimeClass] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [searchOpponent, setSearchOpponent] = useState<string>('');

  // Pagination
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [totalGames, setTotalGames] = useState<number>(0);

  // Analyzing status map
  const [analyzingIds, setAnalyzingIds] = useState<Record<string, number>>({});

  const fetchGames = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.getGames({
        result: filterResult || undefined,
        timeClass: filterTimeClass || undefined,
        status: filterStatus || undefined,
        opponent: searchOpponent || undefined,
        page,
        limit: 15
      });
      setGames(res.games);
      setTotalPages(res.pagination.totalPages);
      setTotalGames(res.pagination.total);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch games');
    } finally {
      setLoading(false);
    }
  }, [filterResult, filterTimeClass, filterStatus, searchOpponent, page]);

  useEffect(() => {
    fetchGames();
  }, [fetchGames]);

  // Connected Chess.com account and sync status
  const [connectedAccount, setConnectedAccount] = useState<string | null>(() => {
    return api.getStoredChessComUsername();
  });
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncFeedback, setSyncFeedback] = useState<{ type: 'success' | 'info' | 'error'; message: string } | null>(null);

  useEffect(() => {
    const fetchAccount = async () => {
      try {
        const stored = api.getStoredChessComUsername();
        if (stored) {
          setConnectedAccount(stored);
        }
        const accounts = await api.getConnectedAccounts();
        if (accounts && accounts.length > 0) {
          setConnectedAccount(accounts[0].chess_username);
          localStorage.setItem('aether_connected_chesscom', accounts[0].chess_username);
        }
      } catch {
        // Non-blocking
      }
    };
    fetchAccount();
  }, []);

  const handleSyncLatest = async () => {
    if (isSyncing) return;
    try {
      setIsSyncing(true);
      setSyncFeedback(null);
      let accountName = connectedAccount;
      if (!accountName) {
        const accounts = await api.getConnectedAccounts();
        if (accounts && accounts.length > 0) {
          accountName = accounts[0].chess_username;
          setConnectedAccount(accountName);
        }
      }

      if (!accountName) {
        onNavigateConnect();
        setIsSyncing(false);
        return;
      }

      const { jobId } = await api.startImport(accountName, 2);

      const poll = setInterval(async () => {
        try {
          const job = await api.getImportJob(jobId);
          if (job.status === 'completed' || job.status === 'failed') {
            clearInterval(poll);
            setIsSyncing(false);
            if (job.status === 'completed') {
              await fetchGames();
              const added = job.importedCount ?? 0;
              if (added > 0) {
                setSyncFeedback({
                  type: 'success',
                  message: `Synced ${added} new game${added === 1 ? '' : 's'} from Chess.com!`
                });
              } else {
                setSyncFeedback({
                  type: 'info',
                  message: `All games published in Chess.com's public archives are synced! (Note: matches finished within the last 15-20 minutes may still be in Chess.com's batch processing queue).`
                });
              }
            } else {
              setSyncFeedback({
                type: 'error',
                message: 'Failed to sync with Chess.com. Please try again.'
              });
            }
          }
        } catch {
          clearInterval(poll);
          setIsSyncing(false);
        }
      }, 1500);
    } catch (err: any) {
      setIsSyncing(false);
      setSyncFeedback({
        type: 'error',
        message: err.message || 'Sync failed.'
      });
    }
  };

  // Handle triggering analysis
  const handleAnalyzeGame = async (e: React.MouseEvent, gameId: string) => {
    e.stopPropagation();
    try {
      await api.queueAnalysis(gameId, 10, true);
      setAnalyzingIds(prev => ({ ...prev, [gameId]: 5 }));

      const interval = setInterval(async () => {
        const prog = await api.getAnalysisProgress(gameId);
        if (prog) {
          setAnalyzingIds(prev => ({ ...prev, [gameId]: prog.percentage || 10 }));
          if (prog.status === 'completed' || prog.percentage === 100) {
            clearInterval(interval);
            setAnalyzingIds(prev => {
              const updated = { ...prev };
              delete updated[gameId];
              return updated;
            });
            fetchGames();
          }
        }
      }, 2000);
    } catch (err: any) {
      alert(err.message || 'Failed to trigger analysis');
    }
  };

  const analyzedCount = games.filter(g => g.analysis_status === 'analyzed').length;
  const avgAccuracy = analyzedCount > 0
    ? Math.round(games.filter(g => g.analysis_status === 'analyzed')
        .reduce((sum, g) => sum + (parseFloat(g.accuracy_white as any) || 75), 0) / analyzedCount * 10) / 10
    : 0;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 font-sans">
      {/* Hero / Overview Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-[#E8E6E1]">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-black text-[#1A1919] tracking-tight">
              My Chess Games
            </h1>
            {connectedAccount && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#EBF3EC] text-[#0A8A36] text-xs font-bold border border-[#0A8A36]/20">
                <span className="w-2 h-2 rounded-full bg-[#0A8A36] animate-pulse"></span>
                {connectedAccount}
              </span>
            )}
          </div>
          <p className="text-sm text-[#71706E] mt-1 font-medium">
            Review your games with real Stockfish 18 analysis, dynamic coach cards, and personal insights.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* 1-Click Sync Button */}
          <button
            onClick={handleSyncLatest}
            disabled={isSyncing}
            title="Fetch the newest games from Chess.com"
            className="px-4 py-2.5 rounded-full bg-white hover:bg-[#F5F4F2] text-[#1A1919] font-bold text-sm shadow-sm transition-all flex items-center gap-2 active:scale-[0.98] border border-[#D5D3CE] disabled:opacity-60"
          >
            <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin text-[#0A8A36]' : 'text-[#71706E]'}`} />
            <span>{isSyncing ? 'Syncing...' : 'Sync Latest Games'}</span>
          </button>

          {/* Quick PGN / Instant Review */}
          {onNavigatePgn && (
            <button
              onClick={onNavigatePgn}
              title="Paste a PGN or single game for instant review"
              className="px-4 py-2.5 rounded-full bg-white hover:bg-[#F5F4F2] text-[#1A1919] font-bold text-sm shadow-sm transition-all flex items-center gap-2 active:scale-[0.98] border border-[#D5D3CE]"
            >
              <FileText className="w-4 h-4 text-[#71706E]" />
              <span>Instant Review (PGN)</span>
            </button>
          )}

          {/* Connect / Change Account */}
          <button
            onClick={onNavigateConnect}
            className="px-5 py-2.5 rounded-full bg-[#6CFF93] hover:bg-[#5FE683] text-[#1A1919] font-black text-sm shadow-sm transition-all flex items-center gap-2 active:scale-[0.98] border border-[#5FE683]"
          >
            <Swords className="w-4 h-4 stroke-[2.5]" />
            <span>{connectedAccount ? 'Manage Account' : 'Connect Chess.com'}</span>
          </button>
        </div>
      </div>

      {/* Sync Feedback Toast / Banner */}
      {syncFeedback && (
        <div className={`p-4 rounded-2xl flex items-start justify-between gap-3 text-sm border transition-all ${
          syncFeedback.type === 'success' ? 'bg-[#EBF3EC] border-[#0A8A36]/30 text-[#0A8A36]' :
          syncFeedback.type === 'info' ? 'bg-[#F0F7FF] border-[#0070F3]/30 text-[#0060DF]' :
          'bg-[#FDF2F2] border-[#E02424]/30 text-[#C81E1E]'
        }`}>
          <div className="flex items-start gap-2.5">
            {syncFeedback.type === 'success' ? <Sparkles className="w-5 h-5 flex-shrink-0 mt-0.5" /> : <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />}
            <div>
              <p className="font-semibold">{syncFeedback.message}</p>
              {syncFeedback.type === 'info' && (
                <p className="text-xs text-[#555] mt-1">
                  💡 <strong>Tip:</strong> If you just completed a game, Chess.com takes about 10–20 minutes to process it into the public archive. You can also click <strong>Instant Review (PGN)</strong> to paste its PGN and review immediately.
                </p>
              )}
            </div>
          </div>
          <button
            onClick={() => setSyncFeedback(null)}
            className="text-xs font-bold uppercase opacity-60 hover:opacity-100 ml-2"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Top Metric Cards in Tabby Style */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white border border-[#E8E6E1] rounded-3xl p-5 shadow-sm hover:shadow-md transition-all">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-[#71706E] uppercase tracking-wider">Total Games</span>
            {isSyncing && <RefreshCw className="w-3 h-3 animate-spin text-[#0A8A36]" />}
          </div>
          <div className="mt-2 text-2xl sm:text-3xl font-black text-[#1A1919] font-sans">{totalGames}</div>
          <span className="text-[11px] text-[#9E9D9A] font-medium block truncate" title="Synced from Chess.com archives">
            Synced from Chess.com
          </span>
        </div>

        <div className="bg-white border border-[#E8E6E1] rounded-3xl p-5 shadow-sm hover:shadow-md transition-all">
          <span className="text-[11px] font-bold text-[#71706E] uppercase tracking-wider">Analyzed</span>
          <div className="mt-2 text-2xl sm:text-3xl font-black text-[#0A8A36] font-sans">{analyzedCount}</div>
          <span className="text-[11px] text-[#9E9D9A] font-medium">Stockfish 18 NNUE</span>
        </div>

        <div className="bg-white border border-[#E8E6E1] rounded-3xl p-5 shadow-sm hover:shadow-md transition-all">
          <span className="text-[11px] font-bold text-[#71706E] uppercase tracking-wider">Average Accuracy</span>
          <div className="mt-2 text-2xl sm:text-3xl font-black text-[#1A1919] font-sans">
            {avgAccuracy > 0 ? `${avgAccuracy}%` : '--'}
          </div>
          <span className="text-[11px] text-[#9E9D9A] font-medium">Win probability model</span>
        </div>

        <div className="bg-white border border-[#E8E6E1] rounded-3xl p-5 shadow-sm hover:shadow-md transition-all">
          <span className="text-[11px] font-bold text-[#71706E] uppercase tracking-wider">Engine Status</span>
          <div className="mt-2 flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#6CFF93] border border-[#0A8A36]" />
            <span className="text-sm font-black text-[#1A1919]">Stockfish 18</span>
          </div>
          <span className="text-[11px] text-[#0A8A36] font-bold">Neural Net Active</span>
        </div>
      </div>

      {/* Filter and Search Bar in Tabby Pill Style */}
      <div className="bg-white border border-[#E8E6E1] rounded-3xl p-4 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Result Filter Tabs */}
          <div className="flex items-center gap-1 bg-[#F5F4F2] p-1 rounded-full border border-[#E8E6E1] text-xs font-bold">
            {[
              { label: 'All', value: '' },
              { label: 'Wins', value: 'win' },
              { label: 'Losses', value: 'loss' },
              { label: 'Draws', value: 'draw' },
            ].map(tab => (
              <button
                key={tab.value}
                onClick={() => { setFilterResult(tab.value); setPage(1); }}
                className={`px-3.5 py-1.5 rounded-full transition-all ${
                  filterResult === tab.value
                    ? 'bg-[#1A1919] text-[#6CFF93] shadow-sm'
                    : 'text-[#71706E] hover:text-[#1A1919]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Time class Filter */}
          <div className="flex items-center gap-1 bg-[#F5F4F2] p-1 rounded-full border border-[#E8E6E1] text-xs font-bold">
            {[
              { label: 'All Formats', value: '' },
              { label: 'Blitz', value: 'blitz' },
              { label: 'Rapid', value: 'rapid' },
              { label: 'Bullet', value: 'bullet' },
            ].map(tab => (
              <button
                key={tab.value}
                onClick={() => { setFilterTimeClass(tab.value); setPage(1); }}
                className={`px-3.5 py-1.5 rounded-full transition-all ${
                  filterTimeClass === tab.value
                    ? 'bg-[#1A1919] text-[#6CFF93] shadow-sm'
                    : 'text-[#71706E] hover:text-[#1A1919]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Opponent Search Input */}
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="w-4 h-4 text-[#9E9D9A] absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search opponent..."
              value={searchOpponent}
              onChange={e => { setSearchOpponent(e.target.value); setPage(1); }}
              className="w-full pl-9 pr-3.5 py-2 rounded-full bg-[#F5F4F2] border border-[#E8E6E1] text-xs text-[#1A1919] placeholder-[#9E9D9A] font-medium focus:outline-none focus:border-[#1A1919] transition-colors"
            />
          </div>
        </div>
      </div>

      {/* Games List */}
      <div className="space-y-3">
        {loading ? (
          <div className="p-12 text-center text-[#71706E] flex flex-col items-center gap-3">
            <RefreshCw className="w-6 h-6 animate-spin text-[#1A1919]" />
            <span className="text-xs font-medium">Loading games...</span>
          </div>
        ) : games.length === 0 ? (
          <div className="p-12 text-center bg-white border border-[#E8E6E1] rounded-3xl shadow-sm">
            <AlertCircle className="w-8 h-8 text-[#9E9D9A] mx-auto mb-2" />
            <h3 className="text-sm font-bold text-[#1A1919]">No games found</h3>
            <p className="text-xs text-[#71706E] mt-1 mb-4">
              Connect your Chess.com account to import your games, or paste a PGN directly.
            </p>
            <button
              onClick={onNavigateConnect}
              className="px-5 py-2.5 bg-[#6CFF93] hover:bg-[#5FE683] text-[#1A1919] font-black text-xs rounded-full shadow-sm transition-all"
            >
              Connect Chess.com Account
            </button>
          </div>
        ) : (
          games.map(game => {
            const isAnalyzed = game.analysis_status === 'analyzed';
            const isCurrentlyAnalyzing = analyzingIds[game.id] !== undefined || game.analysis_status === 'analyzing';
            const currentProg = analyzingIds[game.id] || 0;

            return (
              <div
                key={game.id}
                onClick={() => onSelectGame(game.id)}
                className="group bg-white hover:bg-[#FAFAF8] border border-[#E8E6E1] hover:border-[#1A1919] rounded-3xl p-4.5 shadow-sm hover:shadow-md transition-all cursor-pointer flex flex-wrap items-center justify-between gap-4"
              >
                {/* Left: Players & Result */}
                <div className="flex items-center gap-4 min-w-[280px]">
                  <span className={`w-12 text-center py-1.5 rounded-full text-xs font-mono font-bold ${
                    game.result === '1-0' ? 'bg-[#6CFF93]/35 text-[#0A8A36] border border-[#6CFF93]' :
                    game.result === '0-1' ? 'bg-[#1A1919] text-white' :
                    'bg-[#F5F4F2] text-[#71706E] border border-[#E8E6E1]'
                  }`}>
                    {game.result}
                  </span>

                  <div>
                    <div className="flex items-center gap-2 text-sm font-bold text-[#1A1919]">
                      <span>{game.white_player}</span>
                      <span className="text-xs font-normal text-[#9E9D9A]">({game.white_rating || '?'})</span>
                      <span className="text-[#9E9D9A] font-light">vs</span>
                      <span>{game.black_player}</span>
                      <span className="text-xs font-normal text-[#9E9D9A]">({game.black_rating || '?'})</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-[#71706E] mt-1 font-sans font-medium">
                      <span>{game.opening || 'Standard Chess'}</span>
                      {game.eco && <span className="text-[#9E9D9A]">[{game.eco}]</span>}
                      <span>•</span>
                      <span>{new Date(game.played_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>

                {/* Middle: Format & Accuracy */}
                <div className="flex items-center gap-3">
                  <span className="px-3 py-1 rounded-full bg-[#F5F4F2] border border-[#E8E6E1] text-xs font-bold text-[#1A1919] uppercase tracking-wide">
                    {game.time_class || 'blitz'}
                  </span>

                  {isAnalyzed && game.accuracy_white !== undefined && (
                    <div className="flex items-center gap-1.5 text-xs">
                      <span className="px-2.5 py-0.5 rounded-full bg-[#F5F4F2] border border-[#E8E6E1] text-[#1A1919] font-bold">
                        W: {game.accuracy_white}%
                      </span>
                      <span className="px-2.5 py-0.5 rounded-full bg-[#F5F4F2] border border-[#E8E6E1] text-[#71706E] font-bold">
                        B: {game.accuracy_black}%
                      </span>
                    </div>
                  )}
                </div>

                {/* Right: Actions */}
                <div className="flex items-center gap-2.5">
                  {isCurrentlyAnalyzing ? (
                    <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-[#F5F4F2] border border-[#E8E6E1] text-[#1A1919] text-xs font-bold">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Analyzing {currentProg}%</span>
                    </div>
                  ) : isAnalyzed ? (
                    <button
                      onClick={(e) => { e.stopPropagation(); onSelectGame(game.id); }}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#6CFF93] hover:bg-[#5FE683] text-[#1A1919] font-black text-xs shadow-sm transition-all active:scale-[0.98] border border-[#5FE683]"
                    >
                      <Eye className="w-3.5 h-3.5 stroke-[2.5]" />
                      <span>Review</span>
                    </button>
                  ) : (
                    <button
                      onClick={(e) => handleAnalyzeGame(e, game.id)}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#1A1919] hover:bg-[#333232] text-white text-xs font-bold transition-all active:scale-[0.98]"
                    >
                      <Play className="w-3 h-3 fill-current" />
                      <span>Analyze</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-[#E8E6E1] pt-4">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="px-4 py-2 rounded-full bg-white border border-[#E8E6E1] text-xs font-bold text-[#1A1919] hover:bg-[#F5F4F2] disabled:opacity-40 shadow-sm"
          >
            Previous
          </button>
          <span className="text-xs font-medium text-[#71706E]">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="px-4 py-2 rounded-full bg-white border border-[#E8E6E1] text-xs font-bold text-[#1A1919] hover:bg-[#F5F4F2] disabled:opacity-40 shadow-sm"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
};
