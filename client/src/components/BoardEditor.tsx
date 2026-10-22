import React, { useState, useMemo, useCallback } from 'react';
import { Chess } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import { Trash2, RotateCcw, Play, AlertCircle, CheckCircle2, Copy, Crown } from 'lucide-react';

import { neoCustomPieces } from '../utils/chessPieces';

interface BoardEditorProps {
  initialFen?: string;
  onAnalyze: (fen: string) => void;
  onCancel?: () => void;
}

const STARTING_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const KINGS_ONLY_FEN = '4k3/8/8/8/8/8/8/4K3 w - - 0 1';

// Piece palette definition — official Chess.com Neo piece images
const WHITE_PIECES = [
  { code: 'K', img: '/pieces/neo/wk.png', name: 'King' },
  { code: 'Q', img: '/pieces/neo/wq.png', name: 'Queen' },
  { code: 'R', img: '/pieces/neo/wr.png', name: 'Rook' },
  { code: 'B', img: '/pieces/neo/wb.png', name: 'Bishop' },
  { code: 'N', img: '/pieces/neo/wn.png', name: 'Knight' },
  { code: 'P', img: '/pieces/neo/wp.png', name: 'Pawn' },
];
const BLACK_PIECES = [
  { code: 'k', img: '/pieces/neo/bk.png', name: 'King' },
  { code: 'q', img: '/pieces/neo/bq.png', name: 'Queen' },
  { code: 'r', img: '/pieces/neo/br.png', name: 'Rook' },
  { code: 'b', img: '/pieces/neo/bb.png', name: 'Bishop' },
  { code: 'n', img: '/pieces/neo/bn.png', name: 'Knight' },
  { code: 'p', img: '/pieces/neo/bp.png', name: 'Pawn' },
];

