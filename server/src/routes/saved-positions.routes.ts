import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth.middleware.js';
import { getDb } from '../db/index.js';

export const savedPositionsRouter = Router();

// Ensure table exists dynamically on first route use
let tableChecked = false;
async function ensureTable() {
  if (tableChecked) return;
  const db = getDb();
  await db.query(`
    CREATE TABLE IF NOT EXISTS saved_positions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      fen TEXT NOT NULL,
      title TEXT NOT NULL,
      notes TEXT,
      source_game_id TEXT,
      best_move TEXT,
      best_move_san TEXT,
      evaluation TEXT,
      side_to_move TEXT DEFAULT 'w',
      is_public BOOLEAN DEFAULT true,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_saved_positions_user_id ON saved_positions(user_id)`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_saved_positions_created_at ON saved_positions(created_at)`);
  tableChecked = true;
}

// 1. Get user's saved positions
savedPositionsRouter.get('/', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    await ensureTable();
    const db = getDb();
    const result = await db.query(
      `SELECT id, fen, title, notes, source_game_id, best_move, best_move_san, evaluation, side_to_move, is_public, created_at
       FROM saved_positions
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [req.user!.id]
    );
    res.json(result.rows);
  } catch (err: any) {
    console.error('[SavedPositions GET error]', err);
    res.status(500).json({ error: err.message || 'Failed to fetch saved positions' });
  }
});

// 2. Save a position
savedPositionsRouter.post('/', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    await ensureTable();
    const { fen, title, notes, sourceGameId, bestMove, bestMoveSan, evaluation, sideToMove, isPublic = true } = req.body;

    if (!fen || !title) {
      res.status(400).json({ error: 'FEN and title are required.' });
      return;
    }

    const id = uuidv4();
    const db = getDb();
    const side = sideToMove || (fen.split(' ')[1] || 'w');

    await db.query(
      `INSERT INTO saved_positions (
        id, user_id, fen, title, notes, source_game_id, best_move, best_move_san, evaluation, side_to_move, is_public
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [id, req.user!.id, fen.trim(), title.trim(), notes || null, sourceGameId || null, bestMove || null, bestMoveSan || null, evaluation || null, side, isPublic]
    );

    res.status(201).json({
      id,
      fen: fen.trim(),
      title: title.trim(),
      notes,
      sourceGameId,
      bestMove,
      bestMoveSan,
      evaluation,
      sideToMove: side,
      isPublic,
      message: 'Position saved successfully.'
    });
  } catch (err: any) {
    console.error('[SavedPositions POST error]', err);
    res.status(500).json({ error: err.message || 'Failed to save position' });
  }
});

// 3. Delete a saved position
savedPositionsRouter.delete('/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    await ensureTable();
    const db = getDb();
    const result = await db.query(
      'DELETE FROM saved_positions WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user!.id]
    );

    if (result.rowCount === 0) {
      res.status(404).json({ error: 'Position not found or unauthorized.' });
      return;
    }

    res.json({ success: true, message: 'Saved position deleted.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to delete position' });
  }
});

// 4. Public endpoint for sharing a position without exposing private user or game data
savedPositionsRouter.get('/public/:id', async (req, res) => {
  try {
    await ensureTable();
    const db = getDb();
    const result = await db.query(
      `SELECT id, fen, title, notes, best_move, best_move_san, evaluation, side_to_move, created_at
       FROM saved_positions
       WHERE id = $1 AND is_public = true`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Position not found or not shared publicly.' });
      return;
    }

    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to load shared position' });
  }
});

