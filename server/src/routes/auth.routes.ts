import { Router, Response } from 'express';
import { authService } from '../services/auth.js';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth.middleware.js';

export const authRouter = Router();

authRouter.post('/register', async (req, res) => {
  try {
    const { email, username, password } = req.body;
    const result = await authService.register(email, username, password);
    res.status(201).json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Registration failed.' });
  }
});

authRouter.post('/login', async (req, res) => {
  try {
    const { identifier, password } = req.body;
    const result = await authService.login(identifier, password);
    res.json(result);
  } catch (err: any) {
    res.status(401).json({ error: err.message || 'Login failed.' });
  }
});

authRouter.post('/google', async (req, res) => {
  try {
    const { credential, profile } = req.body;
    const result = await authService.loginWithGoogle({ credential, profile });
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Google authentication failed.' });
  }
});

authRouter.post('/chesscom', async (req, res) => {
  try {
    const { username } = req.body;
    if (!username) {
      res.status(400).json({ error: 'Chess.com username is required.' });
      return;
    }
    const result = await authService.loginWithChessCom(username);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Chess.com account verification failed.' });
  }
});

authRouter.post('/firebase', async (req, res) => {
  try {
    const { idToken, email, displayName, photoURL, uid } = req.body;
    const result = await authService.loginWithFirebase({ idToken, email, displayName, photoURL, uid });
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Firebase authentication failed.' });
  }
});

authRouter.get('/me', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  res.json({ user: req.user });
});
