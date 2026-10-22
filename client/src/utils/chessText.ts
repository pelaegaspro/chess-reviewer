import React from 'react';
import { MoveAnalysis, MoveClassification } from '../types';

export interface MoveQualityStyle {
  label: string;
  shortBadge: string;
  pillBg: string;
  pillBorder: string;
  textColor: string;
  glowColor: string;
  symbol: string;
}

export const MOVE_QUALITY_STYLES: Record<MoveClassification, MoveQualityStyle> = {
  brilliant: {
    label: 'BRILLIANT',
    shortBadge: '!!',
    pillBg: 'bg-gradient-to-r from-cyan-950 via-cyan-900 to-cyan-950',
    pillBorder: 'border-cyan-400',
    textColor: 'text-cyan-300',
    glowColor: 'shadow-[0_0_15px_rgba(6,182,212,0.35)]',
    symbol: '✨'
  },
  great: {
    label: 'GREAT MOVE',
    shortBadge: '!',
    pillBg: 'bg-gradient-to-r from-blue-950 via-blue-900 to-blue-950',
    pillBorder: 'border-blue-400',
    textColor: 'text-blue-300',
    glowColor: 'shadow-[0_0_15px_rgba(59,130,246,0.35)]',
    symbol: '★'
  },
  best: {
    label: 'BEST MOVE',
    shortBadge: '✓',
    pillBg: 'bg-gradient-to-r from-emerald-950 via-[#0A8A36]/60 to-emerald-950',
    pillBorder: 'border-[#6CFF93]',
    textColor: 'text-[#6CFF93]',
    glowColor: 'shadow-[0_0_15px_rgba(108,255,147,0.3)]',
    symbol: '✓'
  },
  excellent: {
    label: 'EXCELLENT',
    shortBadge: '✓',
    pillBg: 'bg-emerald-950/80',
    pillBorder: 'border-emerald-500/60',
    textColor: 'text-emerald-300',
    glowColor: 'shadow-sm',
    symbol: '✓'
  },
  good: {
    label: 'GOOD MOVE',
    shortBadge: '●',
    pillBg: 'bg-zinc-800/90',
    pillBorder: 'border-zinc-600',
    textColor: 'text-zinc-200',
    glowColor: 'shadow-sm',
    symbol: '●'
  },
  book: {
    label: 'BOOK MOVE',
    shortBadge: '📖',
    pillBg: 'bg-amber-950/70',
    pillBorder: 'border-amber-600/70',
    textColor: 'text-amber-300',
    glowColor: 'shadow-sm',
    symbol: '📖'
  },
  inaccuracy: {
    label: 'INACCURACY',
    shortBadge: '?!',
    pillBg: 'bg-gradient-to-r from-amber-950 via-yellow-950 to-amber-950',
    pillBorder: 'border-yellow-500',
    textColor: 'text-yellow-300',
    glowColor: 'shadow-[0_0_12px_rgba(234,179,8,0.25)]',
    symbol: '?!'
  },
  mistake: {
    label: 'MISTAKE',
    shortBadge: '?',
    pillBg: 'bg-gradient-to-r from-orange-950 via-orange-900 to-orange-950',
    pillBorder: 'border-orange-500',
    textColor: 'text-orange-300',
    glowColor: 'shadow-[0_0_15px_rgba(249,115,22,0.3)]',
    symbol: '?'
  },
  missed_win: {
    label: 'MISSED WIN',
    shortBadge: '✕',
    pillBg: 'bg-gradient-to-r from-purple-950 via-purple-900 to-purple-950',
    pillBorder: 'border-purple-400',
    textColor: 'text-purple-300',
    glowColor: 'shadow-[0_0_15px_rgba(168,85,247,0.35)]',
    symbol: '✕'
  },
  blunder: {
    label: 'BLUNDER',
    shortBadge: '??',
    pillBg: 'bg-gradient-to-r from-rose-950 via-red-950 to-rose-950',
    pillBorder: 'border-rose-500',
    textColor: 'text-rose-300',
    glowColor: 'shadow-[0_0_18px_rgba(244,63,94,0.4)]',
    symbol: '??'
  }
};

/**
 * Maps SAN string to piece figurine unicode and styled notation.
 * e.g. "Qxf7+" -> { glyph: "♕", clean: "xf7+" }
 */