export const BoardEditor: React.FC<BoardEditorProps> = ({
  initialFen = STARTING_FEN,
  onAnalyze,
  onCancel
}) => {
  const [fen, setFen] = useState<string>(initialFen);
  const [sideToMove, setSideToMove] = useState<'w' | 'b'>('w');
  const [selectedPalettePiece, setSelectedPalettePiece] = useState<string | null>(null);
  const [castlingRights, setCastlingRights] = useState({
    K: true, Q: true, k: true, q: true
  });
  const [fenCopied, setFenCopied] = useState(false);

  // Parse current board into 8×8 matrix
  const boardMatrix = useMemo(() => {
    const rows = fen.split(' ')[0].split('/');
    const matrix: (string | null)[][] = [];
    for (let r = 0; r < 8; r++) {
      const row: (string | null)[] = [];
      const rowStr = rows[r] || '8';
      for (const char of rowStr) {
        if (/\d/.test(char)) {
          const emptyCount = parseInt(char, 10);
          for (let i = 0; i < emptyCount; i++) row.push(null);
        } else {
          row.push(char);
        }
      }
      matrix.push(row);
    }
    return matrix;
  }, [fen]);

  // Build FEN from matrix + current options
  const buildFen = useCallback((matrix: (string | null)[][], turn: 'w' | 'b', castle: typeof castlingRights) => {
    const rows: string[] = [];
    for (let r = 0; r < 8; r++) {
      let empty = 0;
      let rowStr = '';
      for (let f = 0; f < 8; f++) {
        const piece = matrix[r][f];
        if (!piece) {
          empty++;
        } else {
          if (empty > 0) { rowStr += empty; empty = 0; }
          rowStr += piece;
        }
      }
      if (empty > 0) rowStr += empty;
      rows.push(rowStr || '8');
    }
    const castleStr = [
      castle.K ? 'K' : '',
      castle.Q ? 'Q' : '',
      castle.k ? 'k' : '',
      castle.q ? 'q' : ''
    ].join('') || '-';
    return `${rows.join('/')} ${turn} ${castleStr} - 0 1`;
  }, []);

  const updateFenFromMatrix = useCallback((matrix: (string | null)[][], turn?: 'w' | 'b', castle?: typeof castlingRights) => {
    const newFen = buildFen(matrix, turn ?? sideToMove, castle ?? castlingRights);
    setFen(newFen);
  }, [buildFen, sideToMove, castlingRights]);

  // Legality check
  const validation = useMemo(() => {
    const position = fen.split(' ')[0];
    const whiteKings = (position.match(/K/g) || []).length;
    const blackKings = (position.match(/k/g) || []).length;
    if (whiteKings !== 1) return { valid: false, error: 'White must have exactly one King.' };
    if (blackKings !== 1) return { valid: false, error: 'Black must have exactly one King.' };
    const ranks = position.split('/');
    if (ranks[0].toLowerCase().includes('p')) return { valid: false, error: 'Pawns cannot be on the 8th rank.' };
    if (ranks[7].toLowerCase().includes('p')) return { valid: false, error: 'Pawns cannot be on the 1st rank.' };
    try {
      new Chess(fen);
      return { valid: true, error: null };
    } catch {
      return { valid: false, error: 'Illegal position (kings in check).' };
    }
  }, [fen]);

  // Click on board square — place or remove piece
  const handleSquareClick = useCallback((args: any) => {
    const square: string = typeof args === 'string' ? args : args?.square;
    if (!square || !selectedPalettePiece) return;
    const file = square.charCodeAt(0) - 97;
    const rank = parseInt(square[1], 10);
    const rIdx = 8 - rank;
    const cIdx = file;
    const newMatrix = boardMatrix.map(row => [...row]);
    if (selectedPalettePiece === 'trash') {
      newMatrix[rIdx][cIdx] = null;
    } else {
      // If same piece already here, remove it (toggle)
      if (newMatrix[rIdx][cIdx] === selectedPalettePiece) {
        newMatrix[rIdx][cIdx] = null;
      } else {
        newMatrix[rIdx][cIdx] = selectedPalettePiece;
      }
    }
    updateFenFromMatrix(newMatrix);
  }, [selectedPalettePiece, boardMatrix, updateFenFromMatrix]);

  // Drag and drop
  const handlePieceDrop = useCallback((args: any, secondArg?: any): boolean => {
    const sourceSquare = typeof args === 'object' && args?.sourceSquare ? args.sourceSquare : args;
    const targetSquare = typeof args === 'object' && args?.targetSquare ? args.targetSquare : secondArg;
    if (!sourceSquare) return false;

    if (!targetSquare) {
      const sFile = sourceSquare.charCodeAt(0) - 97;
      const sRank = parseInt(sourceSquare[1], 10);
      const newMatrix = boardMatrix.map(row => [...row]);
      newMatrix[8 - sRank][sFile] = null;
      updateFenFromMatrix(newMatrix);
      return true;
    }

    const sFile = sourceSquare.charCodeAt(0) - 97;
    const sRank = parseInt(sourceSquare[1], 10);
    const tFile = targetSquare.charCodeAt(0) - 97;
    const tRank = parseInt(targetSquare[1], 10);
    const newMatrix = boardMatrix.map(row => [...row]);
    const movingChar = newMatrix[8 - sRank][sFile];
    newMatrix[8 - sRank][sFile] = null;
    newMatrix[8 - tRank][tFile] = movingChar;
    updateFenFromMatrix(newMatrix);
    return true;
  }, [boardMatrix, updateFenFromMatrix]);

  const handleClearBoard = () => {
    setFen(KINGS_ONLY_FEN);
    setSideToMove('w');
    setCastlingRights({ K: false, Q: false, k: false, q: false });
  };

  const handleResetStart = () => {
    setFen(STARTING_FEN);
    setSideToMove('w');
    setCastlingRights({ K: true, Q: true, k: true, q: true });
  };

  const handleSideToMoveChange = (newSide: 'w' | 'b') => {
    setSideToMove(newSide);
    const parts = fen.split(' ');
    parts[1] = newSide;
    setFen(parts.join(' '));
  };

  const handleCastlingToggle = (key: 'K' | 'Q' | 'k' | 'q') => {
    const newCastle = { ...castlingRights, [key]: !castlingRights[key] };
    setCastlingRights(newCastle);
    updateFenFromMatrix(boardMatrix, sideToMove, newCastle);
  };

  const handleCopyFen = async () => {
    try {
      await navigator.clipboard.writeText(fen);
      setFenCopied(true);
      setTimeout(() => setFenCopied(false), 1500);
    } catch { /* */ }
  };

  const handleFenInput = (val: string) => {
    try {
      new Chess(val.trim());
      setFen(val.trim());
      const parts = val.trim().split(' ');
      setSideToMove((parts[1] as 'w' | 'b') || 'w');
    } catch { /* ignore invalid fen while typing */ }
  };

  return (
    <div className="bg-[#16181D] border border-[#242933] rounded-2xl p-5 shadow-xl space-y-4 font-sans text-white">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#242933] pb-3">
        <div>
          <h3 className="text-sm font-black tracking-tight text-white flex items-center gap-2">
            <Crown className="w-4 h-4 text-[#6CFF93]" />
            <span>Board Editor</span>
            <span className="text-[10px] font-bold text-zinc-400 uppercase bg-[#1F232B] px-2 py-0.5 rounded border border-[#2E3646]">
              Drag & Place
            </span>
          </h3>
          <p className="text-[11px] text-zinc-400 mt-0.5">
            Drag pieces · Click palette → click square · Build from scratch
          </p>
        </div>
        {onCancel && (
          <button type="button" onClick={onCancel} className="text-xs text-zinc-400 hover:text-white font-bold transition-colors">
            ✕ Cancel
          </button>
        )}
      </div>

      {/* Piece Palette */}
      <div className="bg-[#1B1E26] border border-[#242933] p-3 rounded-xl space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-black uppercase tracking-wider text-zinc-400">Piece Palette</span>
          {selectedPalettePiece && (
            <button type="button" onClick={() => setSelectedPalettePiece(null)}
              className="text-[10px] font-bold text-cyan-400 hover:underline">
              Clear selection
            </button>
          )}
        </div>

        {/* White pieces */}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-bold text-zinc-500 w-12 shrink-0">White:</span>
          <div className="flex gap-1.5 flex-wrap">
            {WHITE_PIECES.map(({ code, img, name }) => (
              <button
                key={code}
                type="button"
                title={name}
                onClick={() => setSelectedPalettePiece(selectedPalettePiece === code ? null : code)}
                className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all select-none p-1.5 ${
                  selectedPalettePiece === code
                    ? 'bg-cyan-500 shadow-lg scale-110 ring-2 ring-cyan-300'
                    : 'bg-[#2C3141] hover:bg-[#374055] border border-[#3A4255]'
                }`}
              >
                <img src={img} alt={name} className="w-full h-full object-contain pointer-events-none" />
              </button>
            ))}
          </div>
        </div>

        {/* Black pieces */}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-bold text-zinc-500 w-12 shrink-0">Black:</span>
          <div className="flex gap-1.5 flex-wrap">
            {BLACK_PIECES.map(({ code, img, name }) => (
              <button
                key={code}
                type="button"
                title={name}
                onClick={() => setSelectedPalettePiece(selectedPalettePiece === code ? null : code)}
                className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all select-none p-1.5 ${
                  selectedPalettePiece === code
                    ? 'bg-cyan-500 shadow-lg scale-110 ring-2 ring-cyan-300'
                    : 'bg-[#141619] hover:bg-[#1E2128] border border-[#2A2F3C]'
                }`}
              >
                <img src={img} alt={name} className="w-full h-full object-contain pointer-events-none" />
              </button>
            ))}
            {/* Eraser */}
            <button
              type="button"
              title="Erase piece"
              onClick={() => setSelectedPalettePiece(selectedPalettePiece === 'trash' ? null : 'trash')}
              className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ml-2 ${
                selectedPalettePiece === 'trash'
                  ? 'bg-rose-500 text-white shadow-lg scale-110 ring-2 ring-rose-300'
                  : 'bg-rose-950/40 text-rose-400 hover:bg-rose-900/60 border border-rose-900/50'
              }`}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Instruction hint */}
        <p className={`text-[10px] font-bold transition-colors ${selectedPalettePiece ? 'text-cyan-400' : 'text-zinc-600'}`}>
          {selectedPalettePiece === 'trash'
            ? '🗑 Click any square to remove the piece'
            : selectedPalettePiece
              ? `✔ Click any board square to place the selected piece`
              : 'Select a piece above, then click a square — or drag pieces directly'}
        </p>
      </div>

      {/* Chessboard */}
      <div className={`w-full max-w-[400px] mx-auto aspect-square rounded-xl overflow-hidden shadow-xl border transition-all ${
        selectedPalettePiece ? 'border-cyan-500/60 ring-2 ring-cyan-500/20' : 'border-[#262B35]'
      } bg-[#2d3139] cursor-${selectedPalettePiece ? 'crosshair' : 'grab'}`}>
        <Chessboard
          options={{
            position: fen,
            boardOrientation: 'white',
            allowDragging: true,
            onPieceDrop: handlePieceDrop,
            onSquareClick: handleSquareClick,
            pieces: neoCustomPieces as any,
            darkSquareStyle: { backgroundColor: '#769656' },
            lightSquareStyle: { backgroundColor: '#eeeed2' }
          }}
        />
      </div>

      {/* Controls Row */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        {/* Side to move */}
        <div className="flex items-center gap-1 bg-[#1B1E26] p-1 rounded-xl border border-[#242933]">
          <span className="text-[10px] font-bold text-zinc-400 px-2">To move:</span>
          <button
            type="button"
            onClick={() => handleSideToMoveChange('w')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 ${
              sideToMove === 'w'
                ? 'bg-zinc-100 text-black shadow-sm'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            ◻ White
          </button>
          <button
            type="button"
            onClick={() => handleSideToMoveChange('b')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 ${
              sideToMove === 'b'
                ? 'bg-[#111] text-white border border-[#3A4255] shadow-sm'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            ◼ Black
          </button>
        </div>

        {/* Quick resets */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleResetStart}
            className="px-3 py-1.5 rounded-lg bg-[#1F232B] hover:bg-[#282E3B] border border-[#2E3646] text-xs font-bold text-zinc-300 transition-all flex items-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Start</span>
          </button>
          <button
            type="button"
            onClick={handleClearBoard}
            className="px-3 py-1.5 rounded-lg bg-rose-950/30 hover:bg-rose-900/50 border border-rose-900/40 text-xs font-bold text-rose-300 transition-all flex items-center gap-1.5"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Scratch</span>
          </button>
        </div>
      </div>

      {/* Castling rights */}
      <div className="bg-[#1B1E26] border border-[#242933] p-2.5 rounded-xl">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-[10px] font-black uppercase tracking-wider text-zinc-400 shrink-0">
            Castling Rights:
          </span>
          {(['K', 'Q', 'k', 'q'] as const).map((key) => (
            <label key={key} className="flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={castlingRights[key]}
                onChange={() => handleCastlingToggle(key)}
                className="w-3.5 h-3.5 rounded accent-cyan-400"
              />
              <span className={`text-xs font-bold ${
                key === key.toUpperCase() ? 'text-zinc-200' : 'text-zinc-400'
              }`}>
                {key === 'K' ? 'White O-O' : key === 'Q' ? 'White O-O-O' : key === 'k' ? 'Black O-O' : 'Black O-O-O'}
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* FEN display */}
      <div className="space-y-1.5">
        <label className="text-[10px] font-black uppercase tracking-wider text-zinc-400">
          Current FEN
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={fen}
            onChange={(e) => handleFenInput(e.target.value)}
            className="flex-1 px-3 py-2 bg-[#111316] border border-[#2A2F3C] rounded-lg text-[11px] font-mono text-zinc-300 focus:outline-none focus:border-cyan-500"
            spellCheck={false}
          />
          <button
            type="button"
            onClick={handleCopyFen}
            title="Copy FEN"
            className={`px-3 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              fenCopied
                ? 'bg-[#6CFF93]/20 text-[#6CFF93] border border-[#6CFF93]/30'
                : 'bg-[#1F232B] hover:bg-[#282E3B] border border-[#2E3646] text-zinc-300'
            }`}
          >
            <Copy className="w-3.5 h-3.5" />
            {fenCopied ? 'Copied!' : 'Copy'}
          </button>
        </div>
      </div>

      {/* Validation */}
      {!validation.valid ? (
        <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-900/60 text-rose-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
          <span>{validation.error}</span>
        </div>
      ) : (
        <div className="p-2.5 rounded-xl bg-[#0A8A36]/10 border border-[#0A8A36]/30 text-[#6CFF93] text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>Valid position — ready for Stockfish 18 analysis.</span>
        </div>
      )}

      {/* Analyze CTA */}
      <button
        type="button"
        onClick={() => onAnalyze(fen)}
        disabled={!validation.valid}
        className="w-full py-3 px-4 rounded-xl bg-[#6CFF93] hover:bg-[#5FE683] disabled:opacity-50 disabled:cursor-not-allowed text-[#1A1919] font-black text-sm transition-all flex items-center justify-center gap-2 shadow-lg border border-[#5FE683]"
      >
        <Play className="w-4 h-4 fill-current" />
        <span>Analyze Position with Stockfish 18</span>
      </button>
    </div>
  );
};
