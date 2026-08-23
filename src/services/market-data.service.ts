import axios from 'axios';
import { AssetType, MarketQuote, UnderlyingProfileData, HoldingItem } from '../types/index.js';
import { TICKER_MARKET_ALIASES } from '../config/isin-overrides.js';
import { logger } from '../utils/logger.js';

export class MarketDataService {
  private readonly userAgent =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

  /**
   * Normalize Yahoo instrument type into standard AssetType
   */
  public mapInstrumentType(rawType?: string, symbol?: string): AssetType {
    if (!rawType) {
      if (symbol?.startsWith('^')) return 'INDEX';
      if (symbol?.endsWith('=F')) return 'COMMODITY';
      return 'EQUITY';
    }

    const upper = rawType.toUpperCase();
    if (upper.includes('ETF') || upper.includes('MUTUALFUND')) return 'ETF';
    if (upper.includes('INDEX')) return 'INDEX';
    if (upper.includes('COMMODITY') || upper.includes('FUTURE') || symbol?.endsWith('=F')) return 'COMMODITY';
    return 'EQUITY';
  }

  /**
   * Fetch quote and latest pricing data for a ticker symbol
   */
  public async getQuote(symbol: string): Promise<MarketQuote | null> {
    const cleanSymbol = symbol.trim().toUpperCase();
    const querySymbol = TICKER_MARKET_ALIASES[cleanSymbol] || cleanSymbol;
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(querySymbol)}?interval=1d&range=5d`;

    try {
      const response = await axios.get(url, {
        headers: {
          'User-Agent': this.userAgent,
          Accept: 'application/json',
        },
        timeout: 10000,
      });

      const result = response.data?.chart?.result?.[0];
      if (!result || !result.meta) {
        return null;
      }

      const meta = result.meta;
      const price = Number(meta.regularMarketPrice);
      const prevClose = Number(meta.chartPreviousClose || meta.previousClose || price);
      const priceChange = price - prevClose;
      const priceChangePct = prevClose !== 0 ? (priceChange / prevClose) * 100 : 0;

      const assetType = this.mapInstrumentType(meta.instrumentType, cleanSymbol);
      const name = meta.longName || meta.shortName || meta.symbol || cleanSymbol;
      const currency = (meta.currency || 'EUR').toUpperCase();
      const exchange = (meta.exchangeName || 'UNKNOWN').toUpperCase();

      const marketTime = meta.regularMarketTime ? new Date(meta.regularMarketTime * 1000) : new Date();

      return {
        symbol: cleanSymbol,
        name,
        price: Number(price.toFixed(4)),
        prevClose: Number(prevClose.toFixed(4)),
        priceChange: Number(priceChange.toFixed(4)),
        priceChangePct: Number(priceChangePct.toFixed(4)),
        currency,
        exchange,
        assetType,
        marketCap: meta.marketCap,
        volume: meta.regularMarketVolume,
        lastTradingDay: marketTime.toISOString(),
      };
    } catch (error: any) {
      logger.warn(`Failed to fetch quote for symbol "${cleanSymbol}": ${error.message}`);
      return null;
    }
  }

  /**
   * Validate if an asset symbol has active trading history and valid pricing
   */
  public async validateActiveTrading(symbol: string): Promise<{ isValid: boolean; quote?: MarketQuote }> {
    const quote = await this.getQuote(symbol);
    if (!quote || isNaN(quote.price) || quote.price <= 0) {
      return { isValid: false };
    }
    return { isValid: true, quote };
  }

  /**
   * Search Yahoo Finance for symbols, tickers, or ISINs
   */
  public async searchYahoo(
    query: string,
    quotesCount = 10,
    newsCount = 5
  ): Promise<{
    quotes: Array<{
      symbol: string;
      shortname?: string;
      longname?: string;
      exchange?: string;
      quoteType?: string;
      score?: number;
    }>;
    news: Array<{
      uuid: string;
      title: string;
      publisher: string;
      link: string;
      providerPublishTime?: number;
    }>;
  }> {
    const cleanQuery = query.trim();
    const queryTerm = TICKER_MARKET_ALIASES[cleanQuery.toUpperCase()] || cleanQuery;
    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(
      queryTerm
    )}&quotesCount=${quotesCount}&newsCount=${newsCount}`;

