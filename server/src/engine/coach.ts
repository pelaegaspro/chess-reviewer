import { Chess } from 'chess.js';
import { MoveClassificationType } from './classification.js';

export interface ExplanationContext {
  moveNumber: number;
  color: 'w' | 'b';
  playedMoveUci: string;
  playedMoveSan: string;
  bestMoveUci: string;
  bestMoveSan: string;
  classification: MoveClassificationType;
  centipawnLoss: number;
  evalBeforeCp: number;
  evalAfterCp: number;
  evalAfterMate?: number;
  pv: string[];
  fenBefore: string;
  fenAfter: string;
}

const PIECE_NAMES: Record<string, string> = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king'
};

export class ChessCoach {
  generateExplanation(ctx: ExplanationContext): string {
    const isWhite = ctx.color === 'w';
    const player = isWhite ? 'White' : 'Black';
    const opponent = isWhite ? 'Black' : 'White';
    const evalDiff = Math.abs(ctx.centipawnLoss);

    // If opponent has checkmate after this move
    if (ctx.evalAfterMate !== undefined) {
      const isMated = isWhite ? ctx.evalAfterMate < 0 : ctx.evalAfterMate > 0;
      if (isMated) {
        const movesToMate = Math.abs(ctx.evalAfterMate);
        return `Fatal blunder allowing ${opponent} an unstoppable forced checkmate in ${movesToMate} ${movesToMate === 1 ? 'move' : 'moves'}. The engine recommended ${ctx.bestMoveSan} to stay in the fight.`;
      } else {
        return `Decisive move cementing a forced checkmate in ${Math.abs(ctx.evalAfterMate)} moves.`;
      }
    }

    // Examine board states with chess.js to see what pieces moved or were captured
    let chessBefore: Chess;
    let chessAfter: Chess;
    try {
      chessBefore = new Chess(ctx.fenBefore);
      chessAfter = new Chess(ctx.fenAfter);
    } catch (e) {
      return this.fallbackExplanation(ctx);
    }

    const fromSquare = ctx.playedMoveUci.substring(0, 2);
    const toSquare = ctx.playedMoveUci.substring(2, 4);
    const movedPiece = chessBefore.get(fromSquare as any);
    const capturedPiece = chessBefore.get(toSquare as any);
    const pieceName = movedPiece ? PIECE_NAMES[movedPiece.type] : 'piece';

    // Brilliant / Great / Best
    if (ctx.classification === 'brilliant') {
      return `Brilliant move! A sharp tactical resource that sacrifices material to gain a decisive positional advantage or forced mating attack.`;
    }

    if (ctx.classification === 'great') {
      return `Great find! The only winning continuation in a complex position. You found the critical resource under pressure.`;
    }

    if (ctx.classification === 'best') {
      if (capturedPiece) {
        return `Optimal capture with the ${pieceName}. Wins material and maintains full control of the position.`;
      }
      if (ctx.playedMoveSan.includes('+')) {
        return `Accurate check that forces ${opponent}'s pieces into a passive defensive posture.`;
      }
      if (ctx.moveNumber <= 10) {
        return `Strong developing move adhering to classical opening principles: controlling the center and mobilizing forces.`;
      }
      return `The best move on the board according to the engine. Preserves the balance and maximizes piece activity.`;
    }

    // Excellent / Good
    if (ctx.classification === 'excellent') {
      return `A very solid choice. While ${ctx.bestMoveSan} was slightly sharper, ${ctx.playedMoveSan} maintains a healthy position without conceding ground.`;
    }

    if (ctx.classification === 'good') {
      return `A reasonable move that keeps the game playable, though the engine found an active plan starting with ${ctx.bestMoveSan}.`;
    }

    if (ctx.classification === 'book') {
      return `Standard theoretical opening book move.`;
    }

    // Inaccuracy
    if (ctx.classification === 'inaccuracy') {
      return `A minor inaccuracy conceding ${(evalDiff / 100).toFixed(1)} pawns of advantage. Best was ${ctx.bestMoveSan}, which would have created more pressure.`;
    }

    // Mistake
    if (ctx.classification === 'mistake') {
      if (capturedPiece) {
        return `This capture was premature and loses dynamic tempo. The engine preferred ${ctx.bestMoveSan} to maintain tactical coordination.`;
      }
      return `A mistake that allows ${opponent} to seize the initiative. Playing ${ctx.bestMoveSan} would have preserved a better evaluation.`;
    }

    // Missed Win
    if (ctx.classification === 'missed_win') {
      return `Missed win! You had a decisive winning advantage, but playing ${ctx.playedMoveSan} let your opponent back into the game. ${ctx.bestMoveSan} would have maintained your winning attack.`;
    }

    // Blunder
    if (ctx.classification === 'blunder') {
      // Check if player hung a piece
      const bestMoveFrom = ctx.bestMoveUci.substring(0, 2);
      const bestMoveTo = ctx.bestMoveUci.substring(2, 4);

      if (evalDiff >= 300) {
        return `Critical blunder dropping significant material or positional compensation. You played ${ctx.playedMoveSan}, but missed ${ctx.bestMoveSan}! This swing shifts the balance of the game heavily toward ${opponent}.`;
      }
      return `Blunder that forfeits the advantage. ${ctx.bestMoveSan} was essential here to avoid tactical vulnerabilities.`;
    }

    return this.fallbackExplanation(ctx);
  }

