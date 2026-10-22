export type MoveClassificationType =
  | 'brilliant'
  | 'great'
  | 'best'
  | 'excellent'
  | 'good'
  | 'book'
  | 'inaccuracy'
  | 'mistake'
  | 'missed_win'
  | 'blunder';

export interface ClassificationConfig {
  bestCpLossMax: number;        // cp loss <= 5 -> Best
  excellentCpLossMax: number;   // cp loss <= 25 -> Excellent
  goodCpLossMax: number;        // cp loss <= 65 -> Good
  inaccuracyCpLossMax: number;  // cp loss <= 140 -> Inaccuracy
  mistakeCpLossMax: number;     // cp loss <= 275 -> Mistake

  excellentWinProbLossMax: number;
  goodWinProbLossMax: number;
  inaccuracyWinProbLossMax: number;
  mistakeWinProbLossMax: number;
  blunderWinProbLossMin: number;
}

export const DEFAULT_CLASSIFICATION_CONFIG: ClassificationConfig = {
  bestCpLossMax: 5,
  excellentCpLossMax: 25,
  goodCpLossMax: 65,
  inaccuracyCpLossMax: 140,
  mistakeCpLossMax: 275,

  excellentWinProbLossMax: 0.025,
  goodWinProbLossMax: 0.06,
  inaccuracyWinProbLossMax: 0.14,
  mistakeWinProbLossMax: 0.28,
  blunderWinProbLossMin: 0.28,
};

export interface MoveAnalysisInput {
  moveNumber: number;
  ply: number;
  color: 'w' | 'b';
  playedMoveUci: string;
  playedMoveSan: string;
  bestMoveUci: string;
  bestMoveSan: string;
  evalBeforeCp: number;   // White's perspective
  evalAfterCp: number;    // White's perspective
  evalBeforeMate?: number;
  evalAfterMate?: number;
  isBook?: boolean;
  pieceCaptured?: string | null;
  pieceMoved?: string;
  isSacrifice?: boolean;
  isOnlyMove?: boolean;
}

export interface MoveClassificationResult {
  classification: MoveClassificationType;
  centipawnLoss: number;
  winProbBefore: number;
  winProbAfter: number;
  winProbLoss: number;
  accuracy: number; // 0 to 100
}

/**
 * Calculates win probability for White given centipawns:
 * W = 1 / (1 + 10^(-cp / 400))
 */
export function cpToWinProb(cp: number): number {
  const boundedCp = Math.min(Math.max(cp, -2000), 2000);
  return 1 / (1 + Math.pow(10, -boundedCp / 400));
}

export class MoveClassifier {
  private config: ClassificationConfig;

  constructor(config: ClassificationConfig = DEFAULT_CLASSIFICATION_CONFIG) {
    this.config = config;
  }

