import { v4 as uuidv4 } from 'uuid';
import { Chess } from 'chess.js';
import { getDb } from '../db/index.js';
import { chessComClient, ChessComGame } from './chesscom.js';

export interface ImportJobState {
  id: string;
  userId: string;
  chessUsername: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  totalArchives: number;
  processedArchives: number;
  totalGames: number;
  importedCount: number;
  skippedDuplicates: number;
  errors: number;
  errorLog: Array<{ message: string; timestamp: string }>;
  createdAt: string;
  updatedAt: string;
}

export class ImportWorker {
  private activeJobs: Map<string, boolean> = new Map();

  async createJob(userId: string, chessUsername: string, maxArchives?: number): Promise<string> {
    const db = getDb();
    const cleanUsername = chessUsername.trim().toLowerCase();

    // 1. Validate profile and get archives
    const profile = await chessComClient.getProfile(cleanUsername);
    const allArchives = await chessComClient.getArchives(cleanUsername);

    // Filter to latest N archives if requested, otherwise recent 12 months or all
    const archivesToFetch = maxArchives && maxArchives > 0
      ? allArchives.slice(-maxArchives)
      : allArchives;

    const jobId = uuidv4();
    const now = new Date().toISOString();

    // Upsert chess_account
    const accountId = uuidv4();
    await db.query(`
      INSERT INTO chess_accounts (id, user_id, platform, chess_username, connected_at, last_sync_at)
      VALUES ($1, $2, 'chess.com', $3, $4, $4)
      ON CONFLICT (user_id, platform, chess_username)
      DO UPDATE SET last_sync_at = EXCLUDED.last_sync_at;
    `, [accountId, userId, cleanUsername, now]);

    // Insert job
    await db.query(`
      INSERT INTO import_jobs (
        id, user_id, chess_username, status,
        total_archives, processed_archives, total_games,
        imported_count, skipped_duplicates, errors, error_log,
        created_at, updated_at
      ) VALUES ($1, $2, $3, 'queued', $4, 0, 0, 0, 0, 0, '[]'::jsonb, $5, $5)
    `, [jobId, userId, cleanUsername, archivesToFetch.length, now]);

    // Kick off asynchronous processing without blocking HTTP request
    setImmediate(() => {
      this.runJob(jobId, userId, cleanUsername, archivesToFetch).catch(err => {
        console.error(`[ImportWorker] Fatal error in job ${jobId}:`, err);
      });
    });

    return jobId;
  }

