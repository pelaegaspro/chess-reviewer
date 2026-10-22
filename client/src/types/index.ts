export type MoveClassification =
  | 'brilliant'
  | 'great'
  | 'best'
  | 'excellent'
  | 'good'
  | 'book'
  | 'inaccuracy'
  | 'mistake'
  | 'missed_win'
  | 'blunder';

export interface User {
  id: string;
  email: string;
  username: string;
  avatar?: string;
  title?: string;
  auth_provider?: 'local' | 'google' | 'chesscom';
}

export interface Game {
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
  original_url?: string;
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

export interface GameAnalysis {
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
  summary: {
    engine: string;
    depth: number;
    analyzedAt: string;
    whiteAccuracy: number;
    blackAccuracy: number;
    stats: {
      white: { blunders: number; mistakes: number; inaccuracies: number };
      black: { blunders: number; mistakes: number; inaccuracies: number };
    };
    criticalMoments: Array<{
      moveNumber: number;
      ply: number;
      color: 'w' | 'b';
      playedMoveSan: string;
      bestMoveSan: string;
      classification: MoveClassification;
      centipawnLoss: number;
      explanation: string;
      fen: string;
    }>;
  };
}

export interface MoveAnalysis {
  id: string;
  game_id: string;
  move_number: number;
  ply: number;
  color: 'w' | 'b';
  played_move: string;
  played_move_san: string;
  best_move: string;
  best_move_san: string;
  fen: string;
  evaluation_before: number;
  evaluation_after: number;
  centipawn_loss: number;
  win_prob_before: number;
  win_prob_after: number;
  classification: MoveClassification;
  principal_variation: string;
  explanation: string;
}

export interface FullReviewData {
  game: Game;
  analysis: GameAnalysis | null;
  moves: MoveAnalysis[];
  userColor?: 'white' | 'black';
}

export interface ImportJob {
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

export interface InsightPattern {
  id: string;
  title: string;
  category: 'tactics' | 'opening' | 'endgame' | 'discipline';
  description: string;
  statistic: string;
  sampleSize: number;
  confidence: 'High' | 'Moderate' | 'Preliminary';
  impactLevel: 'Critical' | 'Warning' | 'Positive';
  representativeGameIds: string[];
}

export interface PlayerStats {
  totalImported: number;
  totalAnalyzed: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
  averageAccuracy: number;
  phaseAccuracies: {
    opening: number;
    middlegame: number;
    endgame: number;
  };
  openings: Array<{
    eco: string;
    name: string;
    gamesCount: number;
    winRate: number;
    avgAccuracy: number;
  }>;
  insights: InsightPattern[];
}

export interface CandidateMove {
  rank: number;
  move: string;
  san: string;
  scoreCp: number;
  scoreMate?: number;
  depth: number;
  pv: string[];
  pvSan: string[];
}

export interface PositionAnalysisResult {
  fen: string;
  bestMove: string;
  bestMoveSan: string;
  evaluation: {
    scoreCp: number;
    scoreMate?: number;
    depth: number;
    sideToMove: 'w' | 'b';
    text: string;
  };
  topMoves: CandidateMove[];
  bestLine: {
    uci: string[];
    san: string[];
  };
  depth: number;
  engineName: string;
  explanation?: string;
}

export type ExplanationLevel = 'beginner' | 'intermediate' | 'advanced';

export interface CompareMovesResult {
  fen: string;
  depth: number;
  moves: CandidateMove[];
  bestMove: string;
  bestMoveSan: string;
  comparison: {
    summary: string;
    whyAIsStronger: string;
    evalDelta: number;
  } | null;
  message?: string;
}

export interface WhatIfResult {
  originalFen: string;
  resultingFen: string;
  userMove: {
    san: string;
    uci: string;
  };
  baseline: {
    bestMoveSan: string;
    bestMoveUci: string;
    scoreCp: number;
    scoreMate?: number;
    depth: number;
  };
  whatIf: {
    scoreCp: number;
    scoreMate?: number;
    bestOpponentReply: string;
    continuationSan: string[];
    depth: number;
  };
  evalDifferenceCp: number;
  evalDifferencePawns: number;
  explanation: string;
}

export interface SavedPosition {
  id: string;
  fen: string;
  title: string;
  notes?: string;
  source_game_id?: string;
  best_move?: string;
  best_move_san?: string;
  evaluation?: string;
  side_to_move?: 'w' | 'b';
  is_public?: boolean;
  created_at: string;
}

export interface MistakeItem {
  id: string;
  gameId: string;
  opponentName: string;
  playedAt: string;
  moveNumber: number;
  ply: number;
  userColor: 'w' | 'b';
  playedMoveSan: string;
  bestMoveSan: string;
  fen: string;
  evalBefore: number;
  evalAfter: number;
  centipawnLoss: number;
  evalSwingPawns: string;
  classification: MoveClassification;
  explanation: string;
  phase: 'opening' | 'middlegame' | 'endgame';
  isTactical: boolean;
}

export interface MistakePattern {
  id: string;
  name: string;
  description: string;
  gameCount: number;
  totalGamesSampled: number;
  frequencyPct: number;
  avgEvalDropPawns: string;
  examples: Array<{
    gameId: string;
    moveNumber: number;
    fen: string;
    playedMoveSan: string;
    bestMoveSan: string;
    classification: string;
    opponent: string;
    playedAt: string;
  }>;
}

