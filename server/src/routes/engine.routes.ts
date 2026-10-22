import { Router, Request, Response } from 'express';
import { Chess } from 'chess.js';
import { stockfish } from '../engine/stockfish.js';
import { coach } from '../engine/coach.js';
import { ttsService } from '../services/tts.service.js';

export const engineRouter = Router();

/**
 * POST /api/engine/analyze-position
 * Primary endpoint for Chess Helper position analysis.
 */
engineRouter.post('/analyze-position', async (req: Request, res: Response): Promise<void> => {
  try {
    const { fen, depth, multiPv } = req.body;

    if (!fen || typeof fen !== 'string') {
      res.status(400).json({ error: 'FEN string is required' });
      return;
    }

    const trimmedFen = fen.trim();

    // Validate FEN with chess.js
    try {
      new Chess(trimmedFen);
    } catch {
      res.status(400).json({ error: 'Invalid FEN.' });
      return;
    }

    const targetDepth = Math.min(Math.max(parseInt(depth, 10) || 20, 10), 28);
    const targetMultiPv = Math.min(Math.max(parseInt(multiPv, 10) || 3, 1), 5);

    const result = await stockfish.analyzePosition(trimmedFen, {
      depth: targetDepth,
      multiPv: targetMultiPv
    });

    // Generate intelligent move explanation
    const explanation = coach.explainPositionBestMove(
      trimmedFen,
      result.bestMove,
      result.bestMoveSan,
      result.evaluation.scoreCp,
      result.evaluation.scoreMate,
      result.topMoves
    );

    res.json({
      ...result,
      explanation
    });
  } catch (err: any) {
    if (err.message === 'Analysis cancelled') {
      res.status(499).json({ error: 'Analysis cancelled' });
      return;
    }
    console.error('[Engine API Error]', err);
    res.status(500).json({ error: err.message || 'Position analysis failed' });
  }
});

/**
 * POST /api/engine/compare-moves
 * Compares two or three candidate moves side by side using real Stockfish 18 MultiPV data.
 */
engineRouter.post('/compare-moves', async (req: Request, res: Response): Promise<void> => {
  try {
    const { fen, depth, level = 'intermediate' } = req.body;
    if (!fen) {
      res.status(400).json({ error: 'FEN string is required' });
      return;
    }

    const trimmedFen = fen.trim();
    new Chess(trimmedFen); // validate

    const targetDepth = Math.min(Math.max(parseInt(depth, 10) || 20, 10), 26);
    const result = await stockfish.analyzePosition(trimmedFen, {
      depth: targetDepth,
      multiPv: 3
    });

    const topMoves = result.topMoves || [];
    if (topMoves.length < 2) {
      res.json({
        fen: trimmedFen,
        moves: topMoves,
        comparison: null,
        message: 'Position has only one legal move available.'
      });
      return;
    }

    const moveA = topMoves[0];
    const moveB = topMoves[1];
    const comparison = coach.explainMoveComparison(trimmedFen, moveA, moveB, level);

    res.json({
      fen: trimmedFen,
      depth: result.depth,
      moves: topMoves,
      comparison,
      bestMove: result.bestMove,
      bestMoveSan: result.bestMoveSan
    });
  } catch (err: any) {
    console.error('[Compare Moves API Error]', err);
    res.status(500).json({ error: err.message || 'Failed to compare moves' });
  }
});

/**
 * POST /api/engine/what-if
 * Explores what happens if user plays an alternative move.
 */
