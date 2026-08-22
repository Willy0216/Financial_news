import { Request, Response } from 'express';
import { marketDataService } from '../services/market-data.service.js';
import { logger } from '../utils/logger.js';

function getParamString(param: string | string[] | undefined): string {
  if (Array.isArray(param)) return param[0] || '';
  return param || '';
}

export class ChartController {
  /**
   * GET /api/chart/:symbol?range=1M
   * Returns array of historical data points: { timestamp: string; close: number }[]
   */
  public async getChart(req: Request, res: Response): Promise<void> {
    try {
      const symbol = getParamString(req.params.symbol);
      const range = ((req.query.range as string) || '1M').toString().toUpperCase();

      if (!symbol) {
        res.status(400).json({ success: false, error: 'Symbol parameter is required.' });
        return;
      }

      const points = await marketDataService.getChartHistory(symbol, range);

      res.status(200).json({
        success: true,
        symbol: symbol.toUpperCase(),
        range,
        count: points.length,
        data: points,
      });
    } catch (error: any) {
      logger.error(`Error in getChart for ${req.params.symbol}:`, error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
}

export const chartController = new ChartController();