  explainPositionBestMove(
    fen: string,
    bestMoveUci: string,
    bestMoveSan: string,
    scoreCp: number,
    scoreMate?: number,
    topMoves?: any[]
  ): string {
    try {
      const chess = new Chess(fen);
      const isWhite = chess.turn() === 'w';
      const player = isWhite ? 'White' : 'Black';
      const opponent = isWhite ? 'Black' : 'White';

      const from = bestMoveUci.substring(0, 2);
      const to = bestMoveUci.substring(2, 4);
      const movingPiece = chess.get(from as any);
      const capturedPiece = chess.get(to as any);
      const pieceName = movingPiece ? PIECE_NAMES[movingPiece.type] : 'piece';

      // Simulate move
      const moveResult = chess.move({
        from: from as any,
        to: to as any,
        promotion: bestMoveUci.length > 4 ? (bestMoveUci[4] as any) : undefined
      });

      const isCheck = chess.inCheck();
      const isCheckmate = chess.isCheckmate();

      const evalStr = scoreMate !== undefined
        ? `forced mate in ${Math.abs(scoreMate)} moves`
        : `${(scoreCp / 100).toFixed(2)} pawns`;

      if (isCheckmate) {
        return `${bestMoveSan} delivers a decisive checkmate! The ${pieceName} coordinates with existing pieces to eliminate all escape squares for the ${opponent} king.`;
      }

      if (scoreMate !== undefined) {
        return `${bestMoveSan} is the fastest path to victory, guaranteeing a ${evalStr}. It severely restricts the ${opponent} king's options and breaks down defensive barricades.`;
      }

      let explanationParts: string[] = [];

      // 1. Tactical motifs
      if (capturedPiece) {
        const capName = PIECE_NAMES[capturedPiece.type];
        explanationParts.push(`Captures the ${capName} on ${to}, winning crucial material and dismantling ${opponent}'s local structure.`);
      } else if (isCheck) {
        explanationParts.push(`Delivers an aggressive check that forces ${opponent}'s king or defenders into a passive, uncoordinated position.`);
      } else if (bestMoveSan === 'O-O' || bestMoveSan === 'O-O-O') {
        explanationParts.push(`Castles into safety while simultaneously mobilizing the rook to an active central file.`);
      } else if (movingPiece?.type === 'p' && (to.endsWith('7') || to.endsWith('2'))) {
        explanationParts.push(`Advances the pawn into a threatening advanced post, putting immense pressure on ${opponent}'s camp.`);
      } else if (['d4', 'd5', 'e4', 'e5'].includes(to)) {
        explanationParts.push(`Occupies and stakes control over a key central square (${to}), increasing spatial domination.`);
      } else {
        explanationParts.push(`Mobilizes the ${pieceName} to ${to}, maximizing active piece pressure and dynamic harmony.`);
      }

      // 2. Relative superiority over alternative candidate moves
      if (topMoves && topMoves.length > 1) {
        const secondMove = topMoves[1];
        if (secondMove && secondMove.san && secondMove.san !== bestMoveSan) {
          const delta = Math.abs(scoreCp - (secondMove.scoreCp || 0));
          if (delta >= 80) {
            explanationParts.push(
              `Stockfish clearly favors this over the second-best candidate (${secondMove.san}), as it retains a +${(delta / 100).toFixed(2)} greater advantage by preventing defensive counterplay.`
            );
          } else {
            explanationParts.push(
              `While ${secondMove.san} is also playable, ${bestMoveSan} provides the cleanest tactical continuation with fewer complications.`
            );
          }
        }
      }

      // 3. Final summary
      explanationParts.push(`Evaluation stands at ${evalStr} in favor of ${scoreCp >= 0 ? 'White' : 'Black'}.`);

      return explanationParts.join(' ');
    } catch {
      return `${bestMoveSan} is the highest-scoring engine continuation, optimizing piece activity and tactical control.`;
    }
  }