  updateConfig(newConfig: Partial<ClassificationConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  getConfig(): ClassificationConfig {
    return { ...this.config };
  }

  classifyMove(input: MoveAnalysisInput): MoveClassificationResult {
    const isWhite = input.color === 'w';

    // Win probability from perspective of moving side
    const rawWinBefore = cpToWinProb(input.evalBeforeCp);
    const rawWinAfter = cpToWinProb(input.evalAfterCp);

    const winProbBefore = isWhite ? rawWinBefore : 1 - rawWinBefore;
    const winProbAfter = isWhite ? rawWinAfter : 1 - rawWinAfter;

    // Loss in win probability
    const winProbLoss = Math.max(0, winProbBefore - winProbAfter);

    // Centipawn loss from perspective of moving player
    let centipawnLoss = isWhite
      ? input.evalBeforeCp - input.evalAfterCp
      : input.evalAfterCp - input.evalBeforeCp;

    if (centipawnLoss < 0) centipawnLoss = 0;

    // Per-move accuracy using standard exponential loss formula on centipawns
    let accuracy = 103.1668 * Math.exp(-0.004354 * centipawnLoss) - 3.1669;
    if (accuracy > 100) accuracy = 100;
    if (accuracy < 0) accuracy = 0;

    // Was moving side in a winning position before? (eval >= +2.5 pawns or has forced mate)
    const wasWinningBefore = isWhite
      ? (input.evalBeforeCp >= 250 || (input.evalBeforeMate !== undefined && input.evalBeforeMate > 0))
      : (input.evalBeforeCp <= -250 || (input.evalBeforeMate !== undefined && input.evalBeforeMate < 0));

    // Is position no longer clearly winning after the move? (eval dropped to <= +0.8 or opponent has counterplay)
    const isNoLongerWinning = isWhite
      ? (input.evalAfterCp <= 80 && (input.evalAfterMate === undefined || input.evalAfterMate <= 0))
      : (input.evalAfterCp >= -80 && (input.evalAfterMate === undefined || input.evalAfterMate >= 0));

    // Check if move matches best move exactly
    const isBestMove = input.playedMoveUci === input.bestMoveUci || centipawnLoss <= this.config.bestCpLossMax;

    let classification: MoveClassificationType = 'good';

    if (input.isBook) {
      classification = 'book';
    } else if (isBestMove) {
      // Brilliant Move (!!)
      // Authentic Chess.com standard criteria:
      // 1. Must be a genuine tactical piece or exchange sacrifice (input.isSacrifice === true)
      // 2. Must be the engine's best move or virtually optimal (centipawnLoss <= 5)
      // 3. Must lead to a strong / winning advantage (winProbAfter >= 0.65)
      // 4. Position before the move was not already overwhelmingly winning (< +7.00 cp / not garbage time)
      // 5. Exclude the opening book/early moves (ply > 8)
      const playerEvalBefore = isWhite ? input.evalBeforeCp : -input.evalBeforeCp;
      const notAlreadyCrushing = playerEvalBefore < 700;
      const isPastOpening = input.ply > 8;

      if (
        input.isSacrifice &&
        winProbAfter >= 0.65 &&
        centipawnLoss <= 5 &&
        notAlreadyCrushing &&
        isPastOpening
      ) {
        classification = 'brilliant';
      } else if (input.isOnlyMove || (winProbAfter >= 0.75 && centipawnLoss <= 2)) {
        classification = 'great';
      } else {
        classification = 'best';
      }
    } else {
      // Check Missed Win
      if (wasWinningBefore && isNoLongerWinning && centipawnLoss >= 180) {
        classification = 'missed_win';
      } else if (winProbLoss <= this.config.excellentWinProbLossMax || centipawnLoss <= this.config.excellentCpLossMax) {
        classification = 'excellent';
      } else if (winProbLoss <= this.config.goodWinProbLossMax || centipawnLoss <= this.config.goodCpLossMax) {
        classification = 'good';
      } else if (winProbLoss <= this.config.inaccuracyWinProbLossMax || centipawnLoss <= this.config.inaccuracyCpLossMax) {
        classification = 'inaccuracy';
      } else if (winProbLoss <= this.config.mistakeWinProbLossMax || centipawnLoss <= this.config.mistakeCpLossMax) {
        classification = 'mistake';
      } else {
        classification = 'blunder';
      }

      // Mate blunder: if opponent now has forced mate
      if (input.evalAfterMate !== undefined) {
        const opponentHasMate = isWhite ? input.evalAfterMate < 0 : input.evalAfterMate > 0;
        if (opponentHasMate) {
          classification = 'blunder';
          accuracy = 0;
        }
      }
    }

    return {
      classification,
      centipawnLoss: Math.round(centipawnLoss * 10) / 10,
      winProbBefore: Math.round(winProbBefore * 1000) / 1000,
      winProbAfter: Math.round(winProbAfter * 1000) / 1000,
      winProbLoss: Math.round(winProbLoss * 1000) / 1000,
      accuracy: Math.round(accuracy * 10) / 10
    };
  }

  calculateGameAccuracy(moveAccuracies: number[]): number {
    if (moveAccuracies.length === 0) return 100;
    const sum = moveAccuracies.reduce((acc, curr) => acc + curr, 0);
    return Math.round((sum / moveAccuracies.length) * 10) / 10;
  }
}

export const classifier = new MoveClassifier();
