import React, { useState, useEffect, useCallback } from 'react';
import { Chessboard } from 'react-chessboard';
import { api } from '../services/api';
import { SavedPosition } from '../types';
import { neoCustomPieces } from '../utils/chessPieces';
import { 
  Bookmark, Compass, Share2, Trash2, RefreshCw, 
  ExternalLink, Calendar, Play, Check, Sparkles, AlertCircle
} from 'lucide-react';

interface SavedPositionsPageProps {
  onOpenInChessHelper: (fen: string) => void;
}

export const SavedPositionsPage: React.FC<SavedPositionsPageProps> = ({
  onOpenInChessHelper
}) => {
  const [positions, setPositions] = useState<SavedPosition[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const fetchPositions = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.getSavedPositions();
      setPositions(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load saved positions');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPositions();
  }, [fetchPositions]);

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this saved position?')) return;
    try {
      await api.deleteSavedPosition(id);
      setPositions(prev => prev.filter(p => p.id !== id));
    } catch (err: any) {
      alert(err.message || 'Failed to delete position');
    }
  };

  const handleShare = (p: SavedPosition) => {
    const url = `${window.location.origin}/chess-helper/position/${p.id}`;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url);
      setCopiedId(p.id);
      setTimeout(() => setCopiedId(null), 2500);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 font-sans">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-[#E8E6E1]">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-500/10 text-indigo-600 flex items-center justify-center font-bold">
              <Bookmark className="w-4 h-4" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-[#1A1919] tracking-tight">
              Saved Positions
            </h1>
          </div>
          <p className="text-sm text-[#71706E] mt-1 font-medium">
            Important tactical moments, sacrifices, and endgame studies bookmarked from Game Review and Chess Helper.
          </p>
        </div>

        <button
          onClick={fetchPositions}
          className="px-4 py-2 rounded-full bg-white hover:bg-[#F5F4F2] text-[#1A1919] font-bold text-xs shadow-sm transition-all border border-[#D5D3CE] flex items-center gap-1.5"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {positions.length === 0 ? (
        <div className="bg-white border border-[#E8E6E1] rounded-3xl p-12 text-center shadow-sm max-w-md mx-auto space-y-3">
          <Bookmark className="w-10 h-10 text-zinc-300 mx-auto" />
          <h3 className="text-base font-black text-[#1A1919]">No Saved Positions Yet</h3>
          <p className="text-xs text-[#71706E] leading-relaxed">
            Click <strong>[ Save Position ]</strong> inside Chess Helper or Game Review on any critical position to store it here for study.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {positions.map((pos) => {
            const side = pos.side_to_move || (pos.fen.split(' ')[1] || 'w');
            const isWhite = side === 'w';

            return (
              <div
                key={pos.id}
                className="bg-white border border-[#E8E6E1] rounded-3xl p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between space-y-4"
              >
                <div className="space-y-3">
                  {/* Board Preview */}
                  <div className="w-full aspect-square max-w-[260px] mx-auto rounded-2xl overflow-hidden shadow-md border border-[#E8E6E1] bg-[#2d3139]">
                    <Chessboard
                      options={{
                        position: pos.fen,
                        boardOrientation: isWhite ? 'white' : 'black',
                        allowDragging: false,
                        pieces: neoCustomPieces as any,
                        darkSquareStyle: { backgroundColor: '#769656' },
                        lightSquareStyle: { backgroundColor: '#eeeed2' }
                      }}
                    />
                  </div>

                  {/* Title & metadata */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase tracking-wider text-zinc-400">
                        {isWhite ? '◻ White to Move' : '◼ Black to Move'}
                      </span>
                      {pos.evaluation && (
                        <span className="px-2 py-0.5 rounded-full bg-[#EBF3EC] text-[#0A8A36] text-[10px] font-black font-mono">
                          {pos.evaluation}
                        </span>
                      )}
                    </div>
                    <h3 className="text-base font-black text-[#1A1919] tracking-tight">{pos.title}</h3>
                    {pos.notes && (
                      <p className="text-xs text-[#71706E] leading-relaxed">{pos.notes}</p>
                    )}
                    {pos.best_move_san && (
                      <p className="text-xs text-zinc-500">
                        Best Move: <span className="font-mono font-bold text-[#0A8A36]">{pos.best_move_san}</span>
                      </p>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="pt-3 border-t border-[#F0EFEA] flex items-center justify-between gap-2">
                  <button
                    onClick={() => onOpenInChessHelper(pos.fen)}
                    className="flex-1 py-2 px-3 rounded-xl bg-[#6CFF93] hover:bg-[#5FE683] text-[#1A1919] text-xs font-black transition-all flex items-center justify-center gap-1.5 shadow-sm"
                  >
                    <Compass className="w-3.5 h-3.5" />
                    <span>Analyze in Helper</span>
                  </button>

                  <button
                    onClick={() => handleShare(pos)}
                    className="p-2 rounded-xl bg-[#F5F4F2] hover:bg-[#EBE9E4] text-[#1A1919] transition-all"
                    title="Share Position Link"
                  >
                    {copiedId === pos.id ? (
                      <Check className="w-4 h-4 text-[#0A8A36]" />
                    ) : (
                      <Share2 className="w-4 h-4 text-[#71706E]" />
                    )}
                  </button>

                  <button
                    onClick={() => handleDelete(pos.id)}
                    className="p-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 transition-all"
                    title="Delete Position"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