  /**
   * Generates tailored explanation based on user's selected depth level
   */
  explainWithLevel(
    ctx: ExplanationContext,
    level: 'beginner' | 'intermediate' | 'advanced' = 'intermediate'
  ): string {
    const base = this.generateExplanation(ctx);
    const evalLossPawns = (Math.abs(ctx.centipawnLoss) / 100).toFixed(1);
    const isBlunderOrMistake = ['blunder', 'mistake', 'inaccuracy'].includes(ctx.classification);

    if (level === 'beginner') {
      if (ctx.classification === 'blunder') {
        return `⚠️ Big Mistake: This move loses material or leaves a piece unprotected. The recommended move ${ctx.bestMoveSan} was much safer and kept your pieces defended.`;
      }
      if (ctx.classification === 'mistake') {
        return `Mistake: Playing ${ctx.playedMoveSan} gives your opponent an easy chance to attack. Playing ${ctx.bestMoveSan} would have kept your position solid.`;
      }
      if (ctx.classification === 'inaccuracy') {
        return `Slight inaccuracy: ${ctx.playedMoveSan} is okay, but ${ctx.bestMoveSan} was more active and controls better squares.`;
      }
      if (ctx.classification === 'best' || ctx.classification === 'brilliant' || ctx.classification === 'great') {
        return `⭐ Excellent move! ${ctx.playedMoveSan} maximizes piece activity and controls the board according to the engine.`;
      }
      return base;
    }

    if (level === 'advanced') {
      const pvLine = ctx.pv && ctx.pv.length > 0 ? ` Optimal PV: ${ctx.pv.slice(0, 4).join(' ')}.` : '';
      if (isBlunderOrMistake) {
        return `Engine evaluation swung by -${evalLossPawns} pawns. ${ctx.playedMoveSan} concedes critical positional concessions or tactical vulnerability. Stockfish calculated ${ctx.bestMoveSan} as the sole continuation retaining equity.${pvLine} Notice the immediate threat created along the active files.`;
      }
      return `${base} Calculation confirmed depth-optimized positional advantage of ${(ctx.evalAfterCp / 100).toFixed(2)} pawns.${pvLine}`;
    }

    // Intermediate (default)
    return base;
  }

