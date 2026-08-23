import { assetRepository } from '../db/repositories/asset.repository.js';
import { reportRepository } from '../db/repositories/report.repository.js';
import { marketDataService } from './market-data.service.js';
import { geminiService } from './gemini.service.js';
import { macroAnalyticsService } from './macro-analytics.service.js';
import { ReportGenerationResult, TrackedAsset } from '../types/index.js';
import { MacroIndicatorSummary } from '../types/macro.js';
import { logger } from '../utils/logger.js';

export class ReportGeneratorService {
  /**
   * Format macroeconomic dashboard indicators for prompt injection
   */
  public formatMacroIndicators(metrics?: MacroIndicatorSummary[]): string {
    if (!metrics || metrics.length === 0) {
      return `- **Global Liquidity & FX**:
  - **US Dollar Index (DXY)** at 98.80 (-0.20σ, -0.36% vs SMA 200) -> Stable and neutral global FX liquidity conditions.
- **Market Volatility & Credit Stress**:
  - **CBOE Volatility Index (VIX)** at 15.13 (-0.95σ, -17.74% vs SMA 200) -> Subdued equity volatility regime, reflecting compressed near-term hedging demand.
  - **US High Yield Credit Spread (OAS)** at 2.75% (-0.74σ, -3.92% vs SMA 200) -> Benign credit risk premium with no systemic corporate default stress.
- **Global Growth & Industrial Cycle**:
  - **Copper / Gold Ratio (x1000)** at 1.41 (+0.75σ, +6.30% vs SMA 200) -> Cyclical economic expansion and firm industrial risk appetite relative to safe-haven assets.
- **Real-Asset Equity Valuations (Gold Ratios)**:
  - **S&P 500 / Gold Ratio** at 1.64 (+0.19σ, +3.53% vs SMA 200) -> Resilient broad-market equity strength when benchmarked against monetary gold.
  - **Dow Jones / Gold Ratio** at 11.38 (+0.15σ, +2.94% vs SMA 200) -> Stable industrial/value asset valuations relative to hard currency reserves.`;
    }

    const map = new Map<string, MacroIndicatorSummary>();
    for (const m of metrics) {
      map.set(m.key, m);
    }

    const formatLine = (
      m: MacroIndicatorSummary | undefined,
      defaultVal: string,
      defaultZ: string,
      defaultDiff: string,
      unit: string,
      interpretation: string
    ) => {
      if (!m) return `${defaultVal}${unit} (${defaultZ}σ, ${defaultDiff}% vs SMA 200) -> ${interpretation}`;
      const zSign = (m.zScore1Y ?? 0) >= 0 ? '+' : '';
      const diffSign = (m.distSma200Pct ?? 0) >= 0 ? '+' : '';
      const zStr = m.zScore1Y !== null ? `${zSign}${m.zScore1Y.toFixed(2)}σ` : 'N/A';
      const diffStr = m.distSma200Pct !== null ? `${diffSign}${m.distSma200Pct.toFixed(2)}% vs SMA 200` : 'N/A';
      return `${m.latestValue.toFixed(2)}${unit} (${zStr}, ${diffStr}) -> ${interpretation}`;
    };

    const dxy = map.get('DXY');
    const vix = map.get('VIX');
    const hy = map.get('HY_OAS');
    const cg = map.get('COPPER_GOLD') || map.get('Copper_Gold_Ratio');
    const spg = map.get('SP500_GOLD') || map.get('SP500_Gold_Ratio');
    const dg = map.get('DOW_GOLD') || map.get('Dow_Gold_Ratio');

    const dxyInterp =
      (dxy?.zScore1Y ?? 0) >= 1.0
        ? 'Elevated USD strength exerting global liquidity tightness and cross-border currency friction.'
        : (dxy?.zScore1Y ?? 0) <= -1.0
        ? 'Weak USD boosting global liquidity and cross-asset risk-taking.'
        : 'Stable and neutral global FX liquidity conditions.';

    const vixInterp =
      (vix?.zScore1Y ?? 0) >= 1.5
        ? 'Acute market stress regime with surging hedging demand and equity risk-off pressure.'
        : (vix?.zScore1Y ?? 0) >= 0.75
        ? 'Elevated equity volatility and heightened downside caution.'
        : 'Subdued equity volatility regime, reflecting compressed near-term hedging demand.';

    const hyInterp =
      (hy?.zScore1Y ?? 0) >= 1.2
        ? 'Widening corporate credit risk premium signaling financial tightness.'
        : 'Benign credit risk premium with no systemic corporate default stress.';

    const cgInterp =
      (cg?.zScore1Y ?? 0) >= 0.5
        ? 'Cyclical economic expansion and firm industrial risk appetite relative to safe-haven assets.'
        : (cg?.zScore1Y ?? 0) <= -0.5
        ? 'Defensive rotation towards monetary safe havens and slowing industrial demand.'
        : 'Balanced growth sentiment between industrial metals and safe-haven assets.';

    const spgInterp =
      (spg?.zScore1Y ?? 0) >= 0.0
        ? 'Resilient broad-market equity strength when benchmarked against monetary gold.'
        : 'Defensive gold outperformance relative to broad-market US equities.';

    const dgInterp =
      (dg?.zScore1Y ?? 0) >= 0.0
        ? 'Stable industrial/value asset valuations relative to hard currency reserves.'
        : 'Industrial/value equity compression relative to physical gold.';

    return `- **Global Liquidity & FX**:
  - **US Dollar Index (DXY)** at ${formatLine(dxy, '98.80', '-0.20', '-0.36', '', dxyInterp)}
- **Market Volatility & Credit Stress**:
  - **CBOE Volatility Index (VIX)** at ${formatLine(vix, '15.13', '-0.95', '-17.74', '', vixInterp)}
  - **US High Yield Credit Spread (OAS)** at ${formatLine(hy, '2.75', '-0.74', '-3.92', '%', hyInterp)}
- **Global Growth & Industrial Cycle**:
  - **Copper / Gold Ratio (x1000)** at ${formatLine(cg, '1.41', '+0.75', '+6.30', '', cgInterp)}
- **Real-Asset Equity Valuations (Gold Ratios)**:
  - **S&P 500 / Gold Ratio** at ${formatLine(spg, '1.64', '+0.19', '+3.53', '', spgInterp)}
  - **Dow Jones / Gold Ratio** at ${formatLine(dg, '11.38', '+0.15', '+2.94', '', dgInterp)}`;
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

    // 4. Retrieve or extract underlying profile metadata (benchmark, underlyingAsset, etc.)
    let profile: any = null;
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

    // 5. Fetch targeted news headlines using Underlying Spot Target, Benchmark Index, and Ticker keywords
    const recentNews = await this.fetchTargetedNews(
      cleanSymbol,
      tracked?.name || quote.name,
      profile
    );

    // 6. Fetch live Macro Indicators for structured prompt injection
    let macroIndicators: string | undefined;
    try {
      const macroDashboard = await macroAnalyticsService.getDashboard();
      macroIndicators = this.formatMacroIndicators(macroDashboard.metrics);
    } catch {
      macroIndicators = this.formatMacroIndicators();
    }

    // 7. Call Gemini with fallback hierarchy
    try {
      const { markdown, modelUsed } = await geminiService.generateReport(
        {
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
          benchmark: profile?.benchmark,
          underlyingAsset: profile?.underlyingAsset,
          sector: profile?.sector,
          industry: profile?.industry,
          family: profile?.family,
          macroIndicators,
          recentNews,
        },
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
   * Fetch targeted news headlines using underlying spot target, benchmark index, and ticker keywords
   */
  private async fetchTargetedNews(
    symbol: string,
    name?: string,
    profile?: any
  ): Promise<Array<{ title: string; publisher: string }>> {
    const queries: string[] = [];
    const sym = symbol.toUpperCase();

    // 1. Specific targeted keyword based on underlying spot target
    if (profile?.underlyingAsset) {
      const lower = profile.underlyingAsset.toLowerCase();
      if (lower.includes('bitcoin') || sym.includes('BTC') || sym.includes('BITC')) {
        queries.push('Bitcoin');
      } else if (lower.includes('ethereum') || sym.includes('ETH')) {
        queries.push('Ethereum');
      } else if (
        lower.includes('gold') ||
        sym.includes('GOLD') ||
        sym.includes('SGLN') ||
        sym.includes('PPFB')
      ) {
        queries.push('Gold price');
      } else if (lower.includes('silver') || sym.includes('SILVER') || sym.includes('SSLN')) {
        queries.push('Silver price');
      } else if (lower.includes('copper') || sym.includes('HG=')) {
        queries.push('Copper commodity');
      } else if (lower.includes('crude') || sym.includes('CL=')) {
        queries.push('Crude Oil');
      } else {
        const cleaned = profile.underlyingAsset.replace(/\(.*?\)/g, '').trim();
        if (cleaned) queries.push(cleaned);
      }
    }

    // 2. Benchmark index keywords
    if (profile?.benchmark) {
      const lower = profile.benchmark.toLowerCase();
      if (lower.includes('stoxx')) {
        queries.push('STOXX Europe 600');
      } else if (lower.includes('s&p 500') || lower.includes('sp500')) {
        queries.push('S&P 500');
      } else if (lower.includes('nasdaq')) {
        queries.push('Nasdaq 100');
      } else if (!queries.includes(profile.benchmark)) {
        queries.push(profile.benchmark.trim());
      }
    }

    // 3. Raw symbol
    queries.push(symbol);

    // 4. Asset name without generic fund suffixes
    if (name && name !== symbol) {
      const cleanName = name
        .replace(/UCITS ETF.*$/i, '')
        .replace(/ETF.*$/i, '')
        .replace(/ETC.*$/i, '')
        .replace(/Physical.*$/i, '')
        .trim();
      if (cleanName.length > 2 && !queries.includes(cleanName)) {
        queries.push(cleanName);
      }
    }

    const headlineSet = new Set<string>();
    const results: Array<{ title: string; publisher: string }> = [];

    for (const q of queries) {
      if (results.length >= 5) break;
      try {
        const { news } = await marketDataService.searchYahoo(q, 0, 5);
        for (const item of news) {
          if (item.title && !headlineSet.has(item.title.toLowerCase().trim())) {
            headlineSet.add(item.title.toLowerCase().trim());
            results.push({
              title: item.title.trim(),
              publisher: item.publisher?.trim() || 'Market News',
            });
            if (results.length >= 5) break;
          }
        }
      } catch (err: any) {
        logger.warn(`Failed to search news for query "${q}": ${err.message}`);
      }
    }

    return results;
  }

  /**
   * Get populated prompt with live asset variables for symbol
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

    let profile: any = null;
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

    const recentNews = await this.fetchTargetedNews(
      cleanSymbol,
      tracked?.name || quote?.name || cleanSymbol,
      profile
    );

    let macroIndicators: string | undefined;
    try {
      const macroDashboard = await macroAnalyticsService.getDashboard();
      macroIndicators = this.formatMacroIndicators(macroDashboard.metrics);
    } catch {
      macroIndicators = this.formatMacroIndicators();
    }

    return geminiService.buildPrompt({
      symbol: cleanSymbol,
      name: tracked?.name || quote?.name || cleanSymbol,
      isin: tracked?.isin,
      assetType: tracked?.asset_type || quote?.assetType || 'EQUITY',
      exchange: tracked?.exchange || quote?.exchange || 'N/A',
      currency: tracked?.currency || quote?.currency || 'USD',
      lastClose: quote?.price ?? 0,
      prevClose: quote?.prevClose ?? 0,
      priceChange: quote?.priceChange ?? 0,
      priceChangePct: quote?.priceChangePct ?? 0,
      benchmark: profile?.benchmark,
      underlyingAsset: profile?.underlyingAsset,
      sector: profile?.sector,
      industry: profile?.industry,
      family: profile?.family,
      macroIndicators,
      recentNews,
    });
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
