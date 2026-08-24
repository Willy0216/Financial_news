import { assetRepository } from '../db/repositories/asset.repository.js';
import { reportRepository } from '../db/repositories/report.repository.js';
import { marketDataService } from './market-data.service.js';
import {
  geminiService,
  DynamicAssetReportPayload,
  buildAssetReportPrompt,
} from './gemini.service.js';
import { newsAggregatorService } from './news-aggregator.service.js';
import {
  ReportGenerationResult,
  TrackedAsset,
  UnderlyingProfileData,
} from '../types/index.js';
import { logger } from '../utils/logger.js';

export { DynamicAssetReportPayload, buildAssetReportPrompt };

export class ReportGeneratorService {
  /**
   * Format underlying exposure / basket dynamics from live profile metadata (Zero hardcoding)
   */
  public formatUnderlyingContext(
    profile: UnderlyingProfileData | null,
    assetType?: string
  ): string | undefined {
    if (!profile) return undefined;

    const lines: string[] = [];

    // 1. ETFs & Funds with Top Holdings
    if (profile.topHoldings && profile.topHoldings.length > 0) {
      if (profile.family) lines.push(`- **Fund Family**: ${profile.family}`);
      if (profile.benchmark) lines.push(`- **Benchmark Index**: ${profile.benchmark}`);
      if (profile.categoryName) lines.push(`- **Category**: ${profile.categoryName}`);
      lines.push('- **Top Constituent Holdings**:');
      for (const h of profile.topHoldings) {
        const weight = h.weightPct !== undefined ? `${h.weightPct.toFixed(2)}%` : 'N/A';
        lines.push(`  - ${h.name}${h.symbol ? ` (${h.symbol})` : ''}: ${weight}`);
      }
      return lines.join('\n');
    }

    // 2. Commodities & Crypto ETCs with Underlying Spot Asset
    if (profile.underlyingAsset) {
      lines.push(`- **Underlying Spot Target**: ${profile.underlyingAsset}`);
      if (profile.benchmark) lines.push(`- **Benchmark Index**: ${profile.benchmark}`);
      if (profile.categoryName) lines.push(`- **Category**: ${profile.categoryName}`);
      return lines.join('\n');
    }

    // 3. Single Equities with Sector / Industry / Business Profile
    if (profile.sector || profile.industry || profile.marketCap || profile.summary) {
      if (profile.sector) lines.push(`- **Sector**: ${profile.sector}`);
      if (profile.industry) lines.push(`- **Industry**: ${profile.industry}`);
      if (profile.marketCap) lines.push(`- **Market Cap**: ${profile.marketCap}`);
      if (profile.summary) {
        const summarySnippet =
          profile.summary.length > 250
            ? profile.summary.substring(0, 250) + '...'
            : profile.summary;
        lines.push(`- **Business Profile**: ${summarySnippet}`);
      }
      return lines.join('\n');
    }

    return undefined;
  }

