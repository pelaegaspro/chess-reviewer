import { initializeApp, cert, getApps, App } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { getAuth, Auth } from 'firebase-admin/auth';
import fs from 'node:fs';

export interface FirebaseUser {
  id: string;
  email: string;
  username: string;
  password_hash?: string;
  avatar?: string;
  title?: string;
  auth_provider?: 'local' | 'google' | 'chesscom';
  google_id?: string;
  chesscom_username?: string;
  created_at: string;
  updated_at: string;
}

export interface FirebaseChessAccount {
  id: string;
  user_id: string;
  platform: string;
  username: string;
  profile_url?: string;
  avatar_url?: string;
  title?: string;
  country?: string;
  rating_bullet?: number;
  rating_blitz?: number;
  rating_rapid?: number;
  last_synced_at?: string;
  created_at: string;
}

export interface FirebaseGame {
  id: string;
  user_id: string;
  external_game_id?: string;
  platform: string;
  white_player: string;
  black_player: string;
  white_rating?: number;
  black_rating?: number;
  result: string;
  played_at: string;
  time_control?: string;
  time_class?: string;
  rated: boolean;
  opening?: string;
  eco?: string;
  pgn: string;
  imported_at: string;
  analysis_status: 'not_analyzed' | 'queued' | 'analyzing' | 'analyzed' | 'failed';
  accuracy_white?: number;
  accuracy_black?: number;
  blunders_white?: number;
  mistakes_white?: number;
  inaccuracies_white?: number;
  blunders_black?: number;
  mistakes_black?: number;
  inaccuracies_black?: number;
}

export interface FirebaseGameAnalysis {
  id: string;
  game_id: string;
  engine_name: string;
  engine_version: string;
  analysis_depth: number;
  analyzed_at: string;
  accuracy_white: number;
  accuracy_black: number;
  blunders_white: number;
  mistakes_white: number;
  inaccuracies_white: number;
  blunders_black: number;
  mistakes_black: number;
  inaccuracies_black: number;
}

export interface FirebaseMoveAnalysis {
  id: string;
  game_id: string;
  ply: number;
  fen_before: string;
  fen_after: string;
  played_move: string;
  played_move_san?: string;
  best_move: string;
  best_move_san?: string;
  evaluation_before: number;
  evaluation_after: number;
  evaluation_loss: number;
  classification: string;
  win_prob_before: number;
  win_prob_after: number;
  win_prob_loss: number;
  explanation?: string;
  coach_commentary?: string;
}

export interface FirebaseImportJob {
  id: string;
  user_id: string;
  platform: string;
  chess_username: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  total_archives: number;
  processed_archives: number;
  total_games: number;
  imported_count: number;
  skipped_duplicates: number;
  errors: number;
  error_log: Array<{ message: string; timestamp: string }>;
  created_at: string;
  updated_at: string;
}

class FirebaseService {
  private app: App | null = null;
  private dbInstance: Firestore | null = null;
  private authInstance: Auth | null = null;
  private connected: boolean = false;
  private projectId: string = 'cheens-7a24e';

  async init(): Promise<void> {
    try {
      this.projectId = process.env.FIREBASE_PROJECT_ID || 'cheens-7a24e';

      if (getApps().length === 0) {
        let credentialOption: any = undefined;

        // 1. Check for JSON service account file path
        if (process.env.GOOGLE_APPLICATION_CREDENTIALS && fs.existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS)) {
          credentialOption = cert(process.env.GOOGLE_APPLICATION_CREDENTIALS);
        } else if (process.env.FIREBASE_SERVICE_ACCOUNT) {
          // 2. Check for inline JSON string
          try {
            const parsed = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
            credentialOption = cert(parsed);
          } catch {
            // Invalid JSON format, continue with project ID
          }
        }

        this.app = initializeApp({
          projectId: this.projectId,
          ...(credentialOption ? { credential: credentialOption } : {})
        });
      } else {
        this.app = getApps()[0];
      }

      this.dbInstance = getFirestore(this.app);
      try {
        this.authInstance = getAuth(this.app);
      } catch (authErr: any) {
        console.warn(`[Firebase Auth] Auth instance warning: ${authErr.message}`);
      }
      this.connected = true;
      console.log(`[Firebase] Initialized successfully with project: ${this.projectId}`);
    } catch (err: any) {
      this.connected = false;
      this.dbInstance = null;
      this.authInstance = null;
      console.warn(`[Firebase] Initialization notice: ${err.message} (operating in resilient local fallback)`);
    }
  }

  public isConnected(): boolean {
    return this.connected && this.dbInstance !== null;
  }

  public get auth(): Auth {
    if (!this.authInstance) {
      throw new Error('Firebase Auth not initialized');
    }
    return this.authInstance;
  }

  public async verifyIdToken(token: string) {
    if (!this.authInstance) return null;
    try {
      return await this.authInstance.verifyIdToken(token);
    } catch {
      return null;
    }
  }

  public get db(): Firestore {
    if (!this.dbInstance) {
      throw new Error('Firestore not initialized or offline');
    }
    return this.dbInstance;
  }

  // Typed collections
  public get users() {
    return this.db.collection('users');
  }

  public get chessAccounts() {
    return this.db.collection('chess_accounts');
  }

  public get games() {
    return this.db.collection('games');
  }

  public get gameAnalysis() {
    return this.db.collection('game_analysis');
  }

  public get moveAnalysis() {
    return this.db.collection('move_analysis');
  }

  public get importJobs() {
    return this.db.collection('import_jobs');
  }

  // Safe synchronization helpers
  public async syncUser(user: Partial<FirebaseUser> & { id: string }): Promise<void> {
    if (!this.isConnected() || !this.dbInstance) return;
    try {
      await this.users.doc(user.id).set(
        {
          ...user,
          updated_at: new Date().toISOString()
        },
        { merge: true }
      ).catch((err: any) => {
        if (err.message && err.message.includes('default credentials')) {
          this.connected = false;
        }
        console.warn('[Firebase Sync User Notice]:', err.message);
      });
    } catch (err: any) {
      if (err.message && err.message.includes('default credentials')) {
        this.connected = false;
      }
      console.warn('[Firebase Sync User Notice]:', err.message);
    }
  }

  public async syncChessAccount(account: Partial<FirebaseChessAccount> & { id: string }): Promise<void> {
    if (!this.isConnected() || !this.dbInstance) return;
    try {
      await this.chessAccounts.doc(account.id).set(
        {
          ...account,
          last_synced_at: new Date().toISOString()
        },
        { merge: true }
      ).catch((err: any) => {
        if (err.message && err.message.includes('default credentials')) {
          this.connected = false;
        }
        console.warn('[Firebase Sync ChessAccount Notice]:', err.message);
      });
    } catch (err: any) {
      if (err.message && err.message.includes('default credentials')) {
        this.connected = false;
      }
      console.warn('[Firebase Sync ChessAccount Notice]:', err.message);
    }
  }

  public async syncGame(game: Partial<FirebaseGame> & { id: string }): Promise<void> {
    if (!this.isConnected() || !this.dbInstance) return;
    try {
      await this.games.doc(game.id).set(game, { merge: true }).catch((err: any) => {
        if (err.message && err.message.includes('default credentials')) {
          this.connected = false;
        }
        console.warn('[Firebase Sync Game Notice]:', err.message);
      });
    } catch (err: any) {
      if (err.message && err.message.includes('default credentials')) {
        this.connected = false;
      }
      console.warn('[Firebase Sync Game Notice]:', err.message);
    }
  }
}

export const firebaseService = new FirebaseService();
