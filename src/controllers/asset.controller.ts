import { Request, Response } from 'express';
import { z } from 'zod';
import { assetRepository } from '../db/repositories/asset.repository.js';
import { reportRepository } from '../db/repositories/report.repository.js';
import { marketDataService } from '../services/market-data.service.js';
import { isinResolverService } from '../services/isin-resolver.service.js';
import { AssetType } from '../types/index.js';
import { logger } from '../utils/logger.js';

const AddAssetSchema = z.object({
  identifier: z.string().optional(), // Can be an ISIN (e.g. IE00B4L5Y983) or Ticker (e.g. AAPL)
  query: z.string().optional(),
  symbol: z.string().optional(),
  isin: z.string().optional(),
  name: z.string().optional(),
  asset_type: z.enum(['ETF', 'EQUITY', 'INDEX', 'COMMODITY']).optional(),
  assetType: z.enum(['ETF', 'EQUITY', 'INDEX', 'COMMODITY']).optional(),
  exchange: z.string().optional(),
  currency: z.string().optional(),
});

function getParamString(param: string | string[] | undefined): string {
  if (Array.isArray(param)) return param[0] || '';
  return param || '';
}

export class AssetController {
  /**
   * GET /api/assets - List all tracked assets with current market quotes and latest report
   */
  public async listAssets(_req: Request, res: Response): Promise<void> {
    try {
      const assets = assetRepository.findAll();

      // Enrich assets with live market quotes and latest report dates in parallel
      const enrichedAssets = await Promise.all(
        assets.map(async (asset) => {
          const quote = await marketDataService.getQuote(asset.symbol);
          const latestReport = reportRepository.findLatestBySymbol(asset.symbol);
          const liveCurrency = quote?.currency || asset.currency || 'USD';

          // Sync database if currency differed or was saved with default
          if (quote?.currency && asset.currency !== quote.currency) {
            assetRepository.updateCurrency(asset.symbol, quote.currency);
          }

          return {
            id: asset.id,
            symbol: asset.symbol,
            isin: asset.isin,
            name: asset.name,
            assetType: asset.asset_type,
            asset_type: asset.asset_type,
            exchange: asset.exchange || quote?.exchange || '',
            currency: liveCurrency,
            lastClose: quote?.price ?? 0,
            prevClose: quote?.prevClose ?? 0,
            priceChangePct: quote?.priceChangePct ?? 0,
            created_at: asset.created_at,
            quote: quote || null,
            latest_report: latestReport
              ? {
                  id: latestReport.id,
                  price_change_pct: latestReport.price_change_pct,
                  last_close: latestReport.last_close,
                  created_at: latestReport.created_at,
                }
              : null,
          };
        })
      );

      res.status(200).json({
        success: true,
        count: enrichedAssets.length,
        data: enrichedAssets,
      });
    } catch (error: any) {
      logger.error('Failed to list tracked assets:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * POST /api/assets - Add a new asset by ISIN, ticker, or custom metadata
   */
  public async addAsset(req: Request, res: Response): Promise<void> {
    try {
      const parseResult = AddAssetSchema.safeParse(req.body);
      if (!parseResult.success) {
        res.status(400).json({
          success: false,
          error: 'Invalid request body',
          details: parseResult.error.errors,
        });
        return;
      }

      const body = parseResult.data;
      const inputQuery = (body.identifier || body.query || body.isin || body.symbol || '').trim();

      if (!inputQuery && !body.symbol) {
        res.status(400).json({
          success: false,
          error: 'Please provide an ISIN, ticker symbol, or "identifier" string.',
        });
        return;
      }

      let symbolToUse = body.symbol?.toUpperCase();
      let isinToUse = body.isin?.toUpperCase() || null;
      let nameToUse = body.name;
      let assetTypeToUse: AssetType | undefined = body.assetType || body.asset_type;
      let exchangeToUse = body.exchange;
      let currencyToUse = body.currency;

      // If resolving via query / isin or if details are missing:
      if (!symbolToUse || !nameToUse || !assetTypeToUse) {
        const resolution = await isinResolverService.resolve(inputQuery || symbolToUse || '');

        if (!resolution.resolved || !resolution.bestMatch) {
          res.status(404).json({
            success: false,
            error: resolution.error || `Could not resolve asset for input: "${inputQuery}".`,
            candidates: resolution.candidates,
          });
          return;
        }

        const match = resolution.bestMatch;
        symbolToUse = symbolToUse || match.symbol;
        if (isinResolverService.isIsin(inputQuery)) {
          isinToUse = inputQuery;
        } else if (match.isin) {
          isinToUse = match.isin;
        }
        nameToUse = nameToUse || match.name;
        assetTypeToUse = assetTypeToUse || match.assetType;
        exchangeToUse = exchangeToUse || match.exchange;
        currencyToUse = currencyToUse || match.currency;
      }

      // If ISIN is still not set, perform reverse ISIN lookup
      if (!isinToUse && symbolToUse) {
        isinToUse = await isinResolverService.findIsinForSymbol(symbolToUse);
      }

      // Final active trading validation
      const validation = await marketDataService.validateActiveTrading(symbolToUse);
      if (!validation.isValid || !validation.quote) {
        res.status(400).json({
          success: false,
          error: `Symbol "${symbolToUse}" does not have active trading history or valid pricing on market data provider.`,
        });
        return;
      }

      // Inherit verified market quote currency & exchange
      currencyToUse = validation.quote.currency || currencyToUse || 'USD';
      exchangeToUse = validation.quote.exchange || exchangeToUse;

      // Check if already tracked
      const existing = assetRepository.findBySymbol(symbolToUse);
      if (existing) {
        res.status(409).json({
          success: false,
          error: `Asset with symbol "${symbolToUse}" is already tracked.`,
          data: existing,
        });
        return;
      }

      // Persist new tracked asset
      const newAsset = assetRepository.create({
        symbol: symbolToUse,
        isin: isinToUse,
        name: nameToUse,
        asset_type: assetTypeToUse,
        exchange: exchangeToUse,
        currency: currencyToUse,
      });

      res.status(201).json({
        success: true,
        message: `Asset "${newAsset.symbol}" (${newAsset.name}) added to tracking successfully.`,
        data: {
          id: newAsset.id,
          symbol: newAsset.symbol,
          isin: newAsset.isin,
          name: newAsset.name,
          assetType: newAsset.asset_type,
          asset_type: newAsset.asset_type,
          exchange: newAsset.exchange || validation.quote.exchange,
          currency: newAsset.currency,
          lastClose: validation.quote.price,
          prevClose: validation.quote.prevClose,
          priceChangePct: validation.quote.priceChangePct,
          created_at: newAsset.created_at,
          quote: validation.quote,
        },
      });
    } catch (error: any) {
      logger.error('Failed to add asset:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * GET /api/assets/:symbol - Get asset details, live quote, and latest report
   */
  public async getAsset(req: Request, res: Response): Promise<void> {
    try {
      const symbol = getParamString(req.params.symbol);
      const asset = assetRepository.findBySymbol(symbol);

      if (!asset) {
        res.status(404).json({ success: false, error: `Tracked asset "${symbol}" not found.` });
        return;
      }

      const quote = await marketDataService.getQuote(asset.symbol);
      const latestReport = reportRepository.findLatestBySymbol(asset.symbol);
      const liveCurrency = quote?.currency || asset.currency || 'USD';

      if (quote?.currency && asset.currency !== quote.currency) {
        assetRepository.updateCurrency(asset.symbol, quote.currency);
      }

      res.status(200).json({
        success: true,
        data: {
          id: asset.id,
          symbol: asset.symbol,
          isin: asset.isin,
          name: asset.name,
          assetType: asset.asset_type,
          asset_type: asset.asset_type,
          exchange: asset.exchange || quote?.exchange || '',
          currency: liveCurrency,
          lastClose: quote?.price ?? 0,
          prevClose: quote?.prevClose ?? 0,
          priceChangePct: quote?.priceChangePct ?? 0,
          created_at: asset.created_at,
          quote: quote || null,
          latest_report: latestReport || null,
        },
      });
    } catch (error: any) {
      logger.error(`Failed to get asset ${req.params.symbol}:`, error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * DELETE /api/assets/:symbol - Remove asset from tracking
   */
  public async deleteAsset(req: Request, res: Response): Promise<void> {
    try {
      const symbol = getParamString(req.params.symbol);
      const deleted = assetRepository.delete(symbol);

      if (!deleted) {
        res.status(404).json({ success: false, error: `Tracked asset "${symbol}" not found.` });
        return;
      }

      // Clean up reports for this symbol
      reportRepository.deleteBySymbol(symbol);

      res.status(200).json({
        success: true,
        message: `Asset "${symbol.toUpperCase()}" and its report history were removed successfully.`,
      });
    } catch (error: any) {
      logger.error(`Failed to delete asset ${req.params.symbol}:`, error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
}

export const assetController = new AssetController();
