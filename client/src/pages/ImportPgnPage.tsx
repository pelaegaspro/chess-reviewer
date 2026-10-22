import React, { useState, useEffect, useRef } from 'react';
import { api } from '../services/api';
import { 
  FileText, Play, Sparkles, RefreshCw, AlertCircle, 
  Globe, Upload, CheckCircle2, RotateCw, Check
} from 'lucide-react';

interface ImportPgnPageProps {
  onImportSuccess: (gameId: string) => void;
}

type InputTab = 'url' | 'paste' | 'upload';

type ProgressStep = 'idle' | 'retrieving' | 'found' | 'preparing' | 'analyzing' | 'ready';

const SAMPLE_GAMES = [
  {
    title: 'The Opera Game (Paul Morphy vs Duke of Brunswick)',
    eco: 'C41',
    pgn: `[Event "Paris"]
[Site "Paris FRA"]
[Date "1858.11.02"]
[Round "?"]
[White "Paul Morphy"]
[Black "Duke Karl / Count Isouard"]
[Result "1-0"]
[ECO "C41"]

1. e4 e5 2. Nf3 d6 3. d4 Bg4 4. dxe5 Bxf3 5. Qxf3 dxe5 6. Bc4 Nf6 7. Qb3 Qe7 8. Nc3 c6 9. Bg5 b5 10. Nxb5 cxb5 11. Bxb5+ Nbd7 12. O-O-O Rd8 13. Rxd7 Rxd7 14. Rd1 Qe6 15. Bxd7+ Nxd7 16. Qb8+ Nxb8 17. Rd8# 1-0`
  },
  {
    title: 'Tactical Wild Game with Blunders & Counterplay',
    eco: 'B01',
    pgn: `[Event "Casual Blitz"]
[Site "Online"]
[Date "2024.01.10"]
[White "PlayerOne"]
[Black "PlayerTwo"]
[Result "1-0"]
[ECO "B01"]

1. e4 d5 2. exd5 Qxd5 3. Nc3 Qa5 4. d4 Nf6 5. Nf3 Bg4 6. h3 Bh5 7. g4 Bg6 8. Ne5 Nbd7 9. Nc4 Qa6 10. Bf4 Qe6+ 11. Be2 Nd5 12. Nxd5 Qxd5 13. O-O O-O-O 14. Ne3 Qe4 15. Bg3 h5 16. Bf3 Qe6 17. d5 Qb6 18. gxh5 Bh7 19. c4 e5 20. dxe6 fxe6 21. Qe2 Bc5 22. Ng4 Bf5 23. a3 a5 24. b4 axb4 25. axb4 Qxb4 26. Ra8+ Nb8 27. Qe5 Bd6 28. Qxg7 Bxg3 29. fxg3 Rhg8 30. Qe5 Rd3 31. h6 Qd6 32. Qxd6 cxd6 33. Nf6 Rxg3+ 34. Bg2 Rxg2+ 35. Kxg2 Rd2+ 36. Rf2 Rd4 37. h7 Bxh7 38. Nxh7 Kc7 39. Rf7+ Kc6 40. Rxb8 Rxc4 41. Rc8+ Kd5 42. Rxc4 Kxc4 43. Rxb7 1-0`
  }
];

