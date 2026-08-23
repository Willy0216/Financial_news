import { assetRepository } from '../db/repositories/asset.repository.js';
import { reportRepository } from '../db/repositories/report.repository.js';
import { marketDataService } from './market-data.service.js';
import { geminiService } from './gemini.service.js';
import { ReportGenerationResult, TrackedAsset } from '../types/index.js';
import { logger } from '../utils/logger.js';

export class ReportGeneratorService {
  /**
   * Generate or fetch cached report for a single asset symbol
   */
  public async generateReportForSymbol(
    symbol: string,
    options: { force?: boolean } = {}
  ): Promise<ReportGenerationResult> {
    const cleanSymbol = symbol.trim().toUpperCase();

    // 1. Check if asset is tracked or fetch its quote
    const tracked = assetRepository.findBySymbol(cleanSymbol);
    const quote = await marketDataService.getQuote(cleanSymbol);

    if (!quote) {
      return {
        symbol: cleanSymbol,
        status: 'error',
        reason: `Could not retrieve market quote for symbol "${cleanSymbol}".`,
      };
    }

    // 2. Check 0.00% change / market closed filter
    // If the price change is 0.00%, avoid making unnecessary LLM calls
    if (Math.abs(quote.priceChangePct) === 0 || quote.prevClose === quote.price) {
      logger.info(
        `Skipping report generation for ${cleanSymbol}: market closed or recorded 0.00% change.`
      );
      return {
        symbol: cleanSymbol,
        status: 'skipped_zero_change',
        reason: `Market recorded a 0.00% price change (${quote.price} ${quote.currency}). LLM call skipped.`,
      };
    }

    // 3. Check SQLite Cache (if not forced)
    if (!options.force) {
      const cached = reportRepository.findRecentToday(cleanSymbol);
      if (cached) {
        logger.info(`Returning cached report for ${cleanSymbol} (created at ${cached.created_at}).`);
        return {
          symbol: cleanSymbol,
          status: 'cached',
          report: cached,
          reportMarkdown: cached.report_markdown,
          modelUsed: cached.model_used || undefined,
          reason: 'Valid report generated earlier today found in cache.',
        };
      }
    }

    // 4. Fetch recent news headlines for context
    const { news } = await marketDataService.searchYahoo(cleanSymbol, 5, 5);
    const recentNews = news.map((n) => ({ title: n.title, publisher: n.publisher }));

    // 5. Call Gemini with fallback hierarchy
    try {
      const { markdown, modelUsed } = await geminiService.generateReport({
        symbol: cleanSymbol,
        name: tracked?.name || quote.name,
        isin: tracked?.isin,
        assetType: tracked?.asset_type || quote.assetType,
        exchange: tracked?.exchange || quote.exchange,
        currency: tracked?.currency || quote.currency,
        lastClose: quote.price,
        prevClose: quote.prevClose,
        priceChange: quote.priceChange,
        priceChangePct: quote.priceChangePct,
        recentNews,
      });

      // 6. Save generated report to SQLite
      const savedReport = reportRepository.create({
        symbol: cleanSymbol,
        price_change_pct: quote.priceChangePct,
        prev_close: quote.prevClose,
        last_close: quote.price,
        report_markdown: markdown,
        model_used: modelUsed,
      });

      return {
        symbol: cleanSymbol,
        status: 'generated',
        report: savedReport,
        reportMarkdown: markdown,
        modelUsed,
      };
    } catch (err: any) {
      logger.error(`Failed to generate report for ${cleanSymbol}: ${err.message}`);
      return {
        symbol: cleanSymbol,
        status: 'error',
        reason: err.message || 'Unknown error occurred during AI report generation.',
      };
    }
  }

  /**
   * Batch generate reports for all currently tracked assets
   */
  public async generateBatchReports(options: { force?: boolean } = {}): Promise<{
    total: number;
    generated: number;
    cached: number;
    skipped: number;
    errors: number;
    results: ReportGenerationResult[];
  }> {
    const assets: TrackedAsset[] = assetRepository.findAll();
    logger.info(`Starting batch report generation for ${assets.length} tracked assets...`);

    const results: ReportGenerationResult[] = [];
    let generatedCount = 0;
    let cachedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const asset of assets) {
      const res = await this.generateReportForSymbol(asset.symbol, options);
      results.push(res);

      if (res.status === 'generated') generatedCount++;
      else if (res.status === 'cached') cachedCount++;
      else if (res.status === 'skipped_zero_change' || res.status === 'skipped_market_closed') skippedCount++;
      else if (res.status === 'error') errorCount++;
    }

    return {
      total: assets.length,
      generated: generatedCount,
      cached: cachedCount,
      skipped: skippedCount,
      errors: errorCount,
      results,
    };
  }
}

export const reportGeneratorService = new ReportGeneratorService();
