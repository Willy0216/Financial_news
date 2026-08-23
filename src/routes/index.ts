import { Router } from 'express';
import assetRoutes from './asset.routes.js';
import reportRoutes from './report.routes.js';
import resolveRoutes from './resolve.routes.js';
import chartRoutes from './chart.routes.js';
import macroRoutes from './macro.routes.js';
import { assetRepository } from '../db/repositories/asset.repository.js';

const router = Router();

// Health check endpoint
router.get('/health', (_req, res) => {
  try {
    const assetCount = assetRepository.count();
    res.status(200).json({
      status: 'ok',
      service: 'financial-news-backend',
      timestamp: new Date().toISOString(),
      database: 'connected',
      tracked_assets_count: assetCount,
    });
  } catch (err: any) {
    res.status(500).json({
      status: 'degraded',
      error: err.message,
    });
  }
});

// Mount modular sub-routers
router.use('/assets', assetRoutes);
router.use('/reports', reportRoutes);
router.use('/resolve', resolveRoutes);
router.use('/chart', chartRoutes);
router.use('/macro-dashboard', macroRoutes);

export default router;