export const ImportPgnPage: React.FC<ImportPgnPageProps> = ({ onImportSuccess }) => {
  const [activeTab, setActiveTab] = useState<InputTab>('url');

  // URL state
  const [chessComUrl, setChessComUrl] = useState<string>('');
  const [urlStep, setUrlStep] = useState<ProgressStep>('idle');
  const [urlProgressPct, setUrlProgressPct] = useState<number>(0);
  const [duplicateData, setDuplicateData] = useState<{ gameId: string; message: string } | null>(null);

  // Paste PGN state
  const [pgn, setPgn] = useState<string>(SAMPLE_GAMES[0].pgn);
  const [title, setTitle] = useState<string>('Paul Morphy Opera Game');

  // Upload PGN state
  const [dragActive, setDragActive] = useState<boolean>(false);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // General loading & error
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const pollTimerRef = useRef<any>(null);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, []);

  // Poll analysis progress until ready
  const startProgressPolling = (gameId: string) => {
    if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    setUrlStep('analyzing');

    pollTimerRef.current = setInterval(async () => {
      try {
        const progress = await api.getAnalysisProgress(gameId);
        if (progress) {
          const pct = Math.min(100, Math.max(0, Math.round(progress.percentage || 0)));
          setUrlProgressPct(pct);

          if (progress.status === 'analyzed' || progress.status === 'completed' || pct >= 100) {
            clearInterval(pollTimerRef.current);
            setUrlStep('ready');
            setTimeout(() => {
              onImportSuccess(gameId);
            }, 600);
          } else if (progress.status === 'failed') {
            clearInterval(pollTimerRef.current);
            setUrlStep('idle');
            setLoading(false);
            setError('Stockfish analysis encountered an issue. You can retry or open the game.');
          }
        }
      } catch (err) {
        console.warn('Progress poll error:', err);
      }
    }, 800);
  };

  // 1. Submit Chess.com URL
  const handleUrlSubmit = async (e?: React.FormEvent, forceReanalyze: boolean = false) => {
    if (e) e.preventDefault();
    const cleanUrl = chessComUrl.trim();
    if (!cleanUrl) return;

    try {
      setLoading(true);
      setError(null);
      setDuplicateData(null);
      setUrlStep('retrieving');
      setUrlProgressPct(0);

      // Brief delay so user perceives the retrieval stage
      await new Promise(r => setTimeout(r, 400));
      setUrlStep('found');

      const res = await api.reviewFromChessComUrl(cleanUrl, forceReanalyze);

      // Check if duplicate already analyzed
      if (res.isExisting && res.isAnalyzed && !forceReanalyze) {
        setUrlStep('idle');
        setLoading(false);
        setDuplicateData({
          gameId: res.gameId,
          message: res.message || 'This game has already been analyzed.'
        });
        return;
      }

      setUrlStep('preparing');
      await new Promise(r => setTimeout(r, 300));

      // Start engine progress tracking
      startProgressPolling(res.gameId);
    } catch (err: any) {
      setUrlStep('idle');
      setLoading(false);
      setError(err.message || 'Failed to review game from Chess.com URL');
    }
  };

  // 2. Submit Pasted PGN
  const handlePgnSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pgn.trim()) return;

    try {
      setLoading(true);
      setError(null);
      const res = await api.importPgn(pgn, title);
      await api.queueAnalysis(res.id, 10, true);
      onImportSuccess(res.id);
    } catch (err: any) {
      setError(err.message || 'Failed to import PGN');
    } finally {
      setLoading(false);
    }
  };

  // 3. Handle File Upload
  const handleFileUpload = (file: File) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.pgn') && !file.type.includes('chess')) {
      setError('Please select a valid .pgn file.');
      return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
      const text = e.target?.result as string;
      if (!text || !text.trim()) {
        setError('Uploaded PGN file is empty.');
        return;
      }

      setUploadedFileName(file.name);
      setPgn(text);
      setTitle(file.name.replace(/\.pgn$/i, ''));

      try {
        setLoading(true);
        setError(null);
        const res = await api.importPgn(text, file.name.replace(/\.pgn$/i, ''));
        await api.queueAnalysis(res.id, 10, true);
        onImportSuccess(res.id);
      } catch (err: any) {
        setError(err.message || 'Failed to import uploaded PGN file.');
        setLoading(false);
      }
    };
    reader.onerror = () => {
      setError('Failed to read the uploaded file.');
    };
    reader.readAsText(file);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  const handleSelectSample = (sample: typeof SAMPLE_GAMES[0]) => {
    setPgn(sample.pgn);
    setTitle(sample.title);
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10 space-y-6 font-sans">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-black text-[#1A1919] tracking-tight flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-[#6CFF93] flex items-center justify-center border border-[#5FE683] shadow-sm">
            <Sparkles className="w-5 h-5 text-[#1A1919] stroke-[2.5]" />
          </div>
          <span>Game Review Analysis</span>
        </h1>
        <p className="text-sm text-[#71706E] mt-1 font-medium">
          Analyze any public Chess.com match or custom game with Stockfish 18 deep evaluations.
        </p>
      </div>

      {/* Input Selection Tabs */}
      <div className="flex items-center gap-1.5 p-1.5 bg-[#E8E6E1]/60 rounded-2xl max-w-md border border-[#E8E6E1]">
        <button
          type="button"
          onClick={() => {
            setActiveTab('url');
            setError(null);
            setDuplicateData(null);
          }}
          className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
            activeTab === 'url'
              ? 'bg-white text-[#1A1919] shadow-sm'
              : 'text-[#71706E] hover:text-[#1A1919] hover:bg-white/50'
          }`}
        >
          <Globe className="w-3.5 h-3.5 text-[#0A8A36]" />
          <span>Chess.com URL</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab('paste');
            setError(null);
            setDuplicateData(null);
          }}
          className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
            activeTab === 'paste'
              ? 'bg-white text-[#1A1919] shadow-sm'
              : 'text-[#71706E] hover:text-[#1A1919] hover:bg-white/50'
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>Paste PGN</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab('upload');
            setError(null);
            setDuplicateData(null);
          }}
          className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
            activeTab === 'upload'
              ? 'bg-white text-[#1A1919] shadow-sm'
              : 'text-[#71706E] hover:text-[#1A1919] hover:bg-white/50'
          }`}
        >
          <Upload className="w-3.5 h-3.5" />
          <span>Upload PGN</span>
        </button>
      </div>

      {/* TAB 1: CHESS.COM URL */}
      {activeTab === 'url' && (
        <div className="bg-white border border-[#E8E6E1] rounded-3xl p-6 sm:p-8 shadow-sm space-y-6">
          <div className="space-y-1">
            <span className="text-[11px] font-black uppercase tracking-wider text-[#0A8A36] bg-[#EBF3EC] px-2.5 py-1 rounded-md inline-block">
              REVIEW A CHESS.COM GAME
            </span>
            <h2 className="text-lg font-black text-[#1A1919] tracking-tight">
              Paste Chess.com game URL
            </h2>
            <p className="text-xs text-[#71706E] font-medium leading-relaxed">
              Accepts public live or daily game links (e.g. <span className="font-mono text-[#1A1919]">https://www.chess.com/game/live/123456789</span>).
            </p>
          </div>

          <form onSubmit={e => handleUrlSubmit(e)} className="space-y-4">
            <div>
              <input
                type="url"
                value={chessComUrl}
                onChange={e => {
                  setChessComUrl(e.target.value);
                  setError(null);
                  setDuplicateData(null);
                }}
                disabled={loading}
                placeholder="https://www.chess.com/game/live/123456789"
                className="w-full px-4 py-3.5 rounded-2xl bg-[#F5F4F2] border border-[#E8E6E1] font-mono text-xs sm:text-sm text-[#1A1919] placeholder-[#9E9D9A] font-medium focus:outline-none focus:border-[#1A1919] transition-all"
              />
            </div>

            {/* Quick paste helper chips */}
            <div className="flex flex-wrap items-center gap-2 pt-0.5">
              <span className="text-[11px] font-bold text-[#9E9D9A]">Try sample:</span>
              <button
                type="button"
                onClick={() => setChessComUrl('https://www.chess.com/game/live/97872578329')}
                className="text-[11px] font-mono font-medium px-2 py-1 rounded-lg bg-[#F5F4F2] hover:bg-[#E8E6E1] text-[#1A1919] transition-colors border border-[#E8E6E1]"
              >
                live/97872578329
              </button>
            </div>

            {/* Duplicate Game Warning Alert */}
            {duplicateData && (
              <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 space-y-3">
                <div className="flex items-start gap-2.5">
                  <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-xs font-black uppercase tracking-wider text-amber-800">
                      This game has already been analyzed.
                    </h4>
                    <p className="text-xs text-amber-700 mt-0.5 font-medium">
                      A complete Stockfish 18 evaluation is already ready in your review records.
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => onImportSuccess(duplicateData.gameId)}
                    className="px-4 py-2 rounded-xl bg-[#6CFF93] hover:bg-[#5FE683] text-[#1A1919] font-black text-xs shadow-sm transition-all flex items-center gap-1.5 border border-[#5FE683] active:scale-[0.98]"
                  >
                    <Play className="w-3.5 h-3.5 fill-[#1A1919]" />
                    <span>Open Review</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleUrlSubmit(undefined, true)}
                    className="px-4 py-2 rounded-xl bg-white hover:bg-amber-100 text-amber-900 font-bold text-xs transition-all flex items-center gap-1.5 border border-amber-300 active:scale-[0.98]"
                  >
                    <RotateCw className="w-3.5 h-3.5 text-amber-700" />
                    <span>Re-analyze</span>
                  </button>
                </div>
              </div>
            )}

            {/* Multi-stage Progress Indicator */}
            {urlStep !== 'idle' && (
              <div className="p-5 rounded-2xl bg-[#F5F4F2] border border-[#E8E6E1] space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black uppercase tracking-wider text-[#1A1919]">
                    Analysis Pipeline
                  </span>
                  <span className="text-xs font-mono font-bold text-[#0A8A36]">
                    {urlStep === 'analyzing' ? `${urlProgressPct}%` : ''}
                  </span>
                </div>

                {/* Steps List */}
                <div className="space-y-2.5">
                  {[
                    { key: 'retrieving', label: '1. Retrieving game...' },
                    { key: 'found', label: '2. Game found' },
                    { key: 'preparing', label: '3. Preparing analysis...' },
                    { key: 'analyzing', label: '4. Stockfish 18 analyzing...' },
                    { key: 'ready', label: '5. Game Review ready' }
                  ].map((step, idx) => {
                    const stepKeys: ProgressStep[] = ['retrieving', 'found', 'preparing', 'analyzing', 'ready'];
                    const currentIdx = stepKeys.indexOf(urlStep);
                    const isDone = currentIdx > idx || urlStep === 'ready';
                    const isCurrent = urlStep === step.key;

                    return (
                      <div key={step.key} className="flex items-center gap-2.5 text-xs">
                        {isDone ? (
                          <CheckCircle2 className="w-4 h-4 text-[#0A8A36] shrink-0" />
                        ) : isCurrent ? (
                          <RefreshCw className="w-4 h-4 text-[#0A8A36] animate-spin shrink-0" />
                        ) : (
                          <div className="w-4 h-4 rounded-full border border-[#D5D3CE] flex items-center justify-center text-[9px] text-[#9E9D9A]">
                            {idx + 1}
                          </div>
                        )}
                        <span className={`font-semibold ${isCurrent ? 'text-[#1A1919] font-bold' : isDone ? 'text-[#0A8A36]' : 'text-[#9E9D9A]'}`}>
                          {step.label}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* Progress bar */}
                {urlStep === 'analyzing' && (
                  <div className="w-full bg-[#E8E6E1] h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-[#0A8A36] h-full transition-all duration-300 rounded-full"
                      style={{ width: `${Math.max(5, urlProgressPct)}%` }}
                    />
                  </div>
                )}
              </div>
            )}

            {/* Error Message */}
            {error && (
              <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs space-y-2">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <span className="font-medium">{error}</span>
                </div>
                <div className="pt-1 flex items-center gap-2">
                  <span className="text-rose-600 text-[11px]">Need another option?</span>
                  <button
                    type="button"
                    onClick={() => setActiveTab('paste')}
                    className="px-3 py-1 rounded-lg bg-white border border-rose-300 text-rose-800 font-bold text-xs hover:bg-rose-100 transition-colors"
                  >
                    Paste PGN
                  </button>
                </div>
              </div>
            )}

            {/* Submit Action */}
            <button
              type="submit"
              disabled={loading || !chessComUrl.trim()}
              className="w-full py-4 rounded-full bg-[#6CFF93] hover:bg-[#5FE683] disabled:opacity-50 text-[#1A1919] font-black text-sm shadow-sm transition-all flex items-center justify-center gap-2 active:scale-[0.98] border border-[#5FE683]"
            >
              {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-[#1A1919]" />}
              <span>{loading ? 'Processing Game...' : 'Review Game'}</span>
            </button>
          </form>

          {/* Footer Navigation Switcher */}
          <div className="pt-4 border-t border-[#E8E6E1] flex flex-wrap items-center justify-between gap-2 text-xs text-[#71706E]">
            <span>Don't have the link?</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setActiveTab('paste')}
                className="font-bold text-[#1A1919] hover:underline"
              >
                Paste PGN
              </button>
              <span>or</span>
              <button
                type="button"
                onClick={() => setActiveTab('upload')}
                className="font-bold text-[#1A1919] hover:underline"
              >
                Upload PGN file
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: PASTE PGN */}
      {activeTab === 'paste' && (
        <div className="space-y-6">
          {/* Preset Quick Samples */}
          <div className="space-y-2.5">
            <label className="text-xs font-black uppercase tracking-wider text-[#71706E]">
              Select a Classic Preset:
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {SAMPLE_GAMES.map((sample, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSelectSample(sample)}
                  className="p-4 bg-white border border-[#E8E6E1] hover:border-[#1A1919] rounded-2xl text-left transition-all group shadow-sm"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-[#1A1919] group-hover:text-[#0A8A36] transition-colors truncate">
                      {sample.title}
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#F5F4F2] text-[#1A1919]">
                      {sample.eco}
                    </span>
                  </div>
                  <span className="text-[11px] text-[#71706E] block mt-1 font-medium">Click to load into editor</span>
                </button>
              ))}
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handlePgnSubmit} className="bg-white border border-[#E8E6E1] rounded-3xl p-6 shadow-sm space-y-5">
            <div>
              <label className="block text-xs font-black text-[#1A1919] uppercase tracking-wider mb-2">
                Game Title / Description
              </label>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="e.g. My Tournament Round 3"
                className="w-full px-4 py-3 rounded-2xl bg-[#F5F4F2] border border-[#E8E6E1] text-sm text-[#1A1919] placeholder-[#9E9D9A] font-medium focus:outline-none focus:border-[#1A1919]"
              />
            </div>

            <div>
              <label className="block text-xs font-black text-[#1A1919] uppercase tracking-wider mb-2">
                PGN Notation
              </label>
              <textarea
                rows={8}
                value={pgn}
                onChange={e => setPgn(e.target.value)}
                placeholder="[Event &quot;Live Chess&quot;]&#10;1. e4 e5 2. Nf3 Nc6..."
                className="w-full px-4 py-3 rounded-2xl bg-[#F5F4F2] border border-[#E8E6E1] font-mono text-xs text-[#1A1919] placeholder-[#9E9D9A] focus:outline-none focus:border-[#1A1919] leading-relaxed"
              />
            </div>

            {error && (
              <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !pgn.trim()}
              className="w-full py-4 rounded-full bg-[#6CFF93] hover:bg-[#5FE683] disabled:opacity-50 text-[#1A1919] font-black text-sm shadow-sm transition-all flex items-center justify-center gap-2 active:scale-[0.98] border border-[#5FE683]"
            >
              {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-[#1A1919]" />}
              <span>{loading ? 'Importing & Launching Stockfish...' : 'Import & Launch Game Review'}</span>
            </button>
          </form>
        </div>
      )}

      {/* TAB 3: UPLOAD PGN */}
      {activeTab === 'upload' && (
        <div className="bg-white border border-[#E8E6E1] rounded-3xl p-6 sm:p-8 shadow-sm space-y-6">
          <div className="space-y-1">
            <span className="text-[11px] font-black uppercase tracking-wider text-[#0A8A36] bg-[#EBF3EC] px-2.5 py-1 rounded-md inline-block">
              UPLOAD PGN FILE
            </span>
            <h2 className="text-lg font-black text-[#1A1919] tracking-tight">
              Select or Drop a .PGN Game File
            </h2>
            <p className="text-xs text-[#71706E] font-medium leading-relaxed">
              Upload any saved PGN export from Chess.com, Lichess, or desktop chess GUI engines.
            </p>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".pgn,text/plain"
            className="hidden"
            onChange={e => {
              if (e.target.files && e.target.files[0]) {
                handleFileUpload(e.target.files[0]);
              }
            }}
          />

          <div
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-3xl p-8 sm:p-12 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-3 ${
              dragActive
                ? 'border-[#0A8A36] bg-[#EBF3EC]/50 scale-[1.01]'
                : 'border-[#E8E6E1] hover:border-[#1A1919] bg-[#F5F4F2]/50'
            }`}
          >
            <div className="w-14 h-14 rounded-2xl bg-white border border-[#E8E6E1] flex items-center justify-center shadow-sm">
              <Upload className="w-6 h-6 text-[#1A1919]" />
            </div>

            <div>
              <p className="text-sm font-black text-[#1A1919]">
                Click to browse or drag and drop PGN here
              </p>
              <p className="text-xs text-[#71706E] mt-1 font-medium">
                Supports single-game .pgn files up to 5MB
              </p>
            </div>

            {uploadedFileName && (
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white border border-[#E8E6E1] text-xs font-bold text-[#1A1919]">
                <Check className="w-3.5 h-3.5 text-[#0A8A36]" />
                <span>{uploadedFileName}</span>
              </div>
            )}
          </div>

          {error && (
            <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          {loading && (
            <div className="p-4 rounded-2xl bg-[#F5F4F2] border border-[#E8E6E1] flex items-center justify-center gap-2 text-xs font-bold text-[#1A1919]">
              <RefreshCw className="w-4 h-4 animate-spin text-[#0A8A36]" />
              <span>Reading file and starting Stockfish 18 analysis...</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
