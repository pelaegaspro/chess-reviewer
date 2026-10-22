import { Router, Response } from 'express';
import { chessComClient } from '../services/chesscom.js';
import { importWorker } from '../services/import-worker.js';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth.middleware.js';
import { getDb } from '../db/index.js';

export const chessComRouter = Router();

// Public validation of profile
chessComRouter.get('/profile/:username', async (req, res) => {
  try {
    const profile = await chessComClient.getProfile(req.params.username);
    res.json(profile);
  } catch (err: any) {
    console.error(`[ChessCom Profile Error for ${req.params.username}]:`, err?.message || err);
    if (err.message?.includes('not found')) {
      res.status(404).json({ error: 'Chess.com profile not found. Please check the username and try again.' });
    } else {
      res.status(502).json({ 
        error: 'Chess.com data could not be retrieved right now. Please try again later.',
        details: err?.message 
      });
    }
  }
});

// Discover archives & count
chessComRouter.get('/archives/:username', async (req, res) => {
  try {
    const summary = await chessComClient.discoverArchives(req.params.username);
    res.json(summary);
  } catch (err: any) {
    console.error(`[ChessCom Archives Error for ${req.params.username}]:`, err?.message || err);
    res.status(502).json({ 
      error: 'Chess.com data could not be retrieved right now. Please try again later.',
      details: err?.message 
    });
  }
});

// Start background import
chessComRouter.post('/import', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { username, maxArchives } = req.body;
    if (!username) {
      res.status(400).json({ error: 'Chess.com username is required.' });
      return;
    }

    const userId = req.user!.id;
    const jobId = await importWorker.createJob(userId, username, maxArchives ? parseInt(maxArchives, 10) : undefined);
    res.status(202).json({ jobId, message: 'Game import job queued successfully.' });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Poll import job status
chessComRouter.get('/import-job/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const job = await importWorker.getJob(req.params.id, req.user!.id);
    if (!job) {
      res.status(404).json({ error: 'Import job not found.' });
      return;
    }
    res.json(job);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get connected chess accounts
chessComRouter.get('/accounts', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const db = getDb();
    const result = await db.query(
      'SELECT id, platform, chess_username, connected_at, last_sync_at FROM chess_accounts WHERE user_id = $1 ORDER BY connected_at DESC',
      [req.user!.id]
    );
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Directly connect and store a Chess.com account
chessComRouter.post('/accounts/connect', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { username } = req.body;
    if (!username || typeof username !== 'string') {
      res.status(400).json({ error: 'Chess.com username is required.' });
      return;
    }

    const cleanUsername = username.trim().toLowerCase();
    const profile = await chessComClient.getProfile(cleanUsername);
    if (!profile) {
      res.status(404).json({ error: `Chess.com account "${cleanUsername}" does not exist.` });
      return;
    }

    const db = getDb();
    const accountId = (await import('uuid')).v4();

    await db.query(
      `INSERT INTO chess_accounts (id, user_id, platform, chess_username, connected_at, last_sync_at)
       VALUES ($1, $2, 'chess.com', $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT (user_id, platform, chess_username)
       DO UPDATE SET last_sync_at = CURRENT_TIMESTAMP`,
      [accountId, req.user!.id, cleanUsername]
    );

    await db.query(
      'UPDATE users SET chesscom_username = $1, avatar = COALESCE($2, avatar) WHERE id = $3',
      [cleanUsername, profile.avatar, req.user!.id]
    );

    res.json({
      success: true,
      chess_username: cleanUsername,
      profile,
      message: `Successfully connected Chess.com account "${cleanUsername}".`
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to connect Chess.com account.' });
  }
});

// Disconnect a Chess.com account
chessComRouter.delete('/accounts/:username', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const cleanUsername = req.params.username.trim().toLowerCase();
    const db = getDb();
    await db.query(
      'DELETE FROM chess_accounts WHERE user_id = $1 AND platform = $2 AND LOWER(chess_username) = $3',
      [req.user!.id, 'chess.com', cleanUsername]
    );
    await db.query(
      'UPDATE users SET chesscom_username = NULL WHERE id = $1 AND LOWER(chesscom_username) = $2',
      [req.user!.id, cleanUsername]
    );
    res.json({ success: true, message: `Disconnected Chess.com account "${cleanUsername}".` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
