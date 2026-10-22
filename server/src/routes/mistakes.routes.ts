import { Router, Response } from 'express';
import { Chess } from 'chess.js';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth.middleware.js';
import { getDb } from '../db/index.js';

export const mistakesRouter = Router();

interface MistakeRow {
  id: string;
  game_id: string;
  move_number: number;
  ply: number;
  color: 'w' | 'b';
  played_move: string;
  played_move_san: string;
  best_move: string;
  best_move_san: string;
  fen: string;
  evaluation_before: number;
  evaluation_after: number;
  centipawn_loss: number;
  classification: string;
  principal_variation: string;
  explanation: string;
  white_player: string;
  black_player: string;
  played_at: string;
}

/**
 * Determine game phase from FEN and ply
 */
function classifyPhase(fen: string, ply: number): 'opening' | 'middlegame' | 'endgame' {
  if (ply <= 18) return 'opening';
  try {
    const parts = fen.split(' ')[0];
    const piecesOnly = parts.replace(/[\/\d]/g, '');
    const hasQueens = piecesOnly.toLowerCase().includes('q');
    if (!hasQueens || piecesOnly.length <= 12) {
      return 'endgame';
    }
  } catch {}
  return 'middlegame';
}

// 1. Get user's mistake collection
mistakesRouter.get('/collection', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { category, phase, limit = '30', page = '1' } = req.query;
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10)));
    const pageNum = Math.max(1, parseInt(page as string, 10));
    const offset = (pageNum - 1) * limitNum;

    const db = getDb();

    // Get user's chess accounts
    const accRes = await db.query('SELECT chess_username FROM chess_accounts WHERE user_id = $1', [userId]);
    const usernames = accRes.rows.map(r => r.chess_username.toLowerCase());
    if (req.user!.username) usernames.push(req.user!.username.toLowerCase());

    const userCondition = usernames.map((_, i) => `$${i + 2}`).join(', ');
    const params: any[] = [userId, ...usernames];

    // Query move analyses where user played the move and it was a mistake/blunder
    let classificationCondition = "m.classification IN ('blunder', 'mistake', 'inaccuracy', 'missed_win')";
    if (category && category !== 'all') {
      params.push(category);
      classificationCondition = `m.classification = $${params.length}`;
    }

    const query = `
      SELECT 
        m.id, m.game_id, m.move_number, m.ply, m.color,
        m.played_move, m.played_move_san, m.best_move, m.best_move_san,
        m.fen, m.evaluation_before, m.evaluation_after, m.centipawn_loss,
        m.classification, m.principal_variation, m.explanation,
        g.white_player, g.black_player, g.played_at
      FROM move_analysis m
      JOIN games g ON m.game_id = g.id
      WHERE g.user_id = $1
        AND (
          (m.color = 'w' AND LOWER(g.white_player) IN (${userCondition}))
          OR
          (m.color = 'b' AND LOWER(g.black_player) IN (${userCondition}))
        )
        AND ${classificationCondition}
      ORDER BY m.centipawn_loss DESC, g.played_at DESC
      LIMIT ${limitNum} OFFSET ${offset}
    `;

    const rowsRes = await db.query<MistakeRow>(query, params);

    // Enrich rows with phase and tactical indicators
    const items = rowsRes.rows.map(row => {
      const detectedPhase = classifyPhase(row.fen, row.ply);
      const isUserWhite = usernames.includes(row.white_player.toLowerCase());
      const opponentName = isUserWhite ? row.black_player : row.white_player;
      const isTactical = parseFloat(row.centipawn_loss as any) >= 150;

      return {
        id: row.id,
        gameId: row.game_id,
        opponentName,
        playedAt: row.played_at,
        moveNumber: row.move_number,
        ply: row.ply,
        userColor: row.color,
        playedMoveSan: row.played_move_san,
        bestMoveSan: row.best_move_san,
        fen: row.fen,
        evalBefore: parseFloat(row.evaluation_before as any) || 0,
        evalAfter: parseFloat(row.evaluation_after as any) || 0,
        centipawnLoss: parseFloat(row.centipawn_loss as any) || 0,
        evalSwingPawns: (Math.abs(parseFloat(row.centipawn_loss as any) || 0) / 100).toFixed(1),
        classification: row.classification,
        explanation: row.explanation,
        phase: detectedPhase,
        isTactical
      };
    });

    // Optional phase filter
    const filteredItems = phase && phase !== 'all'
      ? items.filter(item => {
          if (phase === 'tactical') return item.isTactical;
          return item.phase === phase;
        })
      : items;

    res.json({
      mistakes: filteredItems,
      total: filteredItems.length,
      page: pageNum
    });
  } catch (err: any) {
    console.error('[Mistakes Collection Error]', err);
    res.status(500).json({ error: err.message || 'Failed to load mistake collection' });
  }
});

