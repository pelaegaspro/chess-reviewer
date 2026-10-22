import { Router, Response } from 'express';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth.middleware.js';
import { insightsEngine } from '../services/insights.js';

export const insightsRouter = Router();

insightsRouter.get('/', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const stats = await insightsEngine.generatePlayerInsights(req.user!.id);
    res.json(stats);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
