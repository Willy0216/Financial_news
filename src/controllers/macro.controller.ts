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

  /**
   * GET /api/macro-dashboard/prompt
   * Returns populated dynamic global macro prompt (SSOT)
   */
  public async getMacroPrompt(_req: Request, res: Response): Promise<void> {
    try {
      const prompt = await macroAnalyticsService.getMacroPrompt();
      res.status(200).json({
        success: true,
        prompt,
      });
    } catch (error: any) {
      logger.error('Failed to build macro prompt:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to build macro prompt',
      });
    }
  }

  /**
   * POST /api/macro-dashboard/report
   * Generates or custom-generates AI Global Macro synthesis report
   */
  public async generateMacroReport(req: Request, res: Response): Promise<void> {
    try {
      const { customPrompt } = req.body || {};
      const result = await macroAnalyticsService.generateMacroReport(customPrompt);
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      logger.error('Failed to generate global macro report:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to generate global macro report',
      });
    }
  }
}

export const macroController = new MacroController();
