export interface ChessComProfile {
  username: string;
  player_id: number;
  url: string;
  name?: string;
  avatar?: string;
  title?: string;
  joined: number;
  status: string;
  country?: string;
}

export interface ChessComGamePlayer {
  rating: number;
  result: string;
  username: string;
}

export interface ChessComGame {
  url: string;
  pgn: string;
  time_control: string;
  end_time: number;
  rated: boolean;
  time_class: string;
  rules: string;
  white: ChessComGamePlayer;
  black: ChessComGamePlayer;
  eco?: string;
}

export interface ArchiveSummary {
  username: string;
  totalArchives: number;
  archives: string[];
  estimatedGames?: number;
}

const initialFetch = typeof globalThis.fetch === 'function' ? globalThis.fetch : undefined;

export class ChessComClient {
  private lastRequestTime: number = 0;
  private minIntervalMs: number = 350; // Respectful rate limiting: ~2.8 requests/sec max
  private userAgent: string = 'ChessLens/1.0 (contact: info@chesslens.local; chess analysis platform)';

  private async rateLimit(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    if (elapsed < this.minIntervalMs) {
      await new Promise(resolve => setTimeout(resolve, this.minIntervalMs - elapsed));
    }
    this.lastRequestTime = Date.now();
  }

  private async fetchWithRetry(url: string, retries: number = 3): Promise<any> {
    for (let attempt = 1; attempt <= retries; attempt++) {
      await this.rateLimit();

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 12000);

        // Ensure fetch function is valid
        let fetchFn = typeof globalThis.fetch === 'function' ? globalThis.fetch : initialFetch;
        if (typeof fetchFn !== 'function') {
          throw new Error('Global fetch was corrupted by third-party module');
        }

        const response = await fetchFn(url, {
          signal: controller.signal,
          headers: {
            'User-Agent': this.userAgent,
            'Accept': 'application/json'
          }
        });

        clearTimeout(timeoutId);

        if (response.status === 404) {
          throw new Error('NOT_FOUND');
        }

        if (response.status === 429) {
          const waitTime = Math.min(1000 * Math.pow(2, attempt), 8000);
          console.warn(`[ChessComClient] Rate limit 429 encountered for ${url}. Backing off for ${waitTime}ms...`);
          await new Promise(r => setTimeout(r, waitTime));
          continue;
        }

        if (!response.ok) {
          throw new Error(`Chess.com API HTTP error ${response.status}: ${response.statusText}`);
        }

        return await response.json();
      } catch (err: any) {
        console.warn(`[ChessComClient] Attempt ${attempt}/${retries} failed for ${url}:`, err.message);
        if (err.message === 'NOT_FOUND') {
          throw new Error(`Chess.com profile or resource not found: ${url}`);
        }
        if (attempt === retries) {
          throw new Error(`Chess.com API request failed after ${retries} attempts: ${err.message}`);
        }
        await new Promise(r => setTimeout(r, 1000 * attempt));
      }
    }
  }

  /**
   * Validates if a user profile exists on Chess.com
   */
  async getProfile(username: string): Promise<ChessComProfile> {
    const cleanUsername = username.trim().toLowerCase();
    const url = `https://api.chess.com/pub/player/${encodeURIComponent(cleanUsername)}`;
    return await this.fetchWithRetry(url);
  }

  /**
   * Retrieves list of monthly archives available for a user
   */
  async getArchives(username: string): Promise<string[]> {
    const cleanUsername = username.trim().toLowerCase();
    const url = `https://api.chess.com/pub/player/${encodeURIComponent(cleanUsername)}/games/archives`;
    const data = await this.fetchWithRetry(url);
    return data.archives || [];
  }

  /**
   * Fetches games for a specific monthly archive URL
   */
  async getGamesForArchive(archiveUrl: string): Promise<ChessComGame[]> {
    const data = await this.fetchWithRetry(archiveUrl);
    return data.games || [];
  }

  /**
   * Discovers total archives and basic game count breakdown
   */
  async discoverArchives(username: string): Promise<ArchiveSummary> {
    // 1. Check profile exists
    await this.getProfile(username);

    // 2. Fetch archives
    const archives = await this.getArchives(username);

    return {
      username,
      totalArchives: archives.length,
      archives
    };
  }

  /**
   * Helper to parse PGN headers into structured values
   */
  parsePgnHeaders(pgn: string): { eco?: string; opening?: string; result?: string } {
    const ecoMatch = pgn.match(/\[ECO\s+"([^"]+)"\]/);
    const eco = ecoMatch ? ecoMatch[1] : undefined;

    const openingMatch = pgn.match(/\[ECOUrl\s+"https?:\/\/[^/]+\/openings\/([^"]+)"\]/);
    let opening: string | undefined = undefined;
    if (openingMatch) {
      opening = openingMatch[1].replace(/-/g, ' ');
    } else {
      const altMatch = pgn.match(/\[Opening\s+"([^"]+)"\]/);
      if (altMatch) opening = altMatch[1];
    }

    const resultMatch = pgn.match(/\[Result\s+"([^"]+)"\]/);
    const result = resultMatch ? resultMatch[1] : undefined;

    return { eco, opening, result };
  }

  /**
   * Extracts external game ID from Chess.com game URL
   */
  extractGameId(gameUrl: string): string {
    const match = gameUrl.match(/\/game\/(live|daily)\/(\d+)/);
    if (match) {
      return `${match[1]}_${match[2]}`;
    }
    return gameUrl;
  }

  /**
   * Validates and normalizes user-provided Chess.com game URLs (SSRF-safe)
   */
  validateAndParseChessComUrl(rawUrl: string): { gameType: 'live' | 'daily'; gameId: string; normalizedUrl: string } {
    if (!rawUrl || typeof rawUrl !== 'string') {
      throw new Error('Please enter a valid public Chess.com game URL.');
    }

    const trimmed = rawUrl.trim();
    let parsed: URL;
    try {
      parsed = new URL(trimmed);
    } catch {
      throw new Error('Please enter a valid public Chess.com game URL.');
    }

    // Protocol check
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      throw new Error('Please enter a valid public Chess.com game URL.');
    }

    // Host check: only allow official Chess.com domains
    const host = parsed.hostname.toLowerCase();
    if (host !== 'chess.com' && host !== 'www.chess.com') {
      throw new Error('Please enter a valid public Chess.com game URL.');
    }

    // Disallow credentials in URL
    if (parsed.username || parsed.password) {
      throw new Error('Invalid Chess.com game URL.');
    }

    // Path extraction: supported formats:
    // /game/live/:id, /game/daily/:id, /live/game/:id, /analysis/game/live/:id, /game/:id
    const path = parsed.pathname;
    let gameType: 'live' | 'daily' = 'live';
    let gameId: string | null = null;

    const liveMatch = path.match(/\/(?:analysis\/)?game\/live\/(\d+)/i) || path.match(/\/live\/game\/(\d+)/i);
    const dailyMatch = path.match(/\/game\/daily\/(\d+)/i);
    const genericMatch = path.match(/\/game\/(\d+)/i);

    if (liveMatch) {
      gameType = 'live';
      gameId = liveMatch[1];
    } else if (dailyMatch) {
      gameType = 'daily';
      gameId = dailyMatch[1];
    } else if (genericMatch) {
      gameType = 'live';
      gameId = genericMatch[1];
    }

    if (!gameId) {
      throw new Error('Unsupported or unrecognized Chess.com game URL format.');
    }

    return {
      gameType,
      gameId,
      normalizedUrl: `https://www.chess.com/game/${gameType}/${gameId}`
    };
  }

  /**
   * Resolves a public Chess.com game into a normalized game object with PGN
   */
  async fetchGameFromPublicUrl(rawUrl: string): Promise<{
    pgn: string;
    gameId: string;
    gameType: 'live' | 'daily';
    normalizedUrl: string;
    whitePlayer: string;
    blackPlayer: string;
    whiteRating?: number;
    blackRating?: number;
    result: string;
    playedAt: string;
    timeControl?: string;
    timeClass?: string;
    eco?: string;
    opening?: string;
  }> {
    const { gameType, gameId, normalizedUrl } = this.validateAndParseChessComUrl(rawUrl);

    // 1. Fetch public callback endpoint
    const callbackUrl = `https://www.chess.com/callback/${gameType}/game/${gameId}`;
    let callbackData: any = null;

    try {
      callbackData = await this.fetchWithRetry(callbackUrl);
    } catch (err: any) {
      if (err.message && err.message.includes('not found')) {
        throw new Error('Game not found or no longer publicly available.');
      }
      if (err.message && err.message.includes('429')) {
        throw new Error('Chess.com data is temporarily unavailable. Please try again later.');
      }
      throw new Error('This Chess.com game cannot be retrieved automatically. Please paste or upload its PGN.');
    }

    if (!callbackData || !callbackData.game) {
      throw new Error('Game not found or no longer publicly available.');
    }

    const gameObj = callbackData.game;
    if (gameObj.isFinished === false || gameObj.status === 'in_progress' || gameObj.status === 'active') {
      throw new Error('This game is still in progress. Analysis requires a completed game.');
    }
    const pgnHeaders = gameObj.pgnHeaders || {};

    const whitePlayer = pgnHeaders.White || callbackData.players?.bottom?.username || callbackData.players?.white?.username || 'White';
    const blackPlayer = pgnHeaders.Black || callbackData.players?.top?.username || callbackData.players?.black?.username || 'Black';
    const result = pgnHeaders.Result || (gameObj.colorOfWinner === 'white' ? '1-0' : gameObj.colorOfWinner === 'black' ? '0-1' : '1/2-1/2');
    const eco = pgnHeaders.ECO || undefined;
    const timeControl = pgnHeaders.TimeControl || (gameObj.timeControl ? String(gameObj.timeControl) : undefined);
    const timeClass = gameObj.timeClass || gameType;
    const whiteRating = pgnHeaders.WhiteElo ? parseInt(pgnHeaders.WhiteElo, 10) : callbackData.players?.bottom?.rating;
    const blackRating = pgnHeaders.BlackElo ? parseInt(pgnHeaders.BlackElo, 10) : callbackData.players?.top?.rating;
    const playedAt = pgnHeaders.Date ? new Date(pgnHeaders.Date.replace(/\./g, '-')).toISOString() : new Date().toISOString();

    // 2. Obtain complete PGN text
    let pgn: string | null = gameObj.pgn || null;

    // If PGN is not directly in callback, resolve via monthly archive
    if (!pgn && pgnHeaders.Date && whitePlayer) {
      const [year, month] = pgnHeaders.Date.split('.');
      if (year && month) {
        try {
          const archiveUrl = `https://api.chess.com/pub/player/${encodeURIComponent(whitePlayer.toLowerCase())}/games/${year}/${month.padStart(2, '0')}`;
          const archiveData = await this.fetchWithRetry(archiveUrl, 2);
          const found = (archiveData.games || []).find((g: any) =>
            g.url?.includes(gameId) || (g.uuid && g.uuid === gameObj.uuid)
          );
          if (found?.pgn) {
            pgn = found.pgn;
          }
        } catch (archiveErr) {
          console.warn('[ChessComClient] White archive lookup failed, trying Black...', archiveErr);
        }

        if (!pgn && blackPlayer) {
          try {
            const archiveUrl = `https://api.chess.com/pub/player/${encodeURIComponent(blackPlayer.toLowerCase())}/games/${year}/${month.padStart(2, '0')}`;
            const archiveData = await this.fetchWithRetry(archiveUrl, 2);
            const found = (archiveData.games || []).find((g: any) =>
              g.url?.includes(gameId) || (g.uuid && g.uuid === gameObj.uuid)
            );
            if (found?.pgn) {
              pgn = found.pgn;
            }
          } catch {
            // Non-blocking
          }
        }
      }
    }

    if (!pgn) {
      throw new Error('This Chess.com game cannot be retrieved automatically. Please paste or upload its PGN.');
    }

    const { opening } = this.parsePgnHeaders(pgn);

    return {
      pgn,
      gameId,
      gameType,
      normalizedUrl,
      whitePlayer,
      blackPlayer,
      whiteRating,
      blackRating,
      result,
      playedAt,
      timeControl,
      timeClass,
      eco,
      opening: opening || pgnHeaders.Opening
    };
  }
}

export const chessComClient = new ChessComClient();
