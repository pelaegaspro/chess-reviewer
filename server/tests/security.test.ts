import { describe, it, expect, beforeAll } from 'vitest';
import { authService } from '../src/services/auth.js';
import { initDb, getDb } from '../src/db/index.js';
import { v4 as uuidv4 } from 'uuid';

describe('Security & Multi-tenant Authorization', () => {
  beforeAll(async () => {
    await initDb();
  });

  it('should hash passwords and verify tokens', async () => {
    const email = `testuser_${Date.now()}@example.com`;
    const username = `testuser_${Date.now()}`;
    const password = 'StrongPassword123!';

    const { user, token } = await authService.register(email, username, password);
    expect(user.id).toBeDefined();
    expect(user.email).toBe(email);
    expect(token).toBeDefined();

    const decoded = authService.verifyToken(token);
    expect(decoded.id).toBe(user.id);
    expect(decoded.email).toBe(email);

    // Verify login
    const loginRes = await authService.login(email, password);
    expect(loginRes.user.id).toBe(user.id);
  });

  it('should enforce row-level ownership between different users', async () => {
    const db = getDb();

    const userA = uuidv4();
    const userB = uuidv4();
    const gameId = uuidv4();

    // Insert game owned by User A
    await db.query(`
      INSERT INTO users (id, email, username, password_hash)
      VALUES ($1, $2, $3, 'hash')
    `, [userA, `usera_${Date.now()}@test.com`, `usera_${Date.now()}`]);

    await db.query(`
      INSERT INTO users (id, email, username, password_hash)
      VALUES ($1, $2, $3, 'hash')
    `, [userB, `userb_${Date.now()}@test.com`, `userb_${Date.now()}`]);

    await db.query(`
      INSERT INTO games (
        id, user_id, external_game_id, platform,
        white_player, black_player, result, played_at, pgn
      ) VALUES ($1, $2, $3, 'test', 'P1', 'P2', '1-0', CURRENT_TIMESTAMP, '1. e4 e5')
    `, [gameId, userA, `game_${Date.now()}`]);

    // User A should own the game
    const ownsA = await authService.verifyGameOwnership(userA, gameId);
    expect(ownsA).toBe(true);

    // User B should NOT own the game
    const ownsB = await authService.verifyGameOwnership(userB, gameId);
    expect(ownsB).toBe(false);
  });
});