  /**
   * Compares two candidate moves side by side using concrete engine data
   */
  explainMoveComparison(
    fen: string,
    moveA: { san: string; uci?: string; move?: string; scoreCp: number; scoreMate?: number; pvSan?: string[] },
    moveB: { san: string; uci?: string; move?: string; scoreCp: number; scoreMate?: number; pvSan?: string[] },
    level: 'beginner' | 'intermediate' | 'advanced' = 'intermediate'
  ): { summary: string; whyAIsStronger: string; evalDelta: number } {
    const cpA = moveA.scoreCp;
    const cpB = moveB.scoreCp;
    const delta = (cpA - cpB) / 100;
    const absDelta = Math.abs(delta).toFixed(2);

    const uciA = moveA.uci || moveA.move || '';
    const uciB = moveB.uci || moveB.move || '';

    let whyAIsStronger = '';
    try {
      const chess = new Chess(fen);
      const fromA = uciA.substring(0, 2);
      const toA = uciA.substring(2, 4);
      const fromB = uciB.substring(0, 2);
      const toB = uciB.substring(2, 4);

      const targetPieceA = chess.get(toA as any);
      const targetPieceB = chess.get(toB as any);
      const movedPieceA = chess.get(fromA as any);
      const movedPieceB = chess.get(fromB as any);

      if (targetPieceA && !targetPieceB) {
        whyAIsStronger = `${moveA.san} directly captures the ${PIECE_NAMES[targetPieceA.type] || 'piece'} on ${toA}, gaining immediate material advantage, whereas ${moveB.san} misses the capture.`;
      } else if (moveA.san.includes('+')) {
        whyAIsStronger = `${moveA.san} applies an immediate check, seizing the initiative and forcing the opponent into reactive defense.`;
      } else if (delta >= 1.5) {
        whyAIsStronger = `${moveA.san} preserves decisive tactical control (+${absDelta} pawns stronger). The continuation (${moveA.pvSan?.slice(0, 3).join(' ') || ''}) refutes opponent counterplay, while ${moveB.san} allows the opponent critical defensive resources.`;
      } else {
        whyAIsStronger = `${moveA.san} holds a cleaner positional grip (+${absDelta} pawns), coordinating pieces more harmoniously than ${moveB.san}.`;
      }
    } catch {
      whyAIsStronger = `${moveA.san} evaluates +${absDelta} pawns higher than ${moveB.san}, offering superior piece placement and control.`;
    }

    const summary = `${moveA.san} (${(cpA / 100).toFixed(2)}) is stronger than ${moveB.san} (${(cpB / 100).toFixed(2)}) by +${absDelta} pawns.`;

    return {
      summary,
      whyAIsStronger,
      evalDelta: parseFloat(absDelta)
    };
  }

  /**
   * Explains the consequences of an alternative "What If" move
   */
  explainWhatIf(
    fen: string,
    userMoveSan: string,
    bestMoveSan: string,
    diffCp: number,
    continuationSan: string[]
  ): string {
    const diffPawns = (Math.abs(diffCp) / 100).toFixed(2);
    const continuationText = continuationSan.length > 0
      ? `The opponent's most punishing reply is ${continuationSan.slice(0, 3).join(' ')}.`
      : '';

    if (diffCp <= -150) {
      return `Playing ${userMoveSan} blunders -${diffPawns} pawns compared to the recommended ${bestMoveSan}. ${continuationText} This allows the opponent immediate tactical counterplay.`;
    }
    if (diffCp < -40) {
      return `Playing ${userMoveSan} is an inaccuracy losing -${diffPawns} pawns vs ${bestMoveSan}. ${continuationText}`;
    }
    return `Playing ${userMoveSan} is quite playable (only -${diffPawns} pawns vs best move ${bestMoveSan}). ${continuationText}`;
  }

  private fallbackExplanation(ctx: ExplanationContext): string {
    if (ctx.classification === 'best') {
      return `Best move found by the engine, keeping optimal evaluation.`;
    }
    if (ctx.classification === 'blunder') {
      return `Blunder: missed ${ctx.bestMoveSan}, resulting in a ${(ctx.centipawnLoss / 100).toFixed(1)} centipawn shift.`;
    }
    return `Played ${ctx.playedMoveSan}. Engine preferred ${ctx.bestMoveSan}.`;
  }
}

export const coach = new ChessCoach();
