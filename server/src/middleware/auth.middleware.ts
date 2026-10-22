import { Request, Response, NextFunction } from 'express';
import { authService, User } from '../services/auth.js';
import { getDb } from '../db/index.js';

export interface AuthenticatedRequest extends Request {
  user?: User;
}

export async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required. Please log in.' });
    return;
  }

  const token = authHeader.split(' ')[1];
  try {
    const payload = authService.verifyToken(token);
    const db = getDb();

    // Verify user exists in the database
    const userRes = await db.query(
      'SELECT id, email, username, created_at FROM users WHERE id = $1',
      [payload.id]
    );

    if (userRes.rows.length === 0) {
      // User possesses a cryptographically valid token signed with our JWT secret,
      // but their record is missing (e.g. after database recreation).
      // Auto-provision their user record to guarantee foreign key integrity.
      const safeEmail = payload.email || `${payload.id}@aetherchess.local`;
      const safeUsername = payload.username || `player_${payload.id.substring(0, 8)}`;

      try {
        await db.query(
          `INSERT INTO users (id, email, username, password_hash)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (id) DO NOTHING`,
          [payload.id, safeEmail, safeUsername, 'token_auth']
        );
      } catch (insertErr) {
        // In case of unique constraint conflict on email/username, use a guaranteed unique fallback
        const uniqueEmail = `${payload.id}@aetherchess.local`;
        const uniqueUsername = `user_${payload.id.substring(0, 8)}`;
        await db.query(
          `INSERT INTO users (id, email, username, password_hash)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (id) DO NOTHING`,
          [payload.id, uniqueEmail, uniqueUsername, 'token_auth']
        );
      }

      req.user = {
        id: payload.id,
        email: safeEmail,
        username: safeUsername,
        created_at: new Date().toISOString()
      };
    } else {
      req.user = userRes.rows[0];
    }

    next();
  } catch (err: any) {
    res.status(401).json({ error: err.message || 'Invalid or expired authentication token.' });
  }
}
