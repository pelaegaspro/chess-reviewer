import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { ImportJob } from '../types';
import { 
  DownloadCloud, CheckCircle, AlertCircle, RefreshCw, 
  ExternalLink, User, Calendar, ShieldCheck, ArrowRight, Layers, RotateCcw
} from 'lucide-react';

interface ConnectPageProps {
  onImportComplete: () => void;
}

export const ConnectPage: React.FC<ConnectPageProps> = ({ onImportComplete }) => {
  const [username, setUsername] = useState<string>(() => {
    return api.getStoredChessComUsername() || 'hikaru';
  });
  const [connectedStoredAccount, setConnectedStoredAccount] = useState<string | null>(() => {
    return api.getStoredChessComUsername();
  });
  const [validating, setValidating] = useState<boolean>(false);
  const [disconnecting, setDisconnecting] = useState<boolean>(false);
  const [profile, setProfile] = useState<any | null>(null);
  const [archivesSummary, setArchivesSummary] = useState<any | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [canRetry, setCanRetry] = useState<boolean>(false);

  // Import options
  const [archiveOption, setArchiveOption] = useState<'3' | '12' | 'all'>('3');
  const [startingImport, setStartingImport] = useState<boolean>(false);

  // Active Job
  const [activeJobId, setActiveJobId] = useState<string | null>(() => {
    return localStorage.getItem('aether_active_import_job');
  });
  const [jobState, setJobState] = useState<ImportJob | null>(null);
  const [showChangeForm, setShowChangeForm] = useState<boolean>(false);

  // Automatically load permanently stored connected account on mount
  useEffect(() => {
    const loadStoredAccount = async () => {
      try {
        const stored = api.getStoredChessComUsername();
        const accounts = await api.getConnectedAccounts();
        const targetUsername = stored || (accounts && accounts[0]?.chess_username);

        if (targetUsername) {
          setConnectedStoredAccount(targetUsername);
          setUsername(targetUsername);
          setValidating(true);
          const prof = await api.getChessComProfile(targetUsername);
          setProfile(prof);
          const arch = await api.getChessComArchives(targetUsername);
          setArchivesSummary(arch);
        }
      } catch (err) {
        // Non-blocking
      } finally {
        setValidating(false);
      }
    };

    loadStoredAccount();
  }, []);

  // Poll active job if one is running
  useEffect(() => {
    if (!activeJobId) return;

    const poll = async () => {
      try {
        const job = await api.getImportJob(activeJobId);
        setJobState(job);

        if (job.status === 'completed' || job.status === 'failed') {
          localStorage.removeItem('aether_active_import_job');
          if (job.status === 'completed') {
            onImportComplete();
          }
        }
      } catch {
        localStorage.removeItem('aether_active_import_job');
        setActiveJobId(null);
      }
    };

    poll();
    const interval = setInterval(poll, 2500);
    return () => clearInterval(interval);
  }, [activeJobId, onImportComplete]);

  // Handle validating profile & discovering archives and permanently storing account
  const handleValidate = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const clean = username.trim().toLowerCase();
    if (!clean) return;

    try {
      setValidating(true);
      setValidationError(null);
      setCanRetry(false);
      setProfile(null);
      setArchivesSummary(null);

      const prof = await api.getChessComProfile(clean);
      setProfile(prof);

      const arch = await api.getChessComArchives(clean);
      setArchivesSummary(arch);

      // Permanently store connected Chess.com account in DB and LocalStorage
      await api.connectChessAccount(clean);
      setConnectedStoredAccount(clean);
    } catch (err: any) {
      const msg = err.message || 'Failed to connect to Chess.com.';
      setValidationError(msg);
      if (msg.includes('could not be retrieved') || msg.includes('Failed to fetch')) {
        setCanRetry(true);
      }
    } finally {
      setValidating(false);
    }
  };

  const handleDisconnect = async () => {
    if (!connectedStoredAccount) return;
    try {
      setDisconnecting(true);
      await api.disconnectChessAccount(connectedStoredAccount);
      setConnectedStoredAccount(null);
      setProfile(null);
      setArchivesSummary(null);
      setUsername('');
    } catch (err: any) {
      alert(err.message || 'Failed to disconnect account');
    } finally {
      setDisconnecting(false);
    }
  };

  // Start background import
  const handleStartImport = async () => {
    if (!profile) return;
    try {
      setStartingImport(true);
      const maxArchives = archiveOption === '3' ? 3 : archiveOption === '12' ? 12 : undefined;
      const res = await api.startImport(profile.username, maxArchives);
      setActiveJobId(res.jobId);
      localStorage.setItem('aether_active_import_job', res.jobId);
    } catch (err: any) {
      alert(err.message || 'Failed to start import job');
    } finally {
      setStartingImport(false);
    }
  };

  const percent = jobState && jobState.totalArchives > 0
    ? Math.round((jobState.processedArchives / jobState.totalArchives) * 100)
    : 0;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10 space-y-6 font-sans">
      {/* Title */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-black text-[#1A1919] tracking-tight flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-[#6CFF93] flex items-center justify-center border border-[#5FE683]">
            <DownloadCloud className="w-5 h-5 text-[#1A1919] stroke-[2.5]" />
          </div>
          <span>Connect Chess.com Account</span>
        </h1>
        <p className="text-sm text-[#71706E] mt-1 font-medium">
          Import your public game archives directly into your library to run deep Stockfish reviews.
        </p>
      </div>

      {/* Security & API Privacy Guarantee in Tabby Style */}
      <div className="bg-white border border-[#E8E6E1] rounded-2xl p-4 flex items-start gap-3 shadow-sm">
        <div className="w-8 h-8 rounded-xl bg-[#6CFF93]/30 flex items-center justify-center shrink-0 border border-[#6CFF93]">
          <ShieldCheck className="w-4 h-4 text-[#0A8A36]" />
        </div>
        <div className="text-xs text-[#71706E] leading-relaxed">
          <span className="font-bold text-[#1A1919]">Public API Guarantee:</span> We never request, store, or process your Chess.com password. Only legitimate public game archives published by Chess.com are imported.
        </div>
      </div>

      {/* Active Job Progress Widget (if currently importing) */}
      {jobState && (
        <div className="bg-white border-2 border-[#1A1919] rounded-3xl p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <RefreshCw className={`w-4 h-4 text-[#1A1919] ${jobState.status === 'running' ? 'animate-spin' : ''}`} />
              <span className="text-xs font-black text-[#1A1919] uppercase tracking-wider">
                {jobState.status === 'running' ? 'Importing Historical Games...' :
                 jobState.status === 'completed' ? 'Import Completed Successfully!' :
                 'Import Paused / Encountered Errors'}
              </span>
            </div>
            <span className="text-sm font-black text-[#1A1919] bg-[#6CFF93] px-3 py-0.5 rounded-full">
              {percent}%
            </span>
          </div>

          {/* Progress bar */}
          <div className="w-full h-3 rounded-full bg-[#F5F4F2] overflow-hidden border border-[#E8E6E1]">
            <div
              className={`h-full transition-all duration-500 ease-out ${
                jobState.status === 'failed' ? 'bg-rose-500' : 'bg-[#6CFF93]'
              }`}
              style={{ width: `${percent}%` }}
            />
          </div>

          {/* Progress details */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs pt-2 border-t border-[#E8E6E1]">
            <div className="bg-[#F5F4F2] p-3 rounded-2xl border border-[#E8E6E1]">
              <span className="text-[#71706E] block font-medium">Imported</span>
              <span className="text-base font-black text-[#0A8A36]">{jobState.importedCount}</span>
            </div>
            <div className="bg-[#F5F4F2] p-3 rounded-2xl border border-[#E8E6E1]">
              <span className="text-[#71706E] block font-medium">Skipped</span>
              <span className="text-base font-black text-[#1A1919]">{jobState.skippedDuplicates}</span>
            </div>
            <div className="bg-[#F5F4F2] p-3 rounded-2xl border border-[#E8E6E1]">
              <span className="text-[#71706E] block font-medium">Archives</span>
              <span className="text-base font-black text-[#1A1919]">{jobState.processedArchives} / {jobState.totalArchives}</span>
            </div>
            <div className="bg-[#F5F4F2] p-3 rounded-2xl border border-[#E8E6E1]">
              <span className="text-[#71706E] block font-medium">Errors</span>
              <span className="text-base font-black text-rose-600">{jobState.errors}</span>
            </div>
          </div>
        </div>
      )}

      {/* If connected and profile loaded, show dedicated Connected Account Management Card */}
      {connectedStoredAccount && profile && !showChangeForm ? (
        <div className="bg-white border border-[#E8E6E1] rounded-3xl p-6 shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-[#F5F4F2] border border-[#E8E6E1]">
            <div className="flex items-center gap-4">
              {profile.avatar ? (
                <img src={profile.avatar} alt={profile.username} className="w-14 h-14 rounded-2xl object-cover border border-[#E8E6E1]" />
              ) : (
                <div className="w-14 h-14 rounded-2xl bg-white flex items-center justify-center text-[#71706E] border border-[#E8E6E1]">
                  <User className="w-7 h-7" />
                </div>
              )}
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-black text-[#1A1919]">{profile.username}</h2>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#6CFF93]/35 text-[#0A8A36] border border-[#6CFF93] flex items-center gap-1">
                    <CheckCircle className="w-3.5 h-3.5" />
                    Connected & Stored
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-[#71706E] mt-1 font-medium">
                  <span>Joined {new Date(profile.joined * 1000).toLocaleDateString()}</span>
                  <span>•</span>
                  <span>{archivesSummary?.totalArchives ?? 0} archive months available</span>
                  <span>•</span>
                  <a
                    href={profile.url || `https://www.chess.com/member/${profile.username}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[#0A8A36] hover:underline flex items-center gap-1 font-bold"
                  >
                    Chess.com Profile <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowChangeForm(true)}
                className="px-3.5 py-2 rounded-xl bg-white hover:bg-[#F5F4F2] border border-[#D5D3CE] text-xs font-bold text-[#1A1919] transition-colors"
              >
                Switch Account
              </button>
              <button
                type="button"
                onClick={handleDisconnect}
                disabled={disconnecting}
                className="px-3.5 py-2 rounded-xl bg-white hover:bg-rose-50 border border-[#D5D3CE] hover:border-rose-300 text-xs font-bold text-[#71706E] hover:text-rose-600 transition-colors flex items-center gap-1.5"
              >
                {disconnecting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                <span>Disconnect</span>
              </button>
            </div>
          </div>

          {/* Archive Selection Option */}
          {archivesSummary && (
            <div className="space-y-4 pt-2">
              <div className="space-y-2.5">
                <label className="block text-xs font-black text-[#1A1919] uppercase tracking-wider">
                  Select Archives Range
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {[
                    { value: '3', label: 'Latest 3 Months', desc: 'Fastest import (~100-300 games)' },
                    { value: '12', label: 'Latest 12 Months', desc: 'Comprehensive yearly history' },
                    { value: 'all', label: 'All Archives', desc: 'Entire public playing history' }
                  ].map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setArchiveOption(opt.value as any)}
                      className={`p-3.5 rounded-2xl border text-left transition-all ${
                        archiveOption === opt.value
                          ? 'bg-[#1A1919] border-[#1A1919] text-white shadow-sm'
                          : 'bg-[#F5F4F2] border-[#E8E6E1] text-[#1A1919] hover:bg-white'
                      }`}
                    >
                      <div className={`font-black text-xs ${archiveOption === opt.value ? 'text-[#6CFF93]' : 'text-[#1A1919]'}`}>
                        {opt.label}
                      </div>
                      <div className={`text-xs mt-1 ${archiveOption === opt.value ? 'text-[#9E9D9A]' : 'text-[#71706E]'}`}>
                        {opt.desc}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Start Import Button */}
              <button
                onClick={handleStartImport}
                disabled={startingImport || (jobState?.status === 'running')}
                className="btn-primary w-full py-3.5 text-sm font-black flex items-center justify-center gap-2"
              >
                {startingImport ? <RefreshCw className="w-4 h-4 animate-spin text-[#1A1919]" /> : <Layers className="w-4 h-4 stroke-[2.5]" />}
                <span>{startingImport ? 'Starting Import...' : 'Import Chess.com Games'}</span>
              </button>
            </div>
          )}
        </div>
      ) : (
        /* Username Lookup & Connection Form */
        <div className="bg-white border border-[#E8E6E1] rounded-3xl p-6 shadow-sm space-y-6">
          <form onSubmit={handleValidate} className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-xs font-black text-[#1A1919] uppercase tracking-wider">
                  Chess.com Username
                </label>
                {connectedStoredAccount && (
                  <button
                    type="button"
                    onClick={() => setShowChangeForm(false)}
                    className="text-xs font-bold text-[#0A8A36] hover:underline"
                  >
                    Cancel (Keep {connectedStoredAccount})
                  </button>
                )}
              </div>
              <div className="flex flex-col sm:flex-row gap-3">
                <input
                  type="text"
                  placeholder="e.g. hikaru, magnuscarlsen, or your username"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  className="flex-1 px-4 py-3 rounded-2xl bg-[#F5F4F2] border border-[#E8E6E1] text-sm text-[#1A1919] placeholder-[#9E9D9A] font-medium focus:outline-none focus:border-[#1A1919] transition-colors"
                />
                <button
                  type="submit"
                  disabled={validating || !username.trim()}
                  className="btn-secondary"
                >
                  {validating && <RefreshCw className="w-4 h-4 animate-spin text-[#6CFF93]" />}
                  <span>{validating ? 'Connecting...' : 'Connect Chess.com'}</span>
                </button>
              </div>
            </div>
          </form>

          {/* Quick preset suggestions */}
          <div className="flex items-center gap-2 text-xs text-[#71706E]">
            <span className="font-semibold">Popular:</span>
            {['hikaru', 'magnuscarlsen', 'daniil_dubov'].map(u => (
              <button
                key={u}
                type="button"
                onClick={() => { setUsername(u); }}
                aria-label={`Select ${u} as username`}
                className="btn-pill"
              >
                {u}
              </button>
            ))}
          </div>

          {/* Error Display */}
          {validationError && (
            <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 space-y-3">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                <div className="text-xs space-y-1">
                  <div className="font-bold text-rose-800">{validationError}</div>
                  {validationError.includes('profile not found') && (
                    <div className="text-rose-700">
                      Please double-check the spelling of the username on Chess.com and try again.
                    </div>
                  )}
                  {validationError.includes('could not be retrieved') && (
                    <div className="text-rose-700">
                      The Chess.com public servers could not be reached or timed out.
                    </div>
                  )}
                </div>
              </div>

              {canRetry && (
                <div className="pl-8">
                  <button
                    type="button"
                    onClick={() => handleValidate()}
                    disabled={validating}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-colors min-h-[36px]"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Retry Connection</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Profile Preview if validated but not stored yet */}
          {profile && archivesSummary && (
            <div className="pt-6 border-t border-[#E8E6E1] space-y-6">
              <div className="flex items-center justify-between p-4.5 rounded-2xl bg-[#F5F4F2] border border-[#E8E6E1]">
                <div className="flex items-center gap-4">
                  {profile.avatar ? (
                    <img src={profile.avatar} alt={profile.username} className="w-12 h-12 rounded-2xl object-cover border border-[#E8E6E1]" />
                  ) : (
                    <div className="w-12 h-12 rounded-2xl bg-white flex items-center justify-center text-[#71706E] border border-[#E8E6E1]">
                      <User className="w-6 h-6" />
                    </div>
                  )}
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-black text-[#1A1919]">{profile.username}</h2>
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#6CFF93]/35 text-[#0A8A36] border border-[#6CFF93]">
                        Profile Verified
                      </span>
                    </div>
                    <p className="text-xs text-[#71706E] mt-0.5 font-medium">
                      Member since {new Date(profile.joined * 1000).toLocaleDateString()} • Status: {profile.status}
                    </p>
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-xs text-[#71706E] block font-medium">Archives found</span>
                  <span className="text-sm font-bold text-[#1A1919]">{archivesSummary.totalArchives} months</span>
                </div>
              </div>

              {/* Archive Selection Option */}
              <div className="space-y-2.5">
                <label className="block text-xs font-black text-[#1A1919] uppercase tracking-wider">
                  Select Archives Range
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {[
                    { value: '3', label: 'Latest 3 Months', desc: 'Fastest import (~100-300 games)' },
                    { value: '12', label: 'Latest 12 Months', desc: 'Comprehensive yearly history' },
                    { value: 'all', label: 'All Archives', desc: 'Entire public playing history' }
                  ].map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setArchiveOption(opt.value as any)}
                      className={`p-3.5 rounded-2xl border text-left transition-all ${
                        archiveOption === opt.value
                          ? 'bg-[#1A1919] border-[#1A1919] text-white shadow-sm'
                          : 'bg-[#F5F4F2] border-[#E8E6E1] text-[#1A1919] hover:bg-white'
                      }`}
                    >
                      <div className={`font-black text-xs ${archiveOption === opt.value ? 'text-[#6CFF93]' : 'text-[#1A1919]'}`}>
                        {opt.label}
                      </div>
                      <div className={`text-xs mt-1 ${archiveOption === opt.value ? 'text-[#9E9D9A]' : 'text-[#71706E]'}`}>
                        {opt.desc}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Start Import Button */}
              <button
                onClick={handleStartImport}
                disabled={startingImport || (jobState?.status === 'running')}
                className="btn-primary w-full py-3.5 text-sm font-black flex items-center justify-center gap-2"
              >
                {startingImport ? <RefreshCw className="w-4 h-4 animate-spin text-[#1A1919]" /> : <Layers className="w-4 h-4 stroke-[2.5]" />}
                <span>{startingImport ? 'Starting Import...' : 'Import Chess.com Games'}</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
