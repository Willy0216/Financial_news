import { Request, Response } from 'express';
import { isinResolverService } from '../services/isin-resolver.service.js';
import { logger } from '../utils/logger.js';

export class ResolveController {
  /**
   * POST /api/resolve or GET /api/resolve - Preview ISIN or Ticker resolution
   */
  public async resolveInput(req: Request, res: Response): Promise<void> {
    try {
      const query = (
        req.body?.query ||
        req.body?.identifier ||
        req.query?.query ||
        req.query?.q ||
        ''
      )
        .toString()
        .trim();

      if (!query) {
        res.status(400).json({
          success: false,
          error: 'Missing required "query" or "identifier" parameter.',
        });
        return;
      }

      const result = await isinResolverService.resolve(query);

      const isIsinInput = isinResolverService.isIsin(query);
      let isinVal = isIsinInput ? query.toUpperCase() : undefined;

      if (!isinVal && result.bestMatch?.symbol) {
        const foundIsin = await isinResolverService.findIsinForSymbol(result.bestMatch.symbol);
        if (foundIsin) {
          isinVal = foundIsin;
        }
      }

      const bestMatchFormatted = result.bestMatch
        ? {
            symbol: result.bestMatch.symbol,
            name: result.bestMatch.name,
            exchange: result.bestMatch.exchange,
            assetType: result.bestMatch.assetType,
            currency: result.bestMatch.currency,
            isin: isinVal,
            isValid: result.bestMatch.hasActiveTradingHistory,
            lastPrice: result.bestMatch.lastPrice,
          }
        : null;

      const candidatesFormatted = result.candidates.map((c) => ({
        symbol: c.symbol,
        name: c.name,
        exchange: c.exchange,
        assetType: c.assetType,
        currency: c.currency,
        isin: isinVal,
        isValid: c.hasActiveTradingHistory,
        lastPrice: c.lastPrice,
      }));

      res.status(200).json({
        success: result.resolved,
        symbol: bestMatchFormatted?.symbol,
        name: bestMatchFormatted?.name,
        exchange: bestMatchFormatted?.exchange,
        assetType: bestMatchFormatted?.assetType,
        currency: bestMatchFormatted?.currency,
        isin: isinVal || null,
        isValid: result.resolved,
        bestMatch: bestMatchFormatted,
        candidates: candidatesFormatted,
        data: result,
      });
    } catch (error: any) {
      logger.error('Error resolving input:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
}

export const resolveController = new ResolveController();
