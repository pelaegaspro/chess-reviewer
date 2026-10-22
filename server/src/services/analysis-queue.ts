import { v4 as uuidv4 } from 'uuid';
import { Chess } from 'chess.js';
import { getDb } from '../db/index.js';
import { stockfish, EngineEvaluation } from '../engine/stockfish.js';
import { classifier, MoveClassificationType } from '../engine/classification.js';
import { coach } from '../engine/coach.js';
import { checkIsSacrifice } from '../engine/sacrifice.js';

export interface AnalysisProgress {
  gameId: string;
  totalPlies: number;
  completedPlies: number;
  percentage: number;
  status: 'queued' | 'analyzing' | 'completed' | 'failed';
  error?: string;
}

export class AnalysisQueue {
  private activeJobs: Map<string, AnalysisProgress> = new Map();
  private queue: Array<{ gameId: string; userId: string; depth: number }> = [];
  private isProcessing: boolean = false;

  async queueGame(gameId: string, userId: string, depth: number = 10, force: boolean = false): Promise<void> {
    const db = getDb();

    // Verify ownership
    const gameRes = await db.query(
      'SELECT id, analysis_status FROM games WHERE id = $1 AND user_id = $2',
      [gameId, userId]
    );

    if (gameRes.rows.length === 0) {
      throw new Error('Game not found or access denied.');
    }

    const currentStatus = gameRes.rows[0].analysis_status;
    if (currentStatus === 'analyzed' && !force) {
      return; // Already analyzed
    }

    if (force) {
      // Clear previous analysis
      await db.query('DELETE FROM game_analysis WHERE game_id = $1', [gameId]);
      await db.query('DELETE FROM move_analysis WHERE game_id = $1', [gameId]);
    }

    await db.query("UPDATE games SET analysis_status = 'queued' WHERE id = $1", [gameId]);

    this.activeJobs.set(gameId, {
      gameId,
      totalPlies: 0,
      completedPlies: 0,
      percentage: 0,
      status: 'queued'
    });

    this.queue.push({ gameId, userId, depth });
    this.processNext();
  }

  getProgress(gameId: string): AnalysisProgress | null {
    return this.activeJobs.get(gameId) || null;
  }

  private async processNext(): Promise<void> {
    if (this.isProcessing || this.queue.length === 0) return;
    this.isProcessing = true;

    const task = this.queue.shift()!;
    try {
      await this.analyzeGame(task.gameId, task.depth);
    } catch (err: any) {
      console.error(`[AnalysisQueue] Failed to analyze game ${task.gameId}:`, err);
      const db = getDb();
      await db.query("UPDATE games SET analysis_status = 'failed' WHERE id = $1", [task.gameId]);
      const prog = this.activeJobs.get(task.gameId);
      if (prog) {
        prog.status = 'failed';
        prog.error = err.message || 'Analysis failed';
      }
    } finally {
      this.isProcessing = false;
      this.processNext();
    }
  }

