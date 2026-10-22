import { 
  User, Game, FullReviewData, ImportJob, PlayerStats, PositionAnalysisResult,
  CompareMovesResult, WhatIfResult, SavedPosition, MistakeItem, MistakePattern, ExplanationLevel
} from '../types';

const API_BASE = '/api';

function getHeaders(): HeadersInit {
  const token = localStorage.getItem('aether_token');
  const headers: HeadersInit = {
    'Content-Type': 'application/json'
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

export const api = {
  // Auth
  async register(email: string, username: string, password: string): Promise<{ user: User; token: string }> {
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, username, password })
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Registration failed');
    }
    const data = await res.json();
    localStorage.setItem('aether_token', data.token);
    return data;
  },

  async login(identifier: string, password: string): Promise<{ user: User; token: string }> {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier, password })
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Login failed');
    }
    const data = await res.json();
    localStorage.setItem('aether_token', data.token);
    return data;
  },

  async loginWithGoogle(credential?: string, profile?: any): Promise<{ user: User; token: string }> {
    const res = await fetch(`${API_BASE}/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential, profile })
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Google sign-in failed');
    }
    const data = await res.json();
    localStorage.setItem('aether_token', data.token);
    return data;
  },

  async loginWithFirebase(payload: {
    idToken: string;
    email?: string;
    displayName?: string;
    photoURL?: string;
    uid?: string;
  }): Promise<{ user: User; token: string }> {
    const res = await fetch(`${API_BASE}/auth/firebase`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Firebase login failed');
    }
    const data = await res.json();
    localStorage.setItem('aether_token', data.token);
    return data;
  },

  async loginWithChessCom(username: string): Promise<{ user: User; token: string; profile?: any }> {
    const res = await fetch(`${API_BASE}/auth/chesscom`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username })
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Chess.com login failed');
    }
    const data = await res.json();
    localStorage.setItem('aether_token', data.token);
    return data;
  },

  async getMe(): Promise<User | null> {
    const token = localStorage.getItem('aether_token');
    if (!token) return null;

    try {
      const res = await fetch(`${API_BASE}/auth/me`, { headers: getHeaders() });
      if (!res.ok) return null;
      const data = await res.json();
      return data.user;
    } catch {
      return null;
    }
  },

  logout(): void {
    localStorage.removeItem('aether_token');
  },

  // Chess.com Public API
  async getChessComProfile(username: string): Promise<any> {
    const res = await fetch(`${API_BASE}/chesscom/profile/${encodeURIComponent(username)}`);
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to fetch profile');
    }
    return res.json();
  },

  async getChessComArchives(username: string): Promise<any> {
    const res = await fetch(`${API_BASE}/chesscom/archives/${encodeURIComponent(username)}`);
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to fetch archives');
    }
    return res.json();
  },

  async startImport(username: string, maxArchives?: number): Promise<{ jobId: string }> {
    const res = await fetch(`${API_BASE}/chesscom/import`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ username, maxArchives })
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to start import');
    }
    return res.json();
  },

  async getImportJob(jobId: string): Promise<ImportJob> {
    const res = await fetch(`${API_BASE}/chesscom/import-job/${jobId}`, {
      headers: getHeaders()
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to get job status');
    }
    return res.json();
  },

  async getConnectedAccounts(): Promise<Array<{ id: string; platform: string; chess_username: string; connected_at: string; last_sync_at: string }>> {
    const res = await fetch(`${API_BASE}/chesscom/accounts`, {
      headers: getHeaders()
    });
    if (!res.ok) return [];
    return res.json();
  },

  async connectChessAccount(username: string): Promise<{ success: boolean; chess_username: string; profile?: any }> {
    const clean = username.trim().toLowerCase();
    localStorage.setItem('aether_connected_chesscom', clean);
    const token = localStorage.getItem('aether_token');
    if (!token) {
      // Auto-provision / login directly via Chess.com identity
      const loginRes = await this.loginWithChessCom(clean);
      return { success: true, chess_username: loginRes.user.username, profile: loginRes.profile };
    }
    const res = await fetch(`${API_BASE}/chesscom/accounts/connect`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ username: clean })
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to connect Chess.com account');
    }
    return res.json();
  },

  async disconnectChessAccount(username: string): Promise<{ success: boolean }> {
    localStorage.removeItem('aether_connected_chesscom');
    const res = await fetch(`${API_BASE}/chesscom/accounts/${encodeURIComponent(username)}`, {
      method: 'DELETE',
      headers: getHeaders()
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to disconnect account' }));
      throw new Error(err.error || 'Failed to disconnect Chess.com account');
    }
    return res.json();
  },

  getStoredChessComUsername(): string | null {
    return localStorage.getItem('aether_connected_chesscom');
  },

  // Games
  async getGames(params: {
    result?: string;
    timeClass?: string;
    opponent?: string;
    status?: string;
    page?: number;
    limit?: number;
  }): Promise<{ games: Game[]; pagination: { page: number; limit: number; total: number; totalPages: number } }> {
    const query = new URLSearchParams();
    if (params.result) query.set('result', params.result);
    if (params.timeClass) query.set('timeClass', params.timeClass);
    if (params.opponent) query.set('opponent', params.opponent);
    if (params.status) query.set('status', params.status);
    if (params.page) query.set('page', params.page.toString());
    if (params.limit) query.set('limit', params.limit.toString());

    const res = await fetch(`${API_BASE}/games?${query.toString()}`, { headers: getHeaders() });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to fetch games');
    }
    return res.json();
  },

  async importPgn(pgn: string, title?: string): Promise<{ id: string }> {
    const res = await fetch(`${API_BASE}/games/import-pgn`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ pgn, title })
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to import PGN');
    }
    return res.json();
  },

  async reviewFromChessComUrl(
    url: string,
    forceReanalyze: boolean = false
  ): Promise<{
    gameId: string;
    isExisting?: boolean;
    isAnalyzed?: boolean;
    reanalyzing?: boolean;
    message?: string;
  }> {
    const res = await fetch(`${API_BASE}/games/from-chesscom`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ url, forceReanalyze })
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to review Chess.com game');
    }
    return res.json();
  },

  async queueAnalysis(gameId: string, depth: number = 10, force: boolean = false): Promise<void> {
    const res = await fetch(`${API_BASE}/games/${gameId}/analyze`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ depth, force })
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to queue analysis');
    }
  },

  async getAnalysisProgress(gameId: string): Promise<any> {
    const res = await fetch(`${API_BASE}/games/${gameId}/analysis-progress`, { headers: getHeaders() });
    if (!res.ok) return null;
    return res.json();
  },

  async getGameReview(gameId: string): Promise<FullReviewData> {
    const res = await fetch(`${API_BASE}/games/${gameId}/review`, { headers: getHeaders() });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to fetch game review');
    }
    return res.json();
  },

  async deleteGame(gameId: string): Promise<void> {
    const res = await fetch(`${API_BASE}/games/${gameId}`, {
      method: 'DELETE',
      headers: getHeaders()
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to delete game');
    }
  },

  // Insights
  async getInsights(): Promise<PlayerStats> {
    const res = await fetch(`${API_BASE}/insights`, { headers: getHeaders() });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to fetch insights');
    }
    return res.json();
  },

  // Chess Helper - Single Position Analysis
  async analyzePosition(
    fen: string,
    depth: number = 20,
    multiPv: number = 3,
    signal?: AbortSignal
  ): Promise<PositionAnalysisResult> {
    const res = await fetch(`${API_BASE}/engine/analyze-position`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ fen, depth, multiPv }),
      signal
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Analysis request failed' }));
      throw new Error(err.error || 'Position analysis failed');
    }

    return res.json();
  },

  async cancelPositionAnalysis(): Promise<void> {
    try {
      await fetch(`${API_BASE}/engine/cancel`, {
        method: 'POST',
        headers: getHeaders()
      });
    } catch {
      // Ignore cancellation failures
    }
  },

  // ── Engine Differentiation: Compare Moves ──
  async compareMoves(
    arg: string | { fen: string; moves?: string[]; depth?: number; level?: ExplanationLevel },
    depth: number = 20,
    level: ExplanationLevel = 'intermediate'
  ): Promise<CompareMovesResult> {
    const payload = typeof arg === 'string'
      ? { fen: arg, depth, level }
      : { fen: arg.fen, moves: arg.moves, depth: arg.depth ?? depth, level: arg.level ?? level };

    const res = await fetch(`${API_BASE}/engine/compare-moves`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Compare moves failed' }));
      throw new Error(err.error || 'Failed to compare moves');
    }
    return res.json();
  },

  // ── Engine Differentiation: What If? ──
  async analyzeWhatIf(
    arg: string | { fen: string; alternativeMove?: string; move?: string; depth?: number },
    move?: string,
    depth: number = 18
  ): Promise<WhatIfResult> {
    const payload = typeof arg === 'string'
      ? { fen: arg, move, depth }
      : { fen: arg.fen, move: arg.move || arg.alternativeMove, depth: arg.depth ?? depth };

    const res = await fetch(`${API_BASE}/engine/what-if`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'What If analysis failed' }));
      throw new Error(err.error || 'What If analysis failed');
    }
    return res.json();
  },

  // ── Explanation Layer: Tailored Depth ──
  async explainMove(params: {
    fen?: string;
    fenBefore?: string;
    fenAfter?: string;
    playedMove?: string;
    playedMoveUci?: string;
    playedMoveSan?: string;
    bestMove?: string;
    bestMoveUci?: string;
    bestMoveSan?: string;
    classification?: string;
    centipawnLoss?: number;
    evalBeforeCp?: number;
    evalAfterCp?: number;
    evalCp?: number;
    evalAfterMate?: number;
    pv?: string[];
    moveNumber?: number;
    color?: 'w' | 'b';
    level?: ExplanationLevel;
  }): Promise<{ explanation: string; level: ExplanationLevel }> {
    const body = {
      ...params,
      fenBefore: params.fenBefore || params.fen || '',
      playedMoveSan: params.playedMoveSan || params.playedMove || '',
      bestMoveSan: params.bestMoveSan || params.bestMove || '',
      evalAfterCp: params.evalAfterCp !== undefined ? params.evalAfterCp : (params.evalCp || 0)
    };
    const res = await fetch(`${API_BASE}/engine/explain-move`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Explain move failed' }));
      throw new Error(err.error || 'Failed to generate explanation');
    }
    return res.json();
  },

  // ── Mistakes & Practice ──
  async getMistakeCollection(params?: {
    category?: string;
    phase?: string;
    page?: number;
    limit?: number;
  }): Promise<{ mistakes: MistakeItem[]; total: number; page: number }> {
    const query = new URLSearchParams();
    if (params?.category) query.set('category', params.category);
    if (params?.phase) query.set('phase', params.phase);
    if (params?.page) query.set('page', params.page.toString());
    if (params?.limit) query.set('limit', params.limit.toString());

    const res = await fetch(`${API_BASE}/mistakes/collection?${query.toString()}`, {
      headers: getHeaders()
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to fetch mistakes' }));
      throw new Error(err.error || 'Failed to fetch mistakes');
    }
    return res.json();
  },

  async getMistakePatterns(): Promise<{ totalGamesAnalyzed: number; patterns: MistakePattern[] }> {
    const res = await fetch(`${API_BASE}/mistakes/patterns`, {
      headers: getHeaders()
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to fetch patterns' }));
      throw new Error(err.error || 'Failed to fetch patterns');
    }
    return res.json();
  },

  // ── Saved Positions & Sharing ──
  async getSavedPositions(): Promise<SavedPosition[]> {
    const res = await fetch(`${API_BASE}/saved-positions`, {
      headers: getHeaders()
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to fetch saved positions' }));
      throw new Error(err.error || 'Failed to fetch saved positions');
    }
    return res.json();
  },

  async savePosition(data: {
    fen: string;
    title: string;
    notes?: string;
    sourceGameId?: string;
    game_id?: string;
    move_number?: number;
    played_move?: string;
    bestMove?: string;
    best_move?: string;
    bestMoveSan?: string;
    best_move_san?: string;
    evaluation?: string | number;
    sideToMove?: string;
    isPublic?: boolean;
    tags?: string[];
  }): Promise<SavedPosition> {
    const payload = {
      ...data,
      sourceGameId: data.sourceGameId || data.game_id,
      bestMove: data.bestMove || data.best_move,
      bestMoveSan: data.bestMoveSan || data.best_move_san,
      evaluation: data.evaluation !== undefined ? String(data.evaluation) : undefined
    };

    const res = await fetch(`${API_BASE}/saved-positions`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to save position' }));
      throw new Error(err.error || 'Failed to save position');
    }
    return res.json();
  },

  async deleteSavedPosition(id: string): Promise<void> {
    const res = await fetch(`${API_BASE}/saved-positions/${id}`, {
      method: 'DELETE',
      headers: getHeaders()
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to delete position' }));
      throw new Error(err.error || 'Failed to delete position');
    }
  },

  async getPublicSharedPosition(id: string): Promise<SavedPosition> {
    const res = await fetch(`${API_BASE}/saved-positions/public/${id}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Position not found' }));
      throw new Error(err.error || 'Position not found');
    }
    return res.json();
  }
};
