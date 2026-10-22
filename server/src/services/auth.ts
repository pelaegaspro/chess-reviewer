import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/index.js';
import { firebaseService } from '../db/firebase.js';
import { chessComClient } from './chesscom.js';

const JWT_SECRET = process.env.JWT_SECRET || 'aetherchess-super-secret-key-production-grade-2026';

export interface User {
  id: string;
  email: string;
  username: string;
  avatar?: string;
  title?: string;
  auth_provider?: 'local' | 'google' | 'chesscom';
  created_at: string;
}

export class AuthService {
  async register(email: string, username: string, password: string):Promise<{ user: User; token: string }> {
    const cleanEmail = email.trim().toLowerCase();
    const cleanUsername = username.trim();

    if (!cleanEmail || !cleanEmail.includes('@')) {
      throw new Error('Valid email address is required.');
    }
    if (!cleanUsername || cleanUsername.length < 3) {
      throw new Error('Username must be at least 3 characters.');
    }
    if (!password || password.length < 6) {
      throw new Error('Password must be at least 6 characters.');
    }

    const db = getDb();

    // Check uniqueness
    const existing = await db.query(
      'SELECT id FROM users WHERE email = $1 OR LOWER(username) = LOWER($2)',
      [cleanEmail, cleanUsername]
    );
    if (existing.rows.length > 0) {
      throw new Error('User with this email or username already exists.');
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);
    const id = uuidv4();

    await db.query(
      'INSERT INTO users (id, email, username, password_hash) VALUES ($1, $2, $3, $4)',
      [id, cleanEmail, cleanUsername, passwordHash]
    );

    const user: User = {
      id,
      email: cleanEmail,
      username: cleanUsername,
      created_at: new Date().toISOString()
    };

    const token = this.generateToken(user);
    return { user, token };
  }

  async login(identifier: string, password: string): Promise<{ user: User; token: string }> {
    const cleanIdentifier = identifier.trim().toLowerCase();
    const db = getDb();

    const res = await db.query(
      'SELECT id, email, username, password_hash, created_at FROM users WHERE LOWER(email) = $1 OR LOWER(username) = $1',
      [cleanIdentifier]
    );

    if (res.rows.length === 0) {
      throw new Error('Invalid credentials.');
    }

    const row = res.rows[0];
    const isMatch = await bcrypt.compare(password, row.password_hash);
    if (!isMatch) {
      throw new Error('Invalid credentials.');
    }

    const user: User = {
      id: row.id,
      email: row.email,
      username: row.username,
      created_at: row.created_at
    };

    const token = this.generateToken(user);
    return { user, token };
  }

