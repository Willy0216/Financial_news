import axios from 'axios';
import dns from 'dns';
import {
  MacroCategory,
  MacroDashboardPayload,
  MacroIndicatorSummary,
  RegimeStatus,
} from '../types/macro.js';
import {
  geminiService,
  DynamicMacroReportPayload,
  buildGlobalMacroPrompt,
} from './gemini.service.js';
import { logger } from '../utils/logger.js';

// Ensure IPv4 DNS resolution first to avoid Windows Node.js Happy Eyeballs IPv6 timeout
try {
  if (dns.setDefaultResultOrder) {
    dns.setDefaultResultOrder('ipv4first');
  }
} catch {
  // ignore
}

interface DatePoint {
  date: string;
  close: number;
}

/**
 * Classify market regime based on indicator type and rolling 1Y Z-score
 */
export function classifyMacroRegime(key: string, zScore: number | null): RegimeStatus {
  if (zScore === null || isNaN(zScore)) {
    return { label: 'NEUTRAL', variant: 'slate' };
  }

  // 1. Stress / Fear Gauges (VIX, High Yield OAS, DXY) -> High Z is Risk-Off / Acute Stress
  if (['VIX', 'HY_OAS', 'DXY'].includes(key)) {
    if (zScore >= 2.0) return { label: 'ACUTE STRESS (+2σ)', variant: 'rose' };
    if (zScore >= 1.0) return { label: 'ELEVATED RISK (+1σ)', variant: 'amber' };
    if (zScore <= -1.5) return { label: 'BENIGN / COMPLACENT', variant: 'emerald' };
    if (zScore <= -0.75) return { label: 'SUBDUED (-1σ)', variant: 'blue' };
    return { label: 'NEUTRAL', variant: 'slate' };
  }

  // 2. Growth / Expansion Ratios (Copper/Gold, Dow/Gold, S&P 500/Gold) -> High Z is Risk-On
  if (
    [
      'COPPER_GOLD',
      'DOW_GOLD',
      'SP500_GOLD',
      'Copper_Gold_Ratio',
      'Dow_Gold_Ratio',
      'SP500_Gold_Ratio',
    ].includes(key)
  ) {
    if (zScore >= 1.75) return { label: 'STRONG RISK-ON (+2σ)', variant: 'emerald' };
    if (zScore >= 0.75) return { label: 'EXPANSION (+1σ)', variant: 'emerald' };
    if (zScore <= -1.75) return { label: 'CONTRACTION (-2σ)', variant: 'rose' };
    if (zScore <= -0.75) return { label: 'DEFENSIVE / LAGGING', variant: 'amber' };
    return { label: 'NEUTRAL', variant: 'slate' };
  }

  return { label: 'NEUTRAL', variant: 'slate' };
}

export class MacroAnalyticsService {
  private readonly userAgent = 'EconomicsUpdate/1.0';

  private cachedDashboard: MacroDashboardPayload | null = null;
  private cachedYahooData: Record<string, DatePoint[]> = {};
  private cachedFredData: DatePoint[] = [];
  private lastFetchedTime = 0;
  private readonly CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours
  private refreshTimer: NodeJS.Timeout | null = null;

  constructor() {
    // Schedule periodic background refresh every 4 hours
    if (process.env.NODE_ENV !== 'test') {
      this.refreshTimer = setInterval(() => {
        this.getDashboard(true).catch((err) => {
          logger.warn(`Periodic macro dashboard refresh failed: ${err.message}`);
        });
      }, this.CACHE_TTL_MS);
      // Unref timer so it doesn't prevent graceful process exit
      if (this.refreshTimer && typeof this.refreshTimer.unref === 'function') {
        this.refreshTimer.unref();
      }
    }
  }

