import { Request, Response } from 'express';
import { macroAnalyticsService } from '../services/macro-analytics.service.js';
import { logger } from '../utils/logger.js';

export class MacroController {
  /**
   * GET /api/macro-dashboard
   * Returns cached or freshly computed macro indicators and regime status
   */
  public async getDashboard(_req: Request, res: Response): Promise<void> {
    try {
      const data = await macroAnalyticsService.getDashboard(false);
      res.status(200).json({
        success: true,
        data,
      });
    } catch (error: any) {
      logger.error('Failed to retrieve macro dashboard payload:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to compute macro intelligence dashboard',
      });
    }
  }

  /**
   * POST /api/macro-dashboard/refresh
   * Forces real-time recalculation of macro indicators and returns updated payload
   */
  public async refreshDashboard(_req: Request, res: Response): Promise<void> {
    try {
      logger.info('Manual recalculation of macro dashboard requested via API.');
      const data = await macroAnalyticsService.getDashboard(true);
      res.status(200).json({
        success: true,
        message: 'Macro intelligence dashboard recalculated successfully',
        data,
      });
    } catch (error: any) {
      logger.error('Failed to refresh macro dashboard payload:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to refresh macro dashboard',
      });
    }
  }
}

export const macroController = new MacroController();