engineRouter.post('/what-if', async (req: Request, res: Response): Promise<void> => {
  try {
    const { fen, move, depth } = req.body;
    if (!fen || !move) {
      res.status(400).json({ error: 'Both fen and move are required' });
      return;
    }

    const trimmedFen = fen.trim();
    const chess = new Chess(trimmedFen);

    // 1. Analyze current position for baseline best move
    const baseline = await stockfish.analyzePosition(trimmedFen, { depth: 16, multiPv: 1 });
    const isWhite = chess.turn() === 'w';

    // 2. Play the user's move
    let playedMoveSan = move;
    let playedMoveUci = move;

    try {
      // Test if move is SAN or UCI
      let moveObj;
      if (move.length === 4 || move.length === 5) {
        moveObj = chess.move({
          from: move.substring(0, 2) as any,
          to: move.substring(2, 4) as any,
          promotion: move.length === 5 ? move[4] as any : undefined
        });
      }
      if (!moveObj) {
        moveObj = chess.move(move);
      }
      if (!moveObj) throw new Error('Invalid move');
      playedMoveSan = moveObj.san;
      playedMoveUci = `${moveObj.from}${moveObj.to}${moveObj.promotion || ''}`;
    } catch {
      res.status(400).json({ error: `Move '${move}' is illegal in this position.` });
      return;
    }

    const nextFen = chess.fen();

    // 3. Analyze resulting position with Stockfish 18
    const targetDepth = Math.min(Math.max(parseInt(depth, 10) || 18, 10), 24);
    const whatIfResult = await stockfish.analyzePosition(nextFen, { depth: targetDepth, multiPv: 1 });

    // Stockfish score after user move is from White's perspective:
    const baselineCp = baseline.evaluation.scoreCp;
    const whatIfCp = whatIfResult.evaluation.scoreCp;

    // Evaluation shift from side-to-move's perspective
    const evalDiff = isWhite ? (whatIfCp - baselineCp) : (baselineCp - whatIfCp);

    const explanation = coach.explainWhatIf(
      trimmedFen,
      playedMoveSan,
      baseline.bestMoveSan,
      evalDiff,
      whatIfResult.bestLine.san
    );

    res.json({
      originalFen: trimmedFen,
      resultingFen: nextFen,
      userMove: {
        san: playedMoveSan,
        uci: playedMoveUci
      },
      baseline: {
        bestMoveSan: baseline.bestMoveSan,
        bestMoveUci: baseline.bestMove,
        scoreCp: baseline.evaluation.scoreCp,
        scoreMate: baseline.evaluation.scoreMate,
        depth: baseline.depth
      },
      whatIf: {
        scoreCp: whatIfResult.evaluation.scoreCp,
        scoreMate: whatIfResult.evaluation.scoreMate,
        bestOpponentReply: whatIfResult.bestMoveSan,
        continuationSan: whatIfResult.bestLine.san,
        depth: whatIfResult.depth
      },
      evalDifferenceCp: evalDiff,
      evalDifferencePawns: parseFloat((evalDiff / 100).toFixed(2)),
      explanation
    });
  } catch (err: any) {
    console.error('[What If API Error]', err);
    res.status(500).json({ error: err.message || 'Failed to analyze what-if position' });
  }
});

/**
 * POST /api/engine/explain-move
 * Produces tailored coaching explanation with selectable level (beginner, intermediate, advanced).
 */
engineRouter.post('/explain-move', (req: Request, res: Response): void => {
  try {
    const {
      fenBefore,
      fenAfter,
      playedMoveUci,
      playedMoveSan,
      bestMoveUci,
      bestMoveSan,
      classification,
      centipawnLoss,
      evalBeforeCp,
      evalAfterCp,
      evalAfterMate,
      pv,
      moveNumber,
      color,
      level = 'intermediate'
    } = req.body;

    const ctx = {
      moveNumber: moveNumber || 1,
      color: color || 'w',
      playedMoveUci: playedMoveUci || '',
      playedMoveSan: playedMoveSan || '',
      bestMoveUci: bestMoveUci || '',
      bestMoveSan: bestMoveSan || '',
      classification: classification || 'best',
      centipawnLoss: centipawnLoss || 0,
      evalBeforeCp: evalBeforeCp || 0,
      evalAfterCp: evalAfterCp || 0,
      evalAfterMate,
      pv: pv || [],
      fenBefore: fenBefore || '',
      fenAfter: fenAfter || ''
    };

    const explanation = coach.explainWithLevel(ctx, level);
    res.json({ explanation, level });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to explain move' });
  }
});

/**
 * POST /api/engine/cancel
 * Cancel ongoing Stockfish position analysis.
 */
engineRouter.post('/cancel', (_req: Request, res: Response): void => {
  try {
    stockfish.cancelCurrentEval();
    res.json({ success: true, message: 'Current analysis cancelled' });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to cancel analysis' });
  }
});

/**
 * GET /api/engine/tts
 * Synthesizes coach voice commentary to real MP3 audio using Edge Neural TTS.
 * Query params: text, coach (anand | spongebob | cat)
 */
engineRouter.get('/tts', async (req: Request, res: Response): Promise<void> => {
  try {
    const text = (req.query.text as string || '').trim();
    const coach = (req.query.coach as any) || 'anand';

    if (!text) {
      res.status(400).json({ error: 'Text query parameter is required' });
      return;
    }

    const audioBuffer = await ttsService.synthesize({ text, coach });
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', audioBuffer.length);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(audioBuffer);
  } catch (err: any) {
    console.error('[TTS Error]', err);
    res.status(500).json({ error: err.message || 'TTS synthesis failed' });
  }
});

/**
 * POST /api/engine/tts
 * Body: { text: string, coach?: string }
 */
engineRouter.post('/tts', async (req: Request, res: Response): Promise<void> => {
  try {
    const { text, coach = 'anand' } = req.body;
    if (!text || typeof text !== 'string') {
      res.status(400).json({ error: 'Text field is required' });
      return;
    }

    const audioBuffer = await ttsService.synthesize({ text, coach });
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', audioBuffer.length);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(audioBuffer);
  } catch (err: any) {
    console.error('[TTS Error]', err);
    res.status(500).json({ error: err.message || 'TTS synthesis failed' });
  }
});