// 2. Personal mistake pattern detection across multiple games
mistakesRouter.get('/patterns', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const db = getDb();

    // Get accounts
    const accRes = await db.query('SELECT chess_username FROM chess_accounts WHERE user_id = $1', [userId]);
    const usernames = accRes.rows.map(r => r.chess_username.toLowerCase());
    if (req.user!.username) usernames.push(req.user!.username.toLowerCase());

    const userCondition = usernames.map((_, i) => `$${i + 2}`).join(', ');
    const params: any[] = [userId, ...usernames];

    // Fetch analyzed moves for this user
    const movesRes = await db.query<MistakeRow>(`
      SELECT 
        m.id, m.game_id, m.move_number, m.ply, m.color,
        m.played_move, m.played_move_san, m.best_move, m.best_move_san,
        m.fen, m.evaluation_before, m.evaluation_after, m.centipawn_loss,
        m.classification, m.principal_variation, m.explanation,
        g.white_player, g.black_player, g.played_at
      FROM move_analysis m
      JOIN games g ON m.game_id = g.id
      WHERE g.user_id = $1
        AND (
          (m.color = 'w' AND LOWER(g.white_player) IN (${userCondition}))
          OR
          (m.color = 'b' AND LOWER(g.black_player) IN (${userCondition}))
        )
      ORDER BY g.played_at DESC
      LIMIT 1200
    `, params);

    const moves = movesRes.rows;
    const totalGamesSampled = new Set(moves.map(m => m.game_id)).size;

    // Pattern trackers
    const earlyQueenMap = new Map<string, MistakeRow>();
    const hangingPieceMap = new Map<string, MistakeRow>();
    const openingStumbleMap = new Map<string, MistakeRow>();
    const endgameMistakeMap = new Map<string, MistakeRow>();
    const missedTacticsMap = new Map<string, MistakeRow>();

    let totalEarlyQueenLoss = 0;
    let totalHangingLoss = 0;
    let totalOpeningLoss = 0;
    let totalEndgameLoss = 0;
    let totalMissedTacticsLoss = 0;

    for (const m of moves) {
      const loss = parseFloat(m.centipawn_loss as any) || 0;
      const isBlunderOrMistake = ['blunder', 'mistake', 'inaccuracy'].includes(m.classification);

      // 1. Early Queen Moves (Queen moves at move <= 8 with error)
      if (m.move_number <= 8 && m.played_move_san.startsWith('Q') && isBlunderOrMistake) {
        if (!earlyQueenMap.has(m.game_id)) {
          earlyQueenMap.set(m.game_id, m);
          totalEarlyQueenLoss += loss;
        }
      }

      // 2. Hanging Pieces / Severe Material Blunders (loss >= 250)
      if (loss >= 250 && m.classification === 'blunder') {
        if (!hangingPieceMap.has(m.game_id)) {
          hangingPieceMap.set(m.game_id, m);
          totalHangingLoss += loss;
        }
      }

      // 3. Opening Stumbles (Moves 1-10 with inaccuracy or mistake)
      if (m.move_number <= 10 && (m.classification === 'mistake' || m.classification === 'inaccuracy')) {
        if (!openingStumbleMap.has(m.game_id)) {
          openingStumbleMap.set(m.game_id, m);
          totalOpeningLoss += loss;
        }
      }

      // 4. Endgame Decisions
      const phase = classifyPhase(m.fen, m.ply);
      if (phase === 'endgame' && isBlunderOrMistake) {
        if (!endgameMistakeMap.has(m.game_id)) {
          endgameMistakeMap.set(m.game_id, m);
          totalEndgameLoss += loss;
        }
      }

      // 5. Missed Tactical Opportunities (Best move had large swing or was a capture)
      if (loss >= 180 && m.best_move_san.includes('x')) {
        if (!missedTacticsMap.has(m.game_id)) {
          missedTacticsMap.set(m.game_id, m);
          totalMissedTacticsLoss += loss;
        }
      }
    }

    const patterns: Array<{
      id: string;
      name: string;
      description: string;
      gameCount: number;
      totalGamesSampled: number;
      frequencyPct: number;
      avgEvalDropPawns: string;
      examples: Array<{
        gameId: string;
        moveNumber: number;
        fen: string;
        playedMoveSan: string;
        bestMoveSan: string;
        classification: string;
        opponent: string;
        playedAt: string;
      }>;
    }> = [];

    // Helper to format pattern
    const formatExamples = (map: Map<string, MistakeRow>) => {
      return Array.from(map.values()).slice(0, 5).map(m => {
        const isUserWhite = usernames.includes(m.white_player.toLowerCase());
        return {
          gameId: m.game_id,
          moveNumber: m.move_number,
          fen: m.fen,
          playedMoveSan: m.played_move_san,
          bestMoveSan: m.best_move_san,
          classification: m.classification,
          opponent: isUserWhite ? m.black_player : m.white_player,
          playedAt: m.played_at
        };
      });
    };

    // Require meaningful sample size (at least 2+ occurrences across games)
    if (earlyQueenMap.size >= 2) {
      patterns.push({
        id: 'early_queen',
        name: 'Premature Queen Attacks',
        description: 'Bringing the queen out before minor piece development, resulting in loss of tempo and piece chasing.',
        gameCount: earlyQueenMap.size,
        totalGamesSampled,
        frequencyPct: Math.round((earlyQueenMap.size / Math.max(1, totalGamesSampled)) * 100),
        avgEvalDropPawns: (totalEarlyQueenLoss / earlyQueenMap.size / 100).toFixed(1),
        examples: formatExamples(earlyQueenMap)
      });
    }

    if (hangingPieceMap.size >= 2) {
      patterns.push({
        id: 'hanging_pieces',
        name: 'Unprotected Pieces / Tactical Oversight',
        description: 'Leaving active pieces undefended or failing to notice opponent threats, causing sudden material loss.',
        gameCount: hangingPieceMap.size,
        totalGamesSampled,
        frequencyPct: Math.round((hangingPieceMap.size / Math.max(1, totalGamesSampled)) * 100),
        avgEvalDropPawns: (totalHangingLoss / hangingPieceMap.size / 100).toFixed(1),
        examples: formatExamples(hangingPieceMap)
      });
    }

    if (missedTacticsMap.size >= 2) {
      patterns.push({
        id: 'missed_tactics',
        name: 'Missed Tactical Wins',
        description: 'Overlooking sharp winning tactical strikes (pins, forks, counter-strikes) recommended by Stockfish.',
        gameCount: missedTacticsMap.size,
        totalGamesSampled,
        frequencyPct: Math.round((missedTacticsMap.size / Math.max(1, totalGamesSampled)) * 100),
        avgEvalDropPawns: (totalMissedTacticsLoss / missedTacticsMap.size / 100).toFixed(1),
        examples: formatExamples(missedTacticsMap)
      });
    }

    if (openingStumbleMap.size >= 2) {
      patterns.push({
        id: 'opening_stumbles',
        name: 'Early Opening Inaccuracies',
        description: 'Departing from classical opening principles in the first 10 moves, handing initiative to the opponent.',
        gameCount: openingStumbleMap.size,
        totalGamesSampled,
        frequencyPct: Math.round((openingStumbleMap.size / Math.max(1, totalGamesSampled)) * 100),
        avgEvalDropPawns: (totalOpeningLoss / openingStumbleMap.size / 100).toFixed(1),
        examples: formatExamples(openingStumbleMap)
      });
    }

    if (endgameMistakeMap.size >= 2) {
      patterns.push({
        id: 'endgame_technique',
        name: 'Endgame Conversion Weaknesses',
        description: 'Conceding advantages in simplified positions through passive king activity or missed pawn breakthroughs.',
        gameCount: endgameMistakeMap.size,
        totalGamesSampled,
        frequencyPct: Math.round((endgameMistakeMap.size / Math.max(1, totalGamesSampled)) * 100),
        avgEvalDropPawns: (totalEndgameLoss / endgameMistakeMap.size / 100).toFixed(1),
        examples: formatExamples(endgameMistakeMap)
      });
    }

    res.json({
      totalGamesAnalyzed: totalGamesSampled,
      patterns
    });
  } catch (err: any) {
    console.error('[Mistake Patterns Error]', err);
    res.status(500).json({ error: err.message || 'Failed to detect mistake patterns' });
  }
});
