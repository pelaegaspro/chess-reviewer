import path from 'node:path';
import fs from 'node:fs';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { initDb } from './db/index.js';
import { firebaseService } from './db/firebase.js';
import { authRouter } from './routes/auth.routes.js';
import { chessComRouter } from './routes/chesscom.routes.js';
import { gamesRouter } from './routes/games.routes.js';
import { insightsRouter } from './routes/insights.routes.js';
import { engineRouter } from './routes/engine.routes.js';
import { savedPositionsRouter } from './routes/saved-positions.routes.js';
import { mistakesRouter } from './routes/mistakes.routes.js';
import { stockfish } from './engine/stockfish.js';

dotenv.config();

process.on('unhandledRejection', (reason: any) => {
  console.warn('[Server unhandledRejection Notice]:', reason?.message || reason);
});

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: true,
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    service: 'ChessLens API',
    engine: stockfish.getEngineInfo()
  });
});

// Mount API Routes
app.use('/api/auth', authRouter);
app.use('/api/chesscom', chessComRouter);
app.use('/api/games', gamesRouter);
app.use('/api/insights', insightsRouter);
app.use('/api/engine', engineRouter);
app.use('/api/saved-positions', savedPositionsRouter);
app.use('/api/mistakes', mistakesRouter);

// Serve frontend static build if available
const clientDistPath = path.resolve(process.cwd(), '..', 'client', 'dist');
if (fs.existsSync(clientDistPath)) {
  console.log(`[AetherChess] Serving production UI from ${clientDistPath}`);
  app.use(express.static(clientDistPath));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(clientDistPath, 'index.html'));
  });
}

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('[Server Error]', err);
  res.status(500).json({ error: err.message || 'Internal server error.' });
});

async function startServer() {
  try {
    await initDb();
    // Initialize Firebase if available
    await firebaseService.init();

    app.listen(PORT, () => {
      console.log(`[AetherChess Server] Running on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

startServer();