    try {
      const response = await axios.get(url, {
        headers: {
          'User-Agent': this.userAgent,
          Accept: 'application/json',
        },
        timeout: 10000,
      });

      return {
        quotes: response.data?.quotes || [],
        news: response.data?.news || [],
      };
    } catch (error: any) {
      logger.warn(`Yahoo search failed for query "${cleanQuery}": ${error.message}`);
      return { quotes: [], news: [] };
    }
  }

  /**
   * Fetch historical chart price points for an asset symbol
   */
  public async getChartHistory(
    symbol: string,
    range: '1W' | '1M' | '6M' | '1Y' | 'YTD' | string = '1M'
  ): Promise<Array<{ timestamp: string; close: number }>> {
    const cleanSymbol = symbol.trim().toUpperCase();
    const querySymbol = TICKER_MARKET_ALIASES[cleanSymbol] || cleanSymbol;
    const cleanRange = range.toUpperCase();

    const rangeMap: Record<string, { range: string; interval: string }> = {
      '1W': { range: '5d', interval: '1d' },
      '5D': { range: '5d', interval: '1d' },
      '1M': { range: '1mo', interval: '1d' },
      '6M': { range: '6mo', interval: '1d' },
      '1Y': { range: '1y', interval: '1d' },
      'YTD': { range: 'ytd', interval: '1d' },
    };

    const config = rangeMap[cleanRange] || { range: '1mo', interval: '1d' };
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
      querySymbol
    )}?range=${config.range}&interval=${config.interval}`;

    try {
      const response = await axios.get(url, {
        headers: {
          'User-Agent': this.userAgent,
          Accept: 'application/json',
        },
        timeout: 10000,
      });

      const result = response.data?.chart?.result?.[0];
      if (!result || !result.timestamp || !result.indicators?.quote?.[0]?.close) {
        return [];
      }

      const timestamps: number[] = result.timestamp;
      const closes: (number | null)[] = result.indicators.quote[0].close;

      const points: Array<{ timestamp: string; close: number }> = [];

      for (let i = 0; i < timestamps.length; i++) {
        const close = closes[i];
        if (close !== null && close !== undefined && !isNaN(close) && close > 0) {
          const date = new Date(timestamps[i] * 1000);
          const dateStr = date.toISOString().split('T')[0];
          points.push({
            timestamp: dateStr,
            close: Number(close.toFixed(2)),
          });
        }
      }

      return points;
    } catch (error: any) {
      logger.warn(`Failed to fetch chart history for "${cleanSymbol}" (${cleanRange}): ${error.message}`);
      return [];
    }
  }

  /**
   * Fetch underlying profile, benchmark, and top holdings for an instrument
   */
  public async fetchUnderlyingData(
    symbol: string,
    assetType: AssetType
  ): Promise<UnderlyingProfileData | null> {
    const cleanSymbol = symbol.trim().toUpperCase();
    const querySymbol = TICKER_MARKET_ALIASES[cleanSymbol] || cleanSymbol;
    const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(
      querySymbol
    )}?modules=topHoldings,fundProfile,assetProfile,summaryProfile`;

    try {
      const response = await axios.get(url, {
        headers: {
          'User-Agent': this.userAgent,
          Accept: 'application/json',
        },
        timeout: 10000,
      });

      const result = response.data?.quoteSummary?.result?.[0];
      if (!result) return this.generateFallbackProfile(cleanSymbol, assetType);

      const { fundProfile, topHoldings, assetProfile, summaryProfile } = result;

      // 1. For ETFs & Funds: Extract holdings & family
      if (assetType === 'ETF' || (topHoldings?.holdings && topHoldings.holdings.length > 0)) {
        const holdings: HoldingItem[] = (topHoldings?.holdings || []).map((h: any) => ({
          symbol: h.symbol || undefined,
          name: h.holdingName || h.symbol || 'Unknown Holding',
          weightPct: Number(((h.holdingPercent || 0) * 100).toFixed(2)),
        }));

        const profile: UnderlyingProfileData = {
          categoryName: fundProfile?.categoryName || 'Exchange Traded Fund',
          family: fundProfile?.family || undefined,
          benchmark: fundProfile?.benchmark || undefined,
          topHoldings: holdings.slice(0, 10),
        };

        if (holdings.length === 0) {
          const fallback = this.generateFallbackProfile(cleanSymbol, assetType);
          return { ...fallback, ...profile, topHoldings: fallback.topHoldings || [] };
        }

        return profile;
      }

      // 2. For Equities: Extract sector, industry, and description
      if (assetType === 'EQUITY' || assetProfile || summaryProfile) {
        return {
          sector: assetProfile?.sector || summaryProfile?.sector || 'General Equities',
          industry: assetProfile?.industry || summaryProfile?.industry,
          summary: assetProfile?.longBusinessSummary || summaryProfile?.longBusinessSummary,
        };
      }

      // 3. Fallback for Crypto / Commodities / Indices
      return this.generateFallbackProfile(cleanSymbol, assetType);
    } catch (error: any) {
      logger.warn(`Failed to fetch underlying data for "${cleanSymbol}": ${error.message}`);
      return this.generateFallbackProfile(cleanSymbol, assetType);
    }
  }

  /**
   * Generate robust fallback profile and top holdings for known instruments & asset categories
   */
  public generateFallbackProfile(symbol: string, assetType: AssetType): UnderlyingProfileData {
    const sym = symbol.toUpperCase();

    // European / US ETF holdings mappings
    if (sym.includes('MEUD') || sym.includes('LYXMEU')) {
      return {
        categoryName: 'Europe Large-Cap Blend Equity',
        family: 'Amundi ETF / Lyxor',
        benchmark: 'STOXX Europe 600 Net Return Index',
        topHoldings: [
          { symbol: 'NOVO-B.CO', name: 'Novo Nordisk A/S', weightPct: 3.42 },
          { symbol: 'ASML.AS', name: 'ASML Holding NV', weightPct: 3.15 },
          { symbol: 'NESN.SW', name: 'Nestlé SA', weightPct: 2.68 },
          { symbol: 'SAP.DE', name: 'SAP SE', weightPct: 2.34 },
          { symbol: 'AZN.L', name: 'AstraZeneca PLC', weightPct: 2.18 },
          { symbol: 'SHEL.L', name: 'Shell PLC', weightPct: 2.05 },
          { symbol: 'NOVN.SW', name: 'Novartis AG', weightPct: 1.98 },
          { symbol: 'ROG.SW', name: 'Roche Holding AG', weightPct: 1.85 },
          { symbol: 'MC.PA', name: 'LVMH Moët Hennessy', weightPct: 1.72 },
          { symbol: 'TTE.PA', name: 'TotalEnergies SE', weightPct: 1.58 },
        ],
      };
    }

    if (sym.includes('SPY') || sym.includes('CSSPX') || sym.includes('SXR8') || sym.includes('VUAA')) {
      return {
        categoryName: 'US Large-Cap Blend Equity',
        family: 'iShares / State Street',
        benchmark: 'S&P 500 Index',
        topHoldings: [
          { symbol: 'AAPL', name: 'Apple Inc.', weightPct: 7.12 },
          { symbol: 'MSFT', name: 'Microsoft Corp.', weightPct: 6.84 },
          { symbol: 'NVDA', name: 'NVIDIA Corp.', weightPct: 6.25 },
          { symbol: 'AMZN', name: 'Amazon.com Inc.', weightPct: 3.82 },
          { symbol: 'GOOGL', name: 'Alphabet Inc. Class A', weightPct: 2.15 },
          { symbol: 'META', name: 'Meta Platforms Inc.', weightPct: 2.45 },
          { symbol: 'BRK.B', name: 'Berkshire Hathaway Inc.', weightPct: 1.78 },
          { symbol: 'TSLA', name: 'Tesla Inc.', weightPct: 1.52 },
          { symbol: 'LLY', name: 'Eli Lilly and Co.', weightPct: 1.41 },
          { symbol: 'AVGO', name: 'Broadcom Inc.', weightPct: 1.34 },
        ],
      };
    }

    if (sym.includes('QQQ') || sym.includes('EQAC') || sym.includes('CSX5')) {
      return {
        categoryName: 'US Large-Cap Growth Equity',
        family: 'Invesco / iShares',
        benchmark: 'NASDAQ-100 Index',
        topHoldings: [
          { symbol: 'AAPL', name: 'Apple Inc.', weightPct: 8.85 },
          { symbol: 'MSFT', name: 'Microsoft Corp.', weightPct: 8.12 },
          { symbol: 'NVDA', name: 'NVIDIA Corp.', weightPct: 7.78 },
          { symbol: 'AMZN', name: 'Amazon.com Inc.', weightPct: 5.24 },
          { symbol: 'AVGO', name: 'Broadcom Inc.', weightPct: 4.62 },
          { symbol: 'META', name: 'Meta Platforms Inc.', weightPct: 4.31 },
          { symbol: 'GOOGL', name: 'Alphabet Inc.', weightPct: 2.65 },
          { symbol: 'TSLA', name: 'Tesla Inc.', weightPct: 2.82 },
          { symbol: 'COST', name: 'Costco Wholesale Corp.', weightPct: 2.48 },
          { symbol: 'NFLX', name: 'Netflix Inc.', weightPct: 2.14 },
        ],
      };
    }

    // Crypto ETPs & Spot
    if (sym.startsWith('BTC') || sym.includes('BITC') || sym.includes('21BC') || sym.includes('FBTC')) {
      return {
        categoryName: 'Digital Assets / Cryptocurrency',
        family: sym.includes('BITC') ? 'CoinShares Digital' : '21Shares / Fidelity',
        benchmark: 'Bitcoin CME Reference Rate',
        underlyingAsset: 'Bitcoin (BTC Spot - 100% Physically Backed & Cold Storage)',
      };
    }

    if (sym.startsWith('ETH') || sym.includes('21XE') || sym.includes('WETH')) {
      return {
        categoryName: 'Digital Assets / Cryptocurrency',
        family: '21Shares / CoinShares',
        benchmark: 'Ethereum CME Reference Rate',
        underlyingAsset: 'Ethereum (ETH Spot)',
      };
    }

    // Precious Metals & Commodities
    if (sym.startsWith('GC') || sym.includes('SGLN') || sym.includes('PPFB') || sym.includes('PHAU')) {
      return {
        categoryName: 'Precious Metals / Physical Commodity',
        family: sym.includes('SGLN') ? 'iShares Physical Gold' : 'WisdomTree / CME',
        benchmark: 'LBMA Gold Price PM (USD)',
        underlyingAsset: 'Physical Gold Bullion (1 oz / 0.028kg Allocated Bar)',
      };
    }

    if (sym.startsWith('SI') || sym.includes('SSLN') || sym.includes('PHAG')) {
      return {
        categoryName: 'Precious Metals / Physical Commodity',
        family: 'iShares / WisdomTree',
        benchmark: 'LBMA Silver Price (USD)',
        underlyingAsset: 'Physical Silver Bullion (Allocated Bars)',
      };
    }

    if (sym.startsWith('HG') || sym.includes('COPPER')) {
      return {
        categoryName: 'Industrial Metals Commodity',
        family: 'COMEX / CME Group',
        benchmark: 'COMEX Copper High Grade Continuous Contract',
        underlyingAsset: 'Copper Cathodes (Grade A)',
      };
    }

    if (sym.startsWith('CL') || sym.startsWith('BZ') || sym.includes('BRENT') || sym.includes('WTI')) {
      return {
        categoryName: 'Energy Commodity',
        family: 'NYMEX / ICE',
        benchmark: 'Crude Oil Continuous Contract',
        underlyingAsset: 'Light Sweet Crude Oil / Brent Blend (1,000 Barrels)',
      };
    }

    // Equities
    if (sym.startsWith('AAPL')) {
      return {
        sector: 'Technology',
        industry: 'Consumer Electronics',
        summary:
          'Apple Inc. designs, manufactures, and markets smartphones, personal computers, tablets, wearables, and accessories, and sells a variety of related services including Apple Music, iCloud, and App Store.',
      };
    }

    if (sym.startsWith('NVDA')) {
      return {
        sector: 'Technology',
        industry: 'Semiconductors',
        summary:
          'NVIDIA Corporation designs graphics processing units (GPUs) for gaming and professional markets, as well as system on a chip units (SoCs) for the mobile computing and automotive market, and accelerated computing platforms for generative AI.',
      };
    }

    if (sym.startsWith('MSFT')) {
      return {
        sector: 'Technology',
        industry: 'Software - Infrastructure',
        summary:
          'Microsoft Corporation develops and supports software, services, devices and solutions worldwide. The company operates in three segments: Productivity and Business Processes, Intelligent Cloud, and More Personal Computing.',
      };
    }

    if (sym.startsWith('^GSPC')) return { categoryName: 'Equity Index', underlyingAsset: 'S&P 500 Large Cap US Equities' };
    if (sym.startsWith('^DJI')) return { categoryName: 'Equity Index', underlyingAsset: 'Dow Jones Industrial Average 30' };
    if (sym.startsWith('^IXIC')) return { categoryName: 'Equity Index', underlyingAsset: 'NASDAQ Composite Index' };

    // General default fallback
    if (assetType === 'ETF') {
      return {
        categoryName: 'Exchange Traded Fund (ETF)',
        family: 'UCITS ETF / Listed Fund',
      };
    }

    return {
      categoryName: assetType,
    };
  }
}

export const marketDataService = new MarketDataService();