  /**
   * Fetch 2 years of daily data from Yahoo Finance for given symbols
   */
  public async fetchYahooSeries(symbols: string[]): Promise<Record<string, DatePoint[]>> {
    const results: Record<string, DatePoint[]> = {};

    await Promise.all(
      symbols.map(async (sym) => {
        try {
          const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
            sym
          )}?range=2y&interval=1d`;
          const response = await axios.get(url, {
            headers: {
              'User-Agent': this.userAgent,
              Accept: 'application/json',
            },
            timeout: 15000,
          });

          const result = response.data?.chart?.result?.[0];
          if (!result || !result.timestamp || !result.indicators?.quote?.[0]?.close) {
            logger.warn(`Empty Yahoo Finance data for macro symbol ${sym}`);
            results[sym] = this.cachedYahooData[sym] || [];
            return;
          }

          const timestamps: number[] = result.timestamp;
          const closes: (number | null)[] = result.indicators.quote[0].close;
          const points: DatePoint[] = [];

          for (let i = 0; i < timestamps.length; i++) {
            const close = closes[i];
            if (close !== null && close !== undefined && !isNaN(close) && close > 0) {
              const dateStr = new Date(timestamps[i] * 1000).toISOString().split('T')[0];
              points.push({
                date: dateStr,
                close: Number(close.toFixed(4)),
              });
            }
          }

          if (points.length > 0) {
            this.cachedYahooData[sym] = points;
          }
          results[sym] = points.length > 0 ? points : (this.cachedYahooData[sym] || []);
        } catch (error: any) {
          logger.warn(`Failed to fetch Yahoo macro series for "${sym}": ${error.message}`);
          results[sym] = this.cachedYahooData[sym] || [];
        }
      })
    );

    return results;
  }

  /**
   * Fetch 2 years of daily ICE BofA US High Yield Index Option-Adjusted Spread from FRED CSV
   */
  public async fetchFredHYSpread(): Promise<DatePoint[]> {
    const url = 'https://fred.stlouisfed.org/graph/fredgraph.csv?id=BAMLH0A0HYM2';
    try {
      const response = await axios.get(url, {
        headers: {
          'User-Agent': this.userAgent,
        },
        timeout: 10000,
      });

      const csvText: string = response.data;
      const lines = csvText.split(/\r?\n/);
      const points: DatePoint[] = [];

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const [dateStr, valStr] = line.split(',');
        if (!dateStr || !valStr || valStr.trim() === '.') continue;

        const numVal = parseFloat(valStr.trim());
        if (!isNaN(numVal) && numVal > 0) {
          points.push({
            date: dateStr.trim(),
            close: Number(numVal.toFixed(4)),
          });
        }
      }

      if (points.length > 0) {
        this.cachedFredData = points;
      }
      return points.length > 0 ? points : this.cachedFredData;
    } catch (error: any) {
      logger.warn(`Failed to fetch FRED High Yield Spread series: ${error.message}`);
      return this.cachedFredData;
    }
  }

  /**
   * Merge multi-series dates into a unified calendar with controlled forward-fill (ffill limit: 5)
   */
  public alignAndForwardFillSeries(
    datasets: Record<string, DatePoint[]>,
    forwardFillLimit = 5
  ): { dates: string[]; aligned: Record<string, number[]> } {
    const dateSet = new Set<string>();
    for (const key of Object.keys(datasets)) {
      for (const pt of datasets[key]) {
        dateSet.add(pt.date);
      }
    }

    const sortedDates = Array.from(dateSet).sort();
    const aligned: Record<string, number[]> = {};

    for (const key of Object.keys(datasets)) {
      aligned[key] = [];
      const map = new Map<string, number>();
      for (const pt of datasets[key]) {
        map.set(pt.date, pt.close);
      }

      let lastKnown: number | null = null;
      let consecutiveFills = 0;

      for (const d of sortedDates) {
        if (map.has(d)) {
          lastKnown = map.get(d)!;
          consecutiveFills = 0;
        } else if (lastKnown !== null) {
          consecutiveFills++;
        }

        if (lastKnown !== null && consecutiveFills <= forwardFillLimit) {
          aligned[key].push(lastKnown);
        } else {
          // If series hasn't started yet or exceeded fill limit
          const fallbackVal = lastKnown !== null ? lastKnown : (datasets[key][0]?.close || 0);
          aligned[key].push(fallbackVal);
        }
      }
    }

    return { dates: sortedDates, aligned };
  }

  /**
   * Compute quantitative indicators (SMA 50, SMA 200, Distance %, Rolling 252-day Z-Score, Regime)
   */
  public computeSeriesMetrics(
    key: string,
    name: string,
    category: MacroCategory,
    description: string,
    series: number[]
  ): MacroIndicatorSummary {
    if (!series || series.length === 0) {
      return {
        key,
        name,
        category,
        description,
        latestValue: 0,
        sma50: null,
        sma200: null,
        distSma200Pct: null,
        zScore1Y: null,
        regime: 'NEUTRAL',
        regimeVariant: 'slate',
        sparkline: [],
      };
    }

    const latestValue = series[series.length - 1];

    // SMA 50
    let sma50: number | null = null;
    if (series.length >= 50) {
      const slice50 = series.slice(-50);
      const sum50 = slice50.reduce((acc, v) => acc + v, 0);
      sma50 = Number((sum50 / 50).toFixed(4));
    }

    // SMA 200
    let sma200: number | null = null;
    let distSma200Pct: number | null = null;
    if (series.length >= 200) {
      const slice200 = series.slice(-200);
      const sum200 = slice200.reduce((acc, v) => acc + v, 0);
      sma200 = Number((sum200 / 200).toFixed(4));

      if (sma200 > 0) {
        distSma200Pct = Number((((latestValue - sma200) / sma200) * 100).toFixed(2));
      }
    }

    // Rolling 252-Day Z-Score (1 Year Trading Window)
    let zScore1Y: number | null = null;
    const windowSize = Math.min(252, series.length);
    if (windowSize >= 30) {
      const windowSlice = series.slice(-windowSize);
      const mean = windowSlice.reduce((acc, v) => acc + v, 0) / windowSize;
      const variance =
        windowSlice.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / windowSize;
      const stdDev = Math.sqrt(variance);

      if (stdDev > 0) {
        zScore1Y = Number(((latestValue - mean) / stdDev).toFixed(2));
      } else {
        zScore1Y = 0;
      }
    }

    // Dynamic Regime Classification
    const regimeStatus = classifyMacroRegime(key, zScore1Y);

    // Filter last 30 data points for mini sparklines without flat duplicates
    const sparklineSlice = series.slice(-30);
    const sparkline = sparklineSlice.map((v) => Number(v.toFixed(4)));

    return {
      key,
      name,
      category,
      description,
      latestValue: Number(latestValue.toFixed(4)),
      sma50,
      sma200,
      distSma200Pct,
      zScore1Y,
      regime: regimeStatus.label,
      regimeVariant: regimeStatus.variant,
      sparkline,
    };
  }

  /**
   * Calculate complete Macroeconomic Dashboard payload
   */
  public async calculateMacroDashboard(): Promise<MacroDashboardPayload> {
    logger.info('Calculating global macro intelligence indicators...');

    const yahooSymbols = ['DX-Y.NYB', '^VIX', 'HG=F', 'GC=F', '^DJI', '^GSPC'];
    const [yahooData, fredData] = await Promise.all([
      this.fetchYahooSeries(yahooSymbols),
      this.fetchFredHYSpread(),
    ]);

    const datasets: Record<string, DatePoint[]> = {
      ...yahooData,
      HY_OAS: fredData,
    };

    // Align all datasets on a single continuous calendar index
    const { aligned } = this.alignAndForwardFillSeries(datasets, 5);

    const dxySeries = aligned['DX-Y.NYB'] || [];
    const vixSeries = aligned['^VIX'] || [];
    const copperSeries = aligned['HG=F'] || [];
    const goldSeries = aligned['GC=F'] || [];
    const djiSeries = aligned['^DJI'] || [];
    const gspcSeries = aligned['^GSPC'] || [];
    const hySeries = aligned['HY_OAS'] || [];

    // Derive Macro Ratios (Scaled where appropriate)
    const length = goldSeries.length;
    const copperGoldSeries: number[] = [];
    const dowGoldSeries: number[] = [];
    const sp500GoldSeries: number[] = [];

    for (let i = 0; i < length; i++) {
      const g = goldSeries[i] || 1;
      const c = copperSeries[i] || 0;
      const dji = djiSeries[i] || 0;
      const sp = gspcSeries[i] || 0;

      // Standard financial convention scales Copper/Gold ratio by multiplying by 1,000 (e.g. 1.40)
      copperGoldSeries.push(g > 0 ? (c / g) * 1000 : 0);
      dowGoldSeries.push(g > 0 ? dji / g : 0);
      sp500GoldSeries.push(g > 0 ? sp / g : 0);
    }

    const metrics: MacroIndicatorSummary[] = [
      // 1. DXY (US Dollar Index)
      this.computeSeriesMetrics(
        'DXY',
        'US Dollar Index (DXY)',
        'CURRENCY',
        'Tracks the USD strength relative to a basket of major currencies. Key driver of global liquidity, cross-border debt pressure, and commodity pricing.',
        dxySeries
      ),

      // 2. VIX (Volatility Index)
      this.computeSeriesMetrics(
        'VIX',
        'CBOE Volatility Index (VIX)',
        'VOLATILITY',
        'Implied 30-day volatility of the S&P 500. Known as the market fear gauge, elevated levels reflect acute risk-off sentiment and hedging demand.',
        vixSeries
      ),

      // 3. High Yield Credit Spread (FRED OAS)
      this.computeSeriesMetrics(
        'HY_OAS',
        'US High Yield Credit Spread (OAS)',
        'CREDIT',
        'Option-adjusted spread of below-investment-grade corporate bonds over US Treasuries. Benchmark measure of corporate default risk and financial tightness.',
        hySeries
      ),

      // 4. Copper / Gold Ratio (Scaled x1000)
      this.computeSeriesMetrics(
        'COPPER_GOLD',
        'Copper / Gold Ratio (x1000)',
        'RATIO',
        'Ratio of industrial copper ($/lb) to safe-haven gold ($/oz) scaled by 1,000. Leading barometer of global economic growth, manufacturing expansion, and risk appetite.',
        copperGoldSeries
      ),

      // 5. Dow / Gold Ratio
      this.computeSeriesMetrics(
        'DOW_GOLD',
        'Dow Jones / Gold Ratio',
        'RATIO',
        'Ounces of gold required to buy 1 unit of the Dow Jones. Measures equity valuation in terms of real monetary reserves rather than fiat currency.',
        dowGoldSeries
      ),

      // 6. S&P 500 / Gold Ratio
      this.computeSeriesMetrics(
        'SP500_GOLD',
        'S&P 500 / Gold Ratio',
        'RATIO',
        'Ounces of gold required to buy 1 unit of the S&P 500. Long-term cycle indicator of financial assets vs. tangible monetary store of value.',
        sp500GoldSeries
      ),
    ];

    const payload: MacroDashboardPayload = {
      lastUpdated: new Date().toISOString(),
      metrics,
    };

    this.cachedDashboard = payload;
    this.lastFetchedTime = Date.now();
    logger.info('Global macro dashboard computed and cached successfully.');

    return payload;
  }

  /**
   * Get cached or fresh macro dashboard payload
   */
  public async getDashboard(forceRefresh = false): Promise<MacroDashboardPayload> {
    const isFresh =
      this.cachedDashboard && Date.now() - this.lastFetchedTime < this.CACHE_TTL_MS;

    if (!forceRefresh && isFresh) {
      return this.cachedDashboard!;
    }

    try {
      return await this.calculateMacroDashboard();
    } catch (error: any) {
      logger.error(`Error calculating macro dashboard: ${error.message}`);
      if (this.cachedDashboard) {
        logger.warn('Falling back to previously cached macro dashboard payload.');
        return this.cachedDashboard;
      }
      throw error;
    }
  }

  /**
   * Extract typed DynamicMacroReportPayload from live dashboard metrics (SSOT)
   */
  public extractMacroReportPayload(metrics: MacroIndicatorSummary[]): DynamicMacroReportPayload {
    const map = new Map<string, MacroIndicatorSummary>();
    for (const m of metrics) {
      map.set(m.key, m);
    }

    const getMetricValues = (key: string, altKey?: string) => {
      const item = map.get(key) || (altKey ? map.get(altKey) : undefined);
      return {
        value: item?.latestValue ?? 0,
        zScore: item?.zScore1Y ?? 0,
        distSma200: item?.distSma200Pct ?? 0,
      };
    };

    return {
      dxy: getMetricValues('DXY'),
      vix: getMetricValues('VIX'),
      hyOas: getMetricValues('HY_OAS'),
      copperGold: getMetricValues('COPPER_GOLD', 'Copper_Gold_Ratio'),
      dowGold: getMetricValues('DOW_GOLD', 'Dow_Gold_Ratio'),
      sp500Gold: getMetricValues('SP500_GOLD', 'SP500_Gold_Ratio'),
    };
  }

  /**
   * Get live populated Global Macro Prompt (SSOT)
   */
  public async getMacroPrompt(): Promise<string> {
    const dashboard = await this.getDashboard(false);
    const payload = this.extractMacroReportPayload(dashboard.metrics);
    return buildGlobalMacroPrompt(payload);
  }

  /**
   * Generate dedicated AI Global Macro synthesis report for Macro Health Dashboard
   */
  public async generateMacroReport(customPrompt?: string): Promise<{
    markdown: string;
    modelUsed: string;
    prompt: string;
  }> {
    const dashboard = await this.getDashboard(false);
    const payload = this.extractMacroReportPayload(dashboard.metrics);
    const prompt =
      customPrompt && customPrompt.trim().length > 10
        ? customPrompt.trim()
        : buildGlobalMacroPrompt(payload);

    const { markdown, modelUsed } = await geminiService.generateMacroReport(
      payload,
      customPrompt
    );

    return { markdown, modelUsed, prompt };
  }
}

export const macroAnalyticsService = new MacroAnalyticsService();
