import { Chess } from 'chess.js';

export const PIECE_VALUES: Record<string, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 0,
};

export interface SacrificeCheckInput {
  color: 'w' | 'b';
  piece: string;
  from: string;
  to: string;
  captured?: string;
  promotion?: string;
}

/**
 * Accurately determines if a chess move is a genuine tactical sacrifice.
 * Criteria (aligned with Chess.com standard):
 * 1. Must involve sacrificing at least a minor piece (value 3), an exchange sacrifice (rook for minor piece, net >= 2), or a queen.
 *    Routine trades of equal value ("same coin values": Knight for Knight, Bishop for Bishop, etc.) are strictly NOT sacrifices.
 * 2. Active sacrifice: The played piece moves to an attacked square where:
 *    - The square is undefended by the moving player (opponent can take it freely), OR
 *    - The square is defended, but the exchange yields a net loss of >= 2 points of material (e.g. rook for minor piece, minor piece for pawn).
 * 3. Passive sacrifice: The player moves a piece while leaving another piece of value >= 3 hanging
 *    where opponent can capture it with net gain of >= 2 points of material.
 * 4. Opponent must have at least one legal reply (i.e. checkmate cannot be an accepted sacrifice).
 */
export function checkIsSacrifice(
  fenBefore: string,
  fenAfter: string,
  move: SacrificeCheckInput
): boolean {
  try {
    const testAfter = new Chess(fenAfter);
    const oppMoves = testAfter.moves({ verbose: true });

    // If opponent has no legal moves (checkmate or stalemate), no sacrifice can be accepted
    if (oppMoves.length === 0) {
      return false;
    }

    const movedPieceType = (move.promotion || move.piece).toLowerCase();
    const movedPieceVal = PIECE_VALUES[movedPieceType] || 0;
    const initialCapturedVal = move.captured ? (PIECE_VALUES[move.captured.toLowerCase()] || 0) : 0;

    // 1. Check ACTIVE sacrifice (the piece that just moved)
    if (movedPieceVal >= 3) {
      const oppCapturesOnTo = oppMoves.filter(om => om.to === move.to);
      if (oppCapturesOnTo.length > 0) {
        // Sort opponent captures from lowest-value attacker to highest (cheapest attacker first)
        oppCapturesOnTo.sort((a, b) => (PIECE_VALUES[a.piece.toLowerCase()] || 0) - (PIECE_VALUES[b.piece.toLowerCase()] || 0));
        const cheapestOppCapture = oppCapturesOnTo[0];
        const oppAttackerVal = PIECE_VALUES[cheapestOppCapture.piece.toLowerCase()] || 0;

        // Simulate the opponent capturing the moved piece
        const simAfterOpp = new Chess(fenAfter);
        simAfterOpp.move(cheapestOppCapture);

        // Check if player has recaptures on that square
        const playerRecaptures = simAfterOpp.moves({ verbose: true }).filter(pm => pm.to === move.to);

        if (playerRecaptures.length === 0) {
          // Undefended! The piece is hanging free.
          // Net material loss for player:
          const netLoss = movedPieceVal - initialCapturedVal;
          if (netLoss >= 2) {
            return true;
          }
        } else {
          // Square is defended. Does player lose net material in this exchange?
          // (e.g. Rook for Bishop/Knight, or Minor piece for Pawn)
          // Opponent loses oppAttackerVal, player lost movedPieceVal and gained initialCapturedVal.
          const netLoss = movedPieceVal - initialCapturedVal - oppAttackerVal;
          if (netLoss >= 2) {
            return true;
          }
        }
      }
    }

    // 2. Check PASSIVE sacrifice (leaving a valuable piece hanging elsewhere)
    const otherOppCaptures = oppMoves.filter(om => om.to !== move.to && om.captured);
    for (const om of otherOppCaptures) {
      const targetVal = PIECE_VALUES[om.captured?.toLowerCase() || ''] || 0;
      // Only minor pieces (3), rooks (5), or queens (9) count as significant passive sacrifices
      if (targetVal >= 3) {
        const simAfterOpp = new Chess(fenAfter);
        simAfterOpp.move(om);

        const playerRecaptures = simAfterOpp.moves({ verbose: true }).filter(pm => pm.to === om.to);
        if (playerRecaptures.length === 0) {
          // Player cannot recapture the hanging piece!
          const netLoss = targetVal - initialCapturedVal;
          if (netLoss >= 2) {
            return true;
          }
        } else {
          const oppAttackerVal = PIECE_VALUES[om.piece.toLowerCase()] || 0;
          const netLoss = targetVal - initialCapturedVal - oppAttackerVal;
          if (netLoss >= 2) {
            return true;
          }
        }
      }
    }
  } catch {
    return false;
  }

  return false;
}