  generateToken(user: User): string {
    return jwt.sign(
      { id: user.id, email: user.email, username: user.username },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
  }

  verifyToken(token: string): { id: string; email: string; username: string } {
    try {
      return jwt.verify(token, JWT_SECRET) as any;
    } catch (e) {
      throw new Error('Invalid or expired authentication token.');
    }
  }

  async verifyGameOwnership(userId: string, gameId: string): Promise<boolean> {
    const db = getDb();
    const res = await db.query(
      'SELECT id FROM games WHERE id = $1 AND user_id = $2',
      [gameId, userId]
    );
    return res.rows.length > 0;
  }

  async loginWithGoogle(payload: {
    credential?: string;
    profile?: { sub: string; email: string; name: string; picture?: string };
  }): Promise<{ user: User; token: string }> {
    let email = '';
    let name = '';
    let picture = '';
    let googleId = '';

    if (payload.credential) {
      try {
        const parts = payload.credential.split('.');
        if (parts.length === 3) {
          const raw = Buffer.from(parts[1], 'base64').toString('utf8');
          const decoded = JSON.parse(raw);
          email = decoded.email;
          name = decoded.name || decoded.given_name || email?.split('@')[0];
          picture = decoded.picture || '';
          googleId = decoded.sub;
        }
      } catch (e) {
        console.warn('[AuthService] Could not decode Google JWT, falling back to profile object');
      }
    }

    if (!email && payload.profile) {
      email = payload.profile.email;
      name = payload.profile.name || email.split('@')[0];
      picture = payload.profile.picture || '';
      googleId = payload.profile.sub;
    }

    if (!email) {
      throw new Error('Valid Google account email could not be determined.');
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanUsername = (name || cleanEmail.split('@')[0]).replace(/[^a-zA-Z0-9_]/g, '_').substring(0, 20);

    const db = getDb();
    const existing = await db.query(
      'SELECT id, email, username, avatar, created_at FROM users WHERE email = $1 OR google_id = $2',
      [cleanEmail, googleId]
    );

    let user: User;
    if (existing.rows.length > 0) {
      const row = existing.rows[0];
      user = {
        id: row.id,
        email: row.email,
        username: row.username,
        avatar: picture || row.avatar,
        created_at: row.created_at
      };
      await db.query(
        'UPDATE users SET avatar = COALESCE($1, avatar), google_id = COALESCE($2, google_id), auth_provider = $3 WHERE id = $4',
        [picture, googleId, 'google', row.id]
      );
    } else {
      const id = uuidv4();
      const createdAt = new Date().toISOString();
      await db.query(
        'INSERT INTO users (id, email, username, password_hash, auth_provider, avatar, google_id) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [id, cleanEmail, cleanUsername, '', 'google', picture, googleId]
      );
      user = {
        id,
        email: cleanEmail,
        username: cleanUsername,
        avatar: picture,
        created_at: createdAt
      };
    }

    // Sync to Firebase if connected
    await firebaseService.syncUser({
      id: user.id,
      email: cleanEmail,
      username: user.username,
      auth_provider: 'google',
      google_id: googleId,
      avatar: picture
    });

    const token = this.generateToken(user);
    return { user, token };
  }

  async loginWithChessCom(username: string): Promise<{ user: User; token: string; profile: any }> {
    const cleanUsername = username.trim().toLowerCase();
    if (!cleanUsername) {
      throw new Error('Chess.com username is required.');
    }

    // Verify against Chess.com API
    const profile = await chessComClient.getProfile(cleanUsername);
    if (!profile) {
      throw new Error(`Chess.com account "${cleanUsername}" does not exist.`);
    }

    const syntheticEmail = `${cleanUsername}@chess.com`;
    const db = getDb();

    const existing = await db.query(
      'SELECT id, email, username, avatar, created_at FROM users WHERE chesscom_username = $1 OR email = $2 OR LOWER(username) = $1',
      [cleanUsername, syntheticEmail]
    );

    let user: User;
    if (existing.rows.length > 0) {
      const row = existing.rows[0];
      user = {
        id: row.id,
        email: row.email,
        username: profile.username,
        avatar: profile.avatar || row.avatar,
        title: profile.title,
        created_at: row.created_at
      };
      await db.query(
        'UPDATE users SET avatar = COALESCE($1, avatar), chesscom_username = $2, auth_provider = $3 WHERE id = $4',
        [profile.avatar, cleanUsername, 'chesscom', row.id]
      );
    } else {
      const id = uuidv4();
      const createdAt = new Date().toISOString();
      await db.query(
        'INSERT INTO users (id, email, username, password_hash, auth_provider, avatar, chesscom_username) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [id, syntheticEmail, profile.username, '', 'chesscom', profile.avatar, cleanUsername]
      );
      user = {
        id,
        email: syntheticEmail,
        username: profile.username,
        avatar: profile.avatar,
        title: profile.title,
        created_at: createdAt
      };
    }

    // Auto-link chess_accounts record
    const accountId = uuidv4();
    await db.query(
      `INSERT INTO chess_accounts (id, user_id, platform, chess_username, connected_at)
       VALUES ($1, $2, 'chess.com', $3, CURRENT_TIMESTAMP)
       ON CONFLICT (user_id, platform, chess_username) DO NOTHING`,
      [accountId, user.id, cleanUsername]
    );

    // Sync to Firebase if connected
    await firebaseService.syncUser({
      id: user.id,
      email: syntheticEmail,
      username: user.username,
      auth_provider: 'chesscom',
      chesscom_username: cleanUsername,
      avatar: profile.avatar,
      title: profile.title
    });

    await firebaseService.syncChessAccount({
      id: accountId,
      user_id: user.id,
      platform: 'chess.com',
      username: cleanUsername,
      profile_url: profile.url,
      avatar_url: profile.avatar,
      title: profile.title,
      country: profile.country
    });

    const token = this.generateToken(user);
    return { user, token, profile };
  }

  async loginWithFirebase(payload: {
    idToken: string;
    email?: string;
    displayName?: string;
    photoURL?: string;
    uid?: string;
  }): Promise<{ user: User; token: string }> {
    let email = payload.email || '';
    let name = payload.displayName || '';
    let picture = payload.photoURL || '';
    let uid = payload.uid || '';

    // Verify token if Firebase Admin is connected
    if (payload.idToken) {
      try {
        const decoded = await firebaseService.verifyIdToken(payload.idToken);
        if (decoded) {
          email = decoded.email || email;
          name = decoded.name || name;
          picture = decoded.picture || picture;
          uid = decoded.uid || uid;
        }
      } catch (err: any) {
        console.warn('[AuthService] Firebase ID token verify note:', err.message);
      }
    }

    if (!email) {
      throw new Error('Valid Firebase account email could not be determined.');
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanUsername = (name || cleanEmail.split('@')[0]).replace(/[^a-zA-Z0-9_]/g, '_').substring(0, 20);

    const db = getDb();
    const existing = await db.query(
      'SELECT id, email, username, avatar, created_at FROM users WHERE email = $1',
      [cleanEmail]
    );

    let user: User;
    if (existing.rows.length > 0) {
      const row = existing.rows[0];
      user = {
        id: row.id,
        email: row.email,
        username: row.username,
        avatar: picture || row.avatar,
        created_at: row.created_at
      };
      await db.query(
        'UPDATE users SET avatar = COALESCE($1, avatar), auth_provider = $2 WHERE id = $3',
        [picture, 'local', row.id]
      );
    } else {
      const id = uid || uuidv4();
      const createdAt = new Date().toISOString();
      await db.query(
        'INSERT INTO users (id, email, username, password_hash, auth_provider, avatar) VALUES ($1, $2, $3, $4, $5, $6)',
        [id, cleanEmail, cleanUsername, '', 'local', picture]
      );
      user = {
        id,
        email: cleanEmail,
        username: cleanUsername,
        avatar: picture,
        created_at: createdAt
      };
    }

    // Sync to Firestore
    await firebaseService.syncUser({
      id: user.id,
      email: cleanEmail,
      username: user.username,
      auth_provider: 'local',
      avatar: picture
    });

    const token = this.generateToken(user);
    return { user, token };
  }
}

export const authService = new AuthService();