  async getJob(jobId: string, userId: string): Promise<ImportJobState | null> {
    const db = getDb();
    const res = await db.query(
      'SELECT * FROM import_jobs WHERE id = $1 AND user_id = $2',
      [jobId, userId]
    );

    if (res.rows.length === 0) return null;

    const row = res.rows[0];
    return {
      id: row.id,
      userId: row.user_id,
      chessUsername: row.chess_username,
      status: row.status,
      totalArchives: row.total_archives,
      processedArchives: row.processed_archives,
      totalGames: row.total_games,
      importedCount: row.imported_count,
      skippedDuplicates: row.skipped_duplicates,
      errors: row.errors,
      errorLog: typeof row.error_log === 'string' ? JSON.parse(row.error_log) : (row.error_log || []),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  private async runJob(jobId: string, userId: string, username: string, archives: string[]): Promise<void> {
    const db = getDb();
    this.activeJobs.set(jobId, true);

    await db.query("UPDATE import_jobs SET status = 'running', updated_at = CURRENT_TIMESTAMP WHERE id = $1", [jobId]);

    let importedCount = 0;
    let skippedDuplicates = 0;
    let errorCount = 0;
    const errorLogs: Array<{ message: string; timestamp: string }> = [];
    let totalGamesDiscovered = 0;

    try {
      // Process archives from most recent to oldest
      const reversedArchives = [...archives].reverse();

      for (let i = 0; i < reversedArchives.length; i++) {
        const archiveUrl = reversedArchives[i];

        let games: ChessComGame[] = [];
        try {
          games = await chessComClient.getGamesForArchive(archiveUrl);
          totalGamesDiscovered += games.length;

          // Update total games count
          await db.query(
            'UPDATE import_jobs SET total_games = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
            [totalGamesDiscovered, jobId]
          );
        } catch (fetchErr: any) {
          errorCount++;
          errorLogs.push({
            message: `Failed to fetch archive ${archiveUrl}: ${fetchErr.message}`,
            timestamp: new Date().toISOString()
          });
          continue;
        }

        for (const game of games) {
          // Verify valid PGN and rules
          if (!game.pgn || (game.rules && game.rules !== 'chess')) {
            // Skip non-standard variants
            continue;
          }

          const externalGameId = chessComClient.extractGameId(game.url);

          // 1. Check duplicate
          const existing = await db.query(
            'SELECT id FROM games WHERE user_id = $1 AND platform = $2 AND external_game_id = $3',
            [userId, 'chess.com', externalGameId]
          );

          if (existing.rows.length > 0) {
            skippedDuplicates++;
            continue;
          }

          // 2. Validate PGN with chess.js
          try {
            const chess = new Chess();
            chess.loadPgn(game.pgn);
            if (chess.history().length === 0) {
              skippedDuplicates++;
              continue;
            }
          } catch (pgnErr: any) {
            errorCount++;
            errorLogs.push({
              message: `Malformed PGN for game ${game.url}: ${pgnErr.message}`,
              timestamp: new Date().toISOString()
            });
            continue;
          }

          // 3. Extract metadata
          const { eco, opening, result: pgnResult } = chessComClient.parsePgnHeaders(game.pgn);
          const result = pgnResult || (
            game.white.result === 'win' ? '1-0' :
            game.black.result === 'win' ? '0-1' : '1/2-1/2'
          );

          const playedAt = new Date((game.end_time || Date.now() / 1000) * 1000).toISOString();
          const gameId = uuidv4();

          await db.query(`
            INSERT INTO games (
              id, user_id, external_game_id, platform,
              white_player, black_player, white_rating, black_rating,
              result, played_at, time_control, time_class, rated,
              opening, eco, pgn, imported_at, analysis_status
            ) VALUES (
              $1, $2, $3, 'chess.com',
              $4, $5, $6, $7,
              $8, $9, $10, $11, $12,
              $13, $14, $15, CURRENT_TIMESTAMP, 'not_analyzed'
            ) ON CONFLICT (user_id, platform, external_game_id) DO NOTHING
          `, [
            gameId,
            userId,
            externalGameId,
            game.white.username,
            game.black.username,
            game.white.rating || null,
            game.black.rating || null,
            result,
            playedAt,
            game.time_control || 'unknown',
            game.time_class || 'blitz',
            game.rated ?? true,
            opening || 'Standard Game',
            eco || null,
            game.pgn
          ]);

          importedCount++;
        }

        // Update progress per archive
        await db.query(`
          UPDATE import_jobs
          SET processed_archives = $1,
              imported_count = $2,
              skipped_duplicates = $3,
              errors = $4,
              error_log = $5::jsonb,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = $6
        `, [i + 1, importedCount, skippedDuplicates, errorCount, JSON.stringify(errorLogs.slice(-20)), jobId]);
      }

      await db.query(`
        UPDATE import_jobs
        SET status = 'completed',
            processed_archives = total_archives,
            imported_count = $1,
            skipped_duplicates = $2,
            errors = $3,
            error_log = $4::jsonb,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $5
      `, [importedCount, skippedDuplicates, errorCount, JSON.stringify(errorLogs.slice(-20)), jobId]);

    } catch (err: any) {
      console.error(`[ImportWorker] Error processing job ${jobId}:`, err);
      errorLogs.push({ message: err.message || 'Fatal error', timestamp: new Date().toISOString() });
      await db.query(`
        UPDATE import_jobs
        SET status = 'failed',
            error_log = $1::jsonb,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
      `, [JSON.stringify(errorLogs), jobId]);
    } finally {
      this.activeJobs.delete(jobId);
    }
  }
}

export const importWorker = new ImportWorker();
