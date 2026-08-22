import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { config } from './config/env.js';
import { getDb } from './db/db.js';
import apiRouter from './routes/index.js';
import { logger } from './utils/logger.js';

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req: Request, _res: Response, next: NextFunction) => {
  logger.info(`${req.method} ${req.originalUrl}`);
  next();
});

// Root welcome & API info
app.get('/', (_req: Request, res: Response) => {
  res.json({
    service: 'Financial News & Asset Tracking Backend',
    version: '1.0.0',
    endpoints: {
      health: 'GET /api/health',
      assets: {
        list: 'GET /api/assets',
        add: 'POST /api/assets',
        get: 'GET /api/assets/:symbol',
        delete: 'DELETE /api/assets/:symbol',
        report: 'POST /api/assets/:symbol/report',
        reports: 'GET /api/assets/:symbol/reports',
      },
      reports: {
        batch: 'POST /api/reports/batch',
      },
      resolve: {
        preview: 'POST /api/resolve',
      },
    },
  });
});

// Mount lean REST layer strictly under /api
app.use('/api', apiRouter);

// 404 Not Found Handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found. All API routes are located under /api.',
  });
});

// Global Error Handler
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  logger.error('Unhandled error in request pipeline:', err);
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Internal server error',
  });
});

// Server bootstrap
function startServer() {
  try {
    // Initialize Database and tables
    getDb();

    const server = app.listen(config.port, () => {
      logger.info(`🚀 Server running on http://localhost:${config.port}`);
      logger.info(`📡 API available at http://localhost:${config.port}/api`);
    });

    // Graceful shutdown handling
    const gracefulShutdown = () => {
      logger.info('Shutting down server gracefully...');
      server.close(() => {
        try {
          const db = getDb();
          db.close();
          logger.info('Database connection closed.');
        } catch (e) {
          logger.warn('Error closing database:', e);
        }
        process.exit(0);
      });
    };

    process.on('SIGTERM', gracefulShutdown);
    process.on('SIGINT', gracefulShutdown);
  } catch (error) {
    logger.error('Fatal error during startup:', error);
    process.exit(1);
  }
}

// Start if executed directly
if (process.env.NODE_ENV !== 'test') {
  startServer();
}

export default app;