  private async analyzeGame(gameId: string, depth: number): Promise<void> {
    const db = getDb();
    const gameRes = await db.query('SELECT * FROM games WHERE id = $1', [gameId]);
    if (gameRes.rows.length === 0) return;

    const game = gameRes.rows[0];
    await db.query("UPDATE games SET analysis_status = 'analyzing' WHERE id = $1", [gameId]);
    await db.query("DELETE FROM move_analysis WHERE game_id = $1", [gameId]);
    await db.query("DELETE FROM game_analysis WHERE game_id = $1", [gameId]);

    const chess = new Chess();
    chess.loadPgn(game.pgn);
    const history = chess.history({ verbose: true });
    const totalPlies = history.length;

    this.activeJobs.set(gameId, {
      gameId,
      totalPlies,
      completedPlies: 0,
      percentage: 0,
      status: 'analyzing'
    });

    const replayChess = new Chess();
    const whiteAccuracies: number[] = [];
    const blackAccuracies: number[] = [];

    const stats = {
      white: { blunders: 0, mistakes: 0, inaccuracies: 0 },
      black: { blunders: 0, mistakes: 0, inaccuracies: 0 }
    };

    const criticalMoments: any[] = [];

    // Analyze initial starting evaluation
    let prevEval: EngineEvaluation = await stockfish.evaluateFen(replayChess.fen(), depth);

    for (let i = 0; i < history.length; i++) {
      const move = history[i];
      const fenBefore = replayChess.fen();
      const moveNumber = Math.floor(i / 2) + 1;
      const color = move.color; // 'w' | 'b'
      const isWhite = color === 'w';

      // The best move in the position before played move
      const bestMoveUci = prevEval.bestMove;

      // Find SAN for best move
      let bestMoveSan = bestMoveUci;
      try {
        const tempChess = new Chess(fenBefore);
        const from = bestMoveUci.substring(0, 2);
        const to = bestMoveUci.substring(2, 4);
        const promotion = bestMoveUci.length > 4 ? bestMoveUci.substring(4, 5) : undefined;
        const resMove = tempChess.move({ from, to, promotion } as any);
        if (resMove) bestMoveSan = resMove.san;
      } catch (e) {
        // keep uci
      }

      // Play the actual move
      replayChess.move(move);
      const fenAfter = replayChess.fen();
      const playedMoveUci = `${move.from}${move.to}${move.promotion || ''}`;

      // Evaluate position after the move
      const currentEval: EngineEvaluation = await stockfish.evaluateFen(fenAfter, depth);

      // Check if move was an authentic tactical sacrifice
      const isSacrifice = checkIsSacrifice(fenBefore, fenAfter, {
        color,
        piece: move.piece,
        from: move.from,
        to: move.to,
        captured: move.captured,
        promotion: move.promotion
      });

      // Classify the move
      const classificationResult = classifier.classifyMove({
        moveNumber,
        ply: i + 1,
        color,
        playedMoveUci,
        playedMoveSan: move.san,
        bestMoveUci,
        bestMoveSan,
        evalBeforeCp: prevEval.scoreCp,
        evalAfterCp: currentEval.scoreCp,
        evalBeforeMate: prevEval.scoreMate,
        evalAfterMate: currentEval.scoreMate,
        isBook: i < 6,
        isSacrifice: !!isSacrifice
      });

      // Generate human-language explanation grounded in engine truth
      const explanation = coach.generateExplanation({
        moveNumber,
        color,
        playedMoveUci,
        playedMoveSan: move.san,
        bestMoveUci,
        bestMoveSan,
        classification: classificationResult.classification,
        centipawnLoss: classificationResult.centipawnLoss,
        evalBeforeCp: prevEval.scoreCp,
        evalAfterCp: currentEval.scoreCp,
        evalAfterMate: currentEval.scoreMate,
        pv: currentEval.pv,
        fenBefore,
        fenAfter
      });

      // Track accuracy & classification counts
      if (isWhite) {
        whiteAccuracies.push(classificationResult.accuracy);
        if (classificationResult.classification === 'blunder') stats.white.blunders++;
        if (classificationResult.classification === 'mistake') stats.white.mistakes++;
        if (classificationResult.classification === 'inaccuracy') stats.white.inaccuracies++;
      } else {
        blackAccuracies.push(classificationResult.accuracy);
        if (classificationResult.classification === 'blunder') stats.black.blunders++;
        if (classificationResult.classification === 'mistake') stats.black.mistakes++;
        if (classificationResult.classification === 'inaccuracy') stats.black.inaccuracies++;
      }

      // Flag critical moments (blunders or turning points)
      if (classificationResult.classification === 'blunder' || classificationResult.classification === 'mistake') {
        criticalMoments.push({
          moveNumber,
          ply: i + 1,
          color,
          playedMoveSan: move.san,
          bestMoveSan,
          classification: classificationResult.classification,
          centipawnLoss: classificationResult.centipawnLoss,
          explanation,
          fen: fenBefore
        });
      }

      // Store in move_analysis
      const moveAnalysisId = uuidv4();
      await db.query(`
        INSERT INTO move_analysis (
          id, game_id, move_number, ply, color,
          played_move, played_move_san, best_move, best_move_san,
          fen, evaluation_before, evaluation_after,
          centipawn_loss, win_prob_before, win_prob_after,
          classification, principal_variation, explanation
        ) VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8, $9,
          $10, $11, $12,
          $13, $14, $15,
          $16, $17, $18
        )
      `, [
        moveAnalysisId,
        gameId,
        moveNumber,
        i + 1,
        color,
        playedMoveUci,
        move.san,
        bestMoveUci,
        bestMoveSan,
        fenAfter,
        prevEval.scoreCp,
        currentEval.scoreCp,
        classificationResult.centipawnLoss,
        classificationResult.winProbBefore,
        classificationResult.winProbAfter,
        classificationResult.classification,
        currentEval.pv.join(' '),
        explanation
      ]);

      prevEval = currentEval;

      // Update progress
      const completedPlies = i + 1;
      const percentage = Math.round((completedPlies / totalPlies) * 100);
      this.activeJobs.set(gameId, {
        gameId,
        totalPlies,
        completedPlies,
        percentage,
        status: 'analyzing'
      });
    }

    const accuracyWhite = classifier.calculateGameAccuracy(whiteAccuracies);
    const accuracyBlack = classifier.calculateGameAccuracy(blackAccuracies);

    const summary = {
      engine: 'Stockfish 18 WASM (NNUE)',
      depth,
      analyzedAt: new Date().toISOString(),
      whiteAccuracy: accuracyWhite,
      blackAccuracy: accuracyBlack,
      stats,
      criticalMoments: criticalMoments.slice(0, 5) // top critical moments
    };

    // Store in game_analysis
    const analysisId = uuidv4();
    await db.query(`
      INSERT INTO game_analysis (
        id, game_id, engine_name, engine_version, analysis_depth,
        analyzed_at, accuracy_white, accuracy_black,
        blunders_white, mistakes_white, inaccuracies_white,
        blunders_black, mistakes_black, inaccuracies_black,
        summary
      ) VALUES (
        $1, $2, 'Stockfish', '18.0.8-NNUE', $3,
        CURRENT_TIMESTAMP, $4, $5,
        $6, $7, $8,
        $9, $10, $11,
        $12::jsonb
      )
      ON CONFLICT (game_id) DO UPDATE SET
        engine_name = EXCLUDED.engine_name,
        engine_version = EXCLUDED.engine_version,
        analysis_depth = EXCLUDED.analysis_depth,
        analyzed_at = CURRENT_TIMESTAMP,
        accuracy_white = EXCLUDED.accuracy_white,
        accuracy_black = EXCLUDED.accuracy_black,
        blunders_white = EXCLUDED.blunders_white,
        mistakes_white = EXCLUDED.mistakes_white,
        inaccuracies_white = EXCLUDED.inaccuracies_white,
        blunders_black = EXCLUDED.blunders_black,
        mistakes_black = EXCLUDED.mistakes_black,
        inaccuracies_black = EXCLUDED.inaccuracies_black,
        summary = EXCLUDED.summary
    `, [
      analysisId,
      gameId,
      depth,
      accuracyWhite,
      accuracyBlack,
      stats.white.blunders,
      stats.white.mistakes,
      stats.white.inaccuracies,
      stats.black.blunders,
      stats.black.mistakes,
      stats.black.inaccuracies,
      JSON.stringify(summary)
    ]);

    await db.query("UPDATE games SET analysis_status = 'analyzed' WHERE id = $1", [gameId]);

    const prog = this.activeJobs.get(gameId);
    if (prog) {
      prog.status = 'completed';
      prog.percentage = 100;
    }
  }
}

export const analysisQueue = new AnalysisQueue();
