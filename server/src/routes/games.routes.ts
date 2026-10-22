import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { Chess } from 'chess.js';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth.middleware.js';
import { getDb } from '../db/index.js';
import { analysisQueue } from '../services/analysis-queue.js';
import { chessComClient } from '../services/chesscom.js';

export const gamesRouter = Router();

// List games with filtering and pagination
gamesRouter.get('/', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { result, timeClass, opponent, status, page = '1', limit = '20' } = req.query;

    const pageNum = Math.max(1, parseInt(page as string, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10)));
    const offset = (pageNum - 1) * limitNum;

    const conditions: string[] = ['g.user_id = $1'];
    const params: any[] = [userId];
    let paramIndex = 2;

    if (timeClass) {
      conditions.push(`g.time_class = $${paramIndex++}`);
      params.push(timeClass);
    }

    if (status) {
      conditions.push(`g.analysis_status = $${paramIndex++}`);
      params.push(status);
    }

    if (opponent) {
      conditions.push(`(LOWER(g.white_player) LIKE $${paramIndex} OR LOWER(g.black_player) LIKE $${paramIndex})`);
      params.push(`%${(opponent as string).toLowerCase()}%`);
      paramIndex++;
    }

    // Connect chess accounts to accurately filter by win/loss/draw
    const accRes = await getDb().query('SELECT chess_username FROM chess_accounts WHERE user_id = $1', [userId]);
    const usernames = accRes.rows.map(r => r.chess_username.toLowerCase());

    if (result && usernames.length > 0) {
      const userCondition = usernames.map((_, i) => `$${paramIndex + i}`).join(', ');
      usernames.forEach(u => params.push(u));
      paramIndex += usernames.length;

      if (result === 'win') {
        conditions.push(`((g.result = '1-0' AND LOWER(g.white_player) IN (${userCondition})) OR (g.result = '0-1' AND LOWER(g.black_player) IN (${userCondition})))`);
      } else if (result === 'loss') {
        conditions.push(`((g.result = '0-1' AND LOWER(g.white_player) IN (${userCondition})) OR (g.result = '1-0' AND LOWER(g.black_player) IN (${userCondition})))`);
      } else if (result === 'draw') {
        conditions.push(`g.result = '1/2-1/2'`);
      }
    }

    const whereClause = conditions.join(' AND ');

    const countRes = await getDb().query(
      `SELECT COUNT(*) as total FROM games g WHERE ${whereClause}`,
      params
    );
    const total = parseInt(countRes.rows[0]?.total || '0', 10);

    const query = `
      SELECT g.*,
             ga.accuracy_white, ga.accuracy_black,
             ga.blunders_white, ga.mistakes_white, ga.inaccuracies_white,
             ga.blunders_black, ga.mistakes_black, ga.inaccuracies_black
      FROM games g
      LEFT JOIN game_analysis ga ON g.id = ga.game_id
      WHERE ${whereClause}
      ORDER BY g.played_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `;
    params.push(limitNum, offset);

    const resultRows = await getDb().query(query, params);

    res.json({
      games: resultRows.rows,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum)
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Import custom PGN directly
gamesRouter.post('/import-pgn', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { pgn, title } = req.body;
    if (!pgn || typeof pgn !== 'string') {
      res.status(400).json({ error: 'Valid PGN string is required.' });
      return;
    }

    const chess = new Chess();
    chess.loadPgn(pgn);
    if (chess.history().length === 0) {
      res.status(400).json({ error: 'PGN contains no valid moves.' });
      return;
    }

    const headers = chess.header();
    const whitePlayer = headers['White'] || req.user!.username;
    const blackPlayer = headers['Black'] || 'Opponent';
    const result = headers['Result'] || '*';
    const dateStr = headers['Date'] || new Date().toISOString().split('T')[0];
    const eco = headers['ECO'] || null;
    const opening = headers['Opening'] || title || 'Custom Game';

    const gameId = uuidv4();
    const db = getDb();

    await db.query(`
      INSERT INTO games (
        id, user_id, external_game_id, platform,
        white_player, black_player, white_rating, black_rating,
        result, played_at, time_control, time_class, rated,
        opening, eco, pgn, imported_at, analysis_status
      ) VALUES (
        $1, $2, $3, 'manual',
        $4, $5, $6, $7,
        $8, $9, 'custom', 'rapid', false,
        $10, $11, $12, CURRENT_TIMESTAMP, 'not_analyzed'
      )
    `, [
      gameId,
      req.user!.id,
      `custom_${gameId.substring(0, 8)}`,
      whitePlayer,
      blackPlayer,
      parseInt(headers['WhiteElo'] || '1500', 10),
      parseInt(headers['BlackElo'] || '1500', 10),
      result,
      new Date().toISOString(),
      opening,
      eco,
      pgn
    ]);

    res.status(201).json({ id: gameId, message: 'Game imported successfully.' });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Import and review a game directly from a Chess.com URL
gamesRouter.post('/from-chesscom', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { url, forceReanalyze = false } = req.body;
    if (!url || typeof url !== 'string') {
      res.status(400).json({ error: 'A valid Chess.com game URL is required.' });
      return;
    }

    // Step 1: Validate URL (SSRF-safe hostname & protocol check)
    const parsed = chessComClient.validateAndParseChessComUrl(url);
    const userId = req.user!.id;
    const db = getDb();
    const externalGameId = `chesscom_${parsed.gameId}`;

    // Step 2: Check for existing game for this user by external_game_id or original_url
    const existingRes = await db.query(
      `SELECT id, analysis_status, original_url FROM games 
       WHERE user_id = $1 AND (external_game_id = $2 OR original_url = $3 OR original_url = $4)
       LIMIT 1`,
      [userId, externalGameId, parsed.normalizedUrl, url.trim()]
    );

    if (existingRes.rows.length > 0) {
      const existing = existingRes.rows[0];
      if (existing.analysis_status === 'analyzed' && !forceReanalyze) {
        res.json({
          gameId: existing.id,
          isExisting: true,
          isAnalyzed: true,
          message: 'This game has already been analyzed.'
        });
        return;
      }

      if (forceReanalyze) {
        await analysisQueue.queueGame(existing.id, userId, 10, true);
        res.json({
          gameId: existing.id,
          isExisting: true,
          isAnalyzed: false,
          reanalyzing: true,
          message: 'Game re-analysis started.'
        });
        return;
      }

      // If existing but not analyzed yet
      if (existing.analysis_status === 'not_analyzed' || existing.analysis_status === 'failed') {
        await analysisQueue.queueGame(existing.id, userId, 10, true);
      }

      res.json({
        gameId: existing.id,
        isExisting: true,
        isAnalyzed: existing.analysis_status === 'analyzed',
        message: 'Game found.'
      });
      return;
    }

    // Step 3: Fetch public game details via Chess.com public endpoints
    const gameData = await chessComClient.fetchGameFromPublicUrl(url);

    // Step 4: Validate PGN using chess.js
    const chess = new Chess();
    chess.loadPgn(gameData.pgn);
    if (chess.history().length === 0) {
      res.status(400).json({ error: 'Retrieved game does not contain valid moves.' });
      return;
    }

    // Step 5: Check duplicate by PGN for this user
    const pgnCheck = await db.query(
      `SELECT id, analysis_status FROM games WHERE user_id = $1 AND pgn = $2 LIMIT 1`,
      [userId, gameData.pgn]
    );
    if (pgnCheck.rows.length > 0) {
      const existing = pgnCheck.rows[0];
      if (existing.analysis_status === 'analyzed' && !forceReanalyze) {
        res.json({
          gameId: existing.id,
          isExisting: true,
          isAnalyzed: true,
          message: 'This game has already been analyzed.'
        });
        return;
      }
    }

    // Step 6: Insert into database
    const gameId = uuidv4();
    const playedAt = gameData.playedAt ? new Date(gameData.playedAt).toISOString() : new Date().toISOString();

    await db.query(`
      INSERT INTO games (
        id, user_id, external_game_id, platform,
        white_player, black_player, white_rating, black_rating,
        result, played_at, time_control, time_class, rated,
        opening, eco, pgn, original_url, imported_at, analysis_status
      ) VALUES (
        $1, $2, $3, 'chess.com',
        $4, $5, $6, $7,
        $8, $9, $10, $11, false,
        $12, $13, $14, $15, CURRENT_TIMESTAMP, 'not_analyzed'
      )
    `, [
      gameId,
      userId,
      externalGameId,
      gameData.whitePlayer,
      gameData.blackPlayer,
      gameData.whiteRating || 1500,
      gameData.blackRating || 1500,
      gameData.result || '*',
      playedAt,
      gameData.timeControl || 'custom',
      gameData.timeClass || 'rapid',
      gameData.opening || null,
      gameData.eco || null,
      gameData.pgn,
      parsed.normalizedUrl
    ]);

    // Step 7: Queue analysis with Stockfish 18
    await analysisQueue.queueGame(gameId, userId, 10, true);

    res.status(201).json({
      gameId,
      isExisting: false,
      isAnalyzed: false,
      message: 'Game retrieved and analysis started.'
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to retrieve game from Chess.com.' });
  }
});

// Queue analysis for a game
gamesRouter.post('/:id/analyze', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { depth = 10, force = false } = req.body;
    const gameId = req.params.id;
    const userId = req.user!.id;

    await analysisQueue.queueGame(gameId, userId, parseInt(depth, 10), !!force);
    res.status(202).json({ message: 'Analysis queued successfully.' });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Get analysis progress
gamesRouter.get('/:id/analysis-progress', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const gameId = req.params.id;
    const progress = analysisQueue.getProgress(gameId);
    if (!progress) {
      // Check current game status in DB
      const db = getDb();
      const resDb = await db.query('SELECT analysis_status FROM games WHERE id = $1 AND user_id = $2', [gameId, req.user!.id]);
      if (resDb.rows.length === 0) {
        res.status(404).json({ error: 'Game not found.' });
        return;
      }
      res.json({
        gameId,
        status: resDb.rows[0].analysis_status,
        percentage: resDb.rows[0].analysis_status === 'analyzed' ? 100 : 0
      });
      return;
    }
    res.json(progress);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Full Review payload: Game + Summary Analysis + Ordered Plies
gamesRouter.get('/:id/review', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const gameId = req.params.id;
    const userId = req.user!.id;
    const db = getDb();

    // Verify ownership
    const gameRes = await db.query(
      'SELECT * FROM games WHERE id = $1 AND user_id = $2',
      [gameId, userId]
    );

    if (gameRes.rows.length === 0) {
      res.status(404).json({ error: 'Game not found or unauthorized.' });
      return;
    }

    const game = gameRes.rows[0];

    // Fetch analysis
    const analysisRes = await db.query(
      'SELECT * FROM game_analysis WHERE game_id = $1',
      [gameId]
    );

    // Fetch moves
    const movesRes = await db.query(
      'SELECT * FROM move_analysis WHERE game_id = $1 ORDER BY ply ASC',
      [gameId]
    );

    // Get all candidate user chess names to detect side (white or black)
    const accRes = await db.query('SELECT chess_username FROM chess_accounts WHERE user_id = $1', [userId]);
    const userChessNames = new Set(accRes.rows.map(r => r.chess_username.toLowerCase()));

    const userRes = await db.query('SELECT username, chesscom_username FROM users WHERE id = $1', [userId]);
    if (userRes.rows.length > 0) {
      if (userRes.rows[0].username) userChessNames.add(userRes.rows[0].username.toLowerCase());
      if (userRes.rows[0].chesscom_username) userChessNames.add(userRes.rows[0].chesscom_username.toLowerCase());
    }

    const black = (game.black_player || '').toLowerCase();
    const white = (game.white_player || '').toLowerCase();

    let userColor: 'white' | 'black' = 'white';
    if (userChessNames.has(black)) {
      userColor = 'black';
    } else if (userChessNames.has(white)) {
      userColor = 'white';
    }

    res.json({
      game,
      analysis: analysisRes.rows[0] || null,
      moves: movesRes.rows || [],
      userColor
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Delete game
gamesRouter.delete('/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const gameId = req.params.id;
    const userId = req.user!.id;
    const db = getDb();

    const result = await db.query(
      'DELETE FROM games WHERE id = $1 AND user_id = $2',
      [gameId, userId]
    );

    if (result.rowCount === 0) {
      res.status(404).json({ error: 'Game not found or unauthorized.' });
      return;
    }

    res.json({ message: 'Game deleted successfully.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