  /**
   * Generate or fetch cached report for a single asset symbol
   */
  public async generateReportForSymbol(
    symbol: string,
    options: { force?: boolean; customPrompt?: string } = {}
  ): Promise<ReportGenerationResult> {
    const cleanSymbol = symbol.trim().toUpperCase();
    const isCustom = Boolean(options.customPrompt && options.customPrompt.trim().length > 10);
    const force = options.force || isCustom;

    // 1. Check if asset is tracked or fetch its quote
    const tracked = assetRepository.findBySymbol(cleanSymbol);
    let quote = await marketDataService.getQuote(cleanSymbol);

    if (!quote && tracked) {
      quote = {
        symbol: cleanSymbol,
        name: tracked.name,
        price: 0,
        prevClose: 0,
        priceChange: 0,
        priceChangePct: 0,
        currency: tracked.currency || 'EUR',
        exchange: tracked.exchange || 'MIL',
        assetType: tracked.asset_type || 'ETF',
        lastTradingDay: new Date().toISOString(),
      };
    }

    if (!quote) {
      return {
        symbol: cleanSymbol,
        status: 'error',
        reason: `Could not retrieve market quote for symbol "${cleanSymbol}".`,
      };
    }

    // 2. Check 0.00% change / market closed filter (only when not forced)
    if (!force && (Math.abs(quote.priceChangePct) === 0 || quote.prevClose === quote.price)) {
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
    if (!force) {
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

    // 4. Retrieve or extract underlying profile metadata
    let profile: UnderlyingProfileData | null = null;
    if (tracked?.underlying_data) {
      try {
        profile = JSON.parse(tracked.underlying_data);
      } catch {
        profile = null;
      }
    }
    if (!profile) {
      profile = await marketDataService.fetchUnderlyingData(
        cleanSymbol,
        tracked?.asset_type || quote.assetType
      );
    }

    // 5. Fetch fresh multi-tiered news headlines via NewsAggregatorService
    const newsItems = await newsAggregatorService.fetchNewsForAsset({
      symbol: cleanSymbol,
      name: tracked?.name || quote.name,
      assetType: tracked?.asset_type || quote.assetType,
      profile,
      underlying_data: tracked?.underlying_data,
    });
    const formattedNews = newsAggregatorService.formatHeadlinesForPrompt(newsItems);

    // 6. Build typed DynamicAssetReportPayload (SSOT, zero hardcoded strings)
    const reportPayload: DynamicAssetReportPayload = {
      name: tracked?.name || quote.name,
      symbol: cleanSymbol,
      isin: tracked?.isin,
      assetType: tracked?.asset_type || quote.assetType,
      exchange: tracked?.exchange || quote.exchange,
      currency: tracked?.currency || quote.currency,
      lastClose: quote.price,
      prevClose: quote.prevClose,
      priceChange: quote.priceChange,
      priceChangePct: quote.priceChangePct,
      underlyingContext: this.formatUnderlyingContext(
        profile,
        tracked?.asset_type || quote.assetType
      ),
      newsContext: formattedNews,
    };

    // 7. Call Gemini with fallback hierarchy
    try {
      const { markdown, modelUsed } = await geminiService.generateReport(
        reportPayload,
        options.customPrompt
      );

      // 8. Save generated report to SQLite
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
   * Get populated prompt with live asset variables for symbol (SSOT)
   */
  public async getPopulatedPromptForSymbol(symbol: string): Promise<string> {
    const cleanSymbol = symbol.trim().toUpperCase();
    const tracked = assetRepository.findBySymbol(cleanSymbol);
    let quote = await marketDataService.getQuote(cleanSymbol);

    if (!quote && tracked) {
      quote = {
        symbol: cleanSymbol,
        name: tracked.name,
        price: 0,
        prevClose: 0,
        priceChange: 0,
        priceChangePct: 0,
        currency: tracked.currency || 'EUR',
        exchange: tracked.exchange || 'MIL',
        assetType: tracked.asset_type || 'ETF',
        lastTradingDay: new Date().toISOString(),
      };
    }

    let profile: UnderlyingProfileData | null = null;
    if (tracked?.underlying_data) {
      try {
        profile = JSON.parse(tracked.underlying_data);
      } catch {
        profile = null;
      }
    }
    if (!profile) {
      profile = await marketDataService.fetchUnderlyingData(
        cleanSymbol,
        tracked?.asset_type || quote?.assetType || 'EQUITY'
      );
    }

    const newsItems = await newsAggregatorService.fetchNewsForAsset({
      symbol: cleanSymbol,
      name: tracked?.name || quote?.name || cleanSymbol,
      assetType: tracked?.asset_type || quote?.assetType || 'EQUITY',
      profile,
      underlying_data: tracked?.underlying_data,
    });
    const formattedNews = newsAggregatorService.formatHeadlinesForPrompt(newsItems);

    const reportPayload: DynamicAssetReportPayload = {
      name: tracked?.name || quote?.name || cleanSymbol,
      symbol: cleanSymbol,
      isin: tracked?.isin,
      assetType: tracked?.asset_type || quote?.assetType || 'EQUITY',
      exchange: tracked?.exchange || quote?.exchange || 'N/A',
      currency: tracked?.currency || quote?.currency || 'USD',
      lastClose: quote?.price ?? 0,
      prevClose: quote?.prevClose ?? 0,
      priceChange: quote?.priceChange ?? 0,
      priceChangePct: quote?.priceChangePct ?? 0,
      underlyingContext: this.formatUnderlyingContext(
        profile,
        tracked?.asset_type || quote?.assetType
      ),
      newsContext: formattedNews,
    };

    return buildAssetReportPrompt(reportPayload);
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
      else if (res.status === 'skipped_zero_change' || res.status === 'skipped_market_closed')
        skippedCount++;
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
