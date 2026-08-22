import axios from 'axios';
import { AssetType, MarketQuote } from '../types/index.js';
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
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(cleanSymbol)}?interval=1d&range=5d`;

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
    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(
      cleanQuery
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
      cleanSymbol
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
}

export const marketDataService = new MarketDataService();
