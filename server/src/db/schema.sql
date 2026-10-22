CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT DEFAULT '',
    auth_provider TEXT DEFAULT 'local',
    avatar TEXT,
    google_id TEXT,
    chesscom_username TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_provider TEXT DEFAULT 'local';
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS chesscom_username TEXT;

CREATE TABLE IF NOT EXISTS chess_accounts (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    platform TEXT NOT NULL DEFAULT 'chess.com',
    chess_username TEXT NOT NULL,
    connected_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_sync_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT uq_user_platform_account UNIQUE (user_id, platform, chess_username)
);

CREATE TABLE IF NOT EXISTS games (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    external_game_id TEXT,
    platform TEXT NOT NULL DEFAULT 'chess.com',
    white_player TEXT NOT NULL,
    black_player TEXT NOT NULL,
    white_rating INTEGER,
    black_rating INTEGER,
    result TEXT NOT NULL,
    played_at TIMESTAMP WITH TIME ZONE NOT NULL,
    time_control TEXT,
    time_class TEXT,
    rated BOOLEAN DEFAULT true,
    opening TEXT,
    eco TEXT,
    pgn TEXT NOT NULL,
    imported_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    analysis_status TEXT NOT NULL DEFAULT 'not_analyzed',
    CONSTRAINT uq_user_platform_game UNIQUE (user_id, platform, external_game_id)
);

ALTER TABLE games ADD COLUMN IF NOT EXISTS original_url TEXT;

CREATE TABLE IF NOT EXISTS game_analysis (
    id TEXT PRIMARY KEY,
    game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE UNIQUE,
    engine_name TEXT NOT NULL,
    engine_version TEXT NOT NULL,
    analysis_depth INTEGER NOT NULL,
    analyzed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    accuracy_white NUMERIC(5, 2) NOT NULL,
    accuracy_black NUMERIC(5, 2) NOT NULL,
    blunders_white INTEGER NOT NULL DEFAULT 0,
    mistakes_white INTEGER NOT NULL DEFAULT 0,
    inaccuracies_white INTEGER NOT NULL DEFAULT 0,
    blunders_black INTEGER NOT NULL DEFAULT 0,
    mistakes_black INTEGER NOT NULL DEFAULT 0,
    inaccuracies_black INTEGER NOT NULL DEFAULT 0,
    summary JSONB
);

CREATE TABLE IF NOT EXISTS move_analysis (
    id TEXT PRIMARY KEY,
    game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    move_number INTEGER NOT NULL,
    ply INTEGER NOT NULL,
    color TEXT NOT NULL,
    played_move TEXT NOT NULL,
    played_move_san TEXT,
    best_move TEXT NOT NULL,
    best_move_san TEXT,
    fen TEXT NOT NULL,
    evaluation_before NUMERIC(7, 2),
    evaluation_after NUMERIC(7, 2),
    centipawn_loss NUMERIC(7, 2) NOT NULL,
    win_prob_before NUMERIC(5, 4),
    win_prob_after NUMERIC(5, 4),
    classification TEXT NOT NULL,
    principal_variation TEXT,
    explanation TEXT
);

CREATE TABLE IF NOT EXISTS import_jobs (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    chess_username TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued',
    total_archives INTEGER DEFAULT 0,
    processed_archives INTEGER DEFAULT 0,
    total_games INTEGER DEFAULT 0,
    imported_count INTEGER DEFAULT 0,
    skipped_duplicates INTEGER DEFAULT 0,
    errors INTEGER DEFAULT 0,
    error_log JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Required Indexes
CREATE INDEX IF NOT EXISTS idx_games_user_id ON games(user_id);
CREATE INDEX IF NOT EXISTS idx_games_played_at ON games(played_at);
CREATE INDEX IF NOT EXISTS idx_games_external_id ON games(external_game_id);
CREATE INDEX IF NOT EXISTS idx_games_platform ON games(platform);
CREATE INDEX IF NOT EXISTS idx_games_analysis_status ON games(analysis_status);

CREATE INDEX IF NOT EXISTS idx_chess_accounts_user_id ON chess_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_chess_accounts_platform ON chess_accounts(platform);

CREATE INDEX IF NOT EXISTS idx_game_analysis_game_id ON game_analysis(game_id);

CREATE INDEX IF NOT EXISTS idx_move_analysis_game_id ON move_analysis(game_id);
CREATE INDEX IF NOT EXISTS idx_move_analysis_ply ON move_analysis(game_id, ply);

CREATE INDEX IF NOT EXISTS idx_import_jobs_user_id ON import_jobs(user_id);

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
);

CREATE INDEX IF NOT EXISTS idx_saved_positions_user_id ON saved_positions(user_id);
CREATE INDEX IF NOT EXISTS idx_saved_positions_created_at ON saved_positions(created_at);