export const parsePieceFigurine = (san: string): { glyph?: string; glyphColor: string; cleanSan: string } => {
  if (!san) return { cleanSan: '', glyphColor: 'text-zinc-200' };

  const first = san.charAt(0);
  switch (first) {
    case 'Q': return { glyph: '♕', glyphColor: 'text-amber-300 font-bold', cleanSan: san.slice(1) };
    case 'R': return { glyph: '♖', glyphColor: 'text-sky-300 font-bold', cleanSan: san.slice(1) };
    case 'B': return { glyph: '♗', glyphColor: 'text-emerald-300 font-bold', cleanSan: san.slice(1) };
    case 'N': return { glyph: '♘', glyphColor: 'text-cyan-300 font-bold', cleanSan: san.slice(1) };
    case 'K': return { glyph: '♔', glyphColor: 'text-yellow-200 font-bold', cleanSan: san.slice(1) };
    default: return { cleanSan: san, glyphColor: 'text-zinc-200' };
  }
};

/**
 * Returns dynamic, stylish Chess.com-style coaching commentary tailored to the move.
 */
export const getDynamicCommentary = (
  move?: MoveAnalysis,
  openingName?: string
): {
  headline: string;
  badge: MoveQualityStyle;
  analysisText: string;
  engineRecommendationText?: string;
  evalDifferenceText?: string;
} => {
  if (!move) {
    return {
      headline: 'Game Review Ready',
      badge: MOVE_QUALITY_STYLES.book,
      analysisText: 'Navigate through the moves to examine key positions, Stockfish evaluations, and tactical turning points.'
    };
  }

  const cls = move.classification || 'good';
  const badge = MOVE_QUALITY_STYLES[cls] || MOVE_QUALITY_STYLES.good;
  const isWhite = move.color === 'w';
  const player = isWhite ? 'White' : 'Black';
  const opponent = isWhite ? 'Black' : 'White';
  const evalShiftPawns = Math.abs(move.centipawn_loss / 100).toFixed(1);

  // Dynamic Headline tailored to the move quality
  let headline = '';
  switch (cls) {
    case 'brilliant':
      headline = 'A brilliant tactical sacrifice!';
      break;
    case 'great':
      headline = 'You found the only winning move!';
      break;
    case 'best':
      headline = 'The best move on the board!';
      break;
    case 'excellent':
      headline = 'An excellent positional continuation.';
      break;
    case 'good':
      headline = 'A natural, playable move.';
      break;
    case 'book':
      headline = openingName ? `Standard book move in the ${openingName}.` : 'Standard opening theory.';
      break;
    case 'inaccuracy':
      headline = 'An inaccuracy that eases the pressure.';
      break;
    case 'mistake':
      headline = 'A mistake that surrenders the initiative.';
      break;
    case 'missed_win':
      headline = 'You missed a decisive winning continuation!';
      break;
    case 'blunder':
      headline = 'A critical blunder that alters the game!';
      break;
  }

  // Detailed Analysis Narrative
  let analysisText = move.explanation?.trim() || '';
  if (!analysisText || analysisText === 'Engine explanation unavailable.') {
    // Generate contextually intelligent explanation from move dynamics
    if (cls === 'brilliant') {
      analysisText = `You sacrificed material with ${move.played_move_san} to shatter the enemy defense and seize an overwhelming attack.`;
    } else if (cls === 'best') {
      analysisText = `Stockfish confirms ${move.played_move_san} is the top line, optimizing piece coordination and maintaining control of key squares.`;
    } else if (cls === 'great') {
      analysisText = `In a critical tactical moment, ${move.played_move_san} was the single candidate move that defended against threats while maintaining the advantage.`;
    } else if (cls === 'blunder') {
      analysisText = `Playing ${move.played_move_san} conceded an evaluation swing of ${evalShiftPawns} pawns. ${move.best_move_san ? `The required move was ${move.best_move_san}.` : ''}`;
    } else if (cls === 'mistake') {
      analysisText = `This move allows ${opponent} to seize active counterplay. ${move.best_move_san ? `Better was ${move.best_move_san}.` : ''}`;
    } else if (cls === 'inaccuracy') {
      analysisText = `A slight inaccuracy. While ${move.played_move_san} is safe, ${move.best_move_san ? `${move.best_move_san} would have exerted more pressure.` : 'there were more active options.'}`;
    } else if (cls === 'book') {
      analysisText = `Following established grandmaster theory to establish center control and rapid piece mobilization.`;
    } else {
      analysisText = `Keeps the position balanced, though the engine spots sharper continuations.`;
    }
  }

  // Engine Recommendation & Delta
  let engineRecommendationText: string | undefined = undefined;
  if (move.best_move_san && move.best_move_san !== move.played_move_san) {
    engineRecommendationText = `Best was ${move.best_move_san}`;
  }

  let evalDifferenceText: string | undefined = undefined;
  if (move.centipawn_loss > 50) {
    evalDifferenceText = `-${evalShiftPawns} pawns`;
  }

  return {
    headline,
    badge,
    analysisText,
    engineRecommendationText,
    evalDifferenceText
  };
};

