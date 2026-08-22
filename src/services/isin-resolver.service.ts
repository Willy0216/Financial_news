import axios from 'axios';
import { config } from '../config/env.js';
import { ISINCandidate, ResolutionResponse, AssetType } from '../types/index.js';
import { marketDataService } from './market-data.service.js';
import { logger } from '../utils/logger.js';

// OpenFIGI exchange code to Yahoo Finance ticker suffix mapping
const OPENFIGI_EXCHANGE_MAP: Record<string, { suffix: string; exchangeName: string }> = {
  IM: { suffix: '.MI', exchangeName: 'MIL' }, // Milan (Borsa Italiana)
  MI: { suffix: '.MI', exchangeName: 'MIL' },
  GY: { suffix: '.DE', exchangeName: 'GER' }, // XETRA Germany
  GR: { suffix: '.DE', exchangeName: 'GER' },
  GE: { suffix: '.DE', exchangeName: 'GER' },
  GF: { suffix: '.F', exchangeName: 'FRA' },  // Frankfurt
  LN: { suffix: '.L', exchangeName: 'LSE' },  // London Stock Exchange
  FP: { suffix: '.PA', exchangeName: 'PAR' }, // Euronext Paris
  NA: { suffix: '.AS', exchangeName: 'AMS' }, // Euronext Amsterdam
  BB: { suffix: '.BR', exchangeName: 'BRU' }, // Euronext Brussels
  SM: { suffix: '.MC', exchangeName: 'MCE' }, // Bolsa de Madrid
  SW: { suffix: '.SW', exchangeName: 'SWX' }, // SIX Swiss Exchange
  EB: { suffix: '.SW', exchangeName: 'SWX' },
  US: { suffix: '', exchangeName: 'NMS' },    // United States (NASDAQ/NYSE)
  UA: { suffix: '', exchangeName: 'NMS' },
  UN: { suffix: '', exchangeName: 'NYQ' },
  UR: { suffix: '', exchangeName: 'NMS' },
  UQ: { suffix: '', exchangeName: 'NMS' },
};

export class IsinResolverService {
  private readonly isinRegex = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/i;

  public isIsin(input: string): boolean {
    return this.isinRegex.test(input.trim());
  }

  /**
   * Query OpenFIGI API for candidate mappings of an ISIN
   */
  public async fetchOpenFigiCandidates(isin: string): Promise<ISINCandidate[]> {
    const cleanIsin = isin.trim().toUpperCase();
    const url = 'https://api.openfigi.com/v3/mapping';
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (config.openFigiApiKey) {
      headers['X-OPENFIGI-APIKEY'] = config.openFigiApiKey;
    }

    try {
      const response = await axios.post(
        url,
        [{ idType: 'ID_ISIN', idValue: cleanIsin }],
        { headers, timeout: 10000 }
      );

      const items = response.data?.[0]?.data;
      if (!Array.isArray(items) || items.length === 0) {
        return [];
      }

      const candidates: ISINCandidate[] = [];

      for (const item of items) {
        const rawTicker = item.ticker;
        const exchCode = (item.exchCode || '').toUpperCase();
        const mapping = OPENFIGI_EXCHANGE_MAP[exchCode];

        let yahooSymbol = rawTicker;
        let exchangeName = exchCode;

        if (mapping) {
          yahooSymbol = `${rawTicker}${mapping.suffix}`;
          exchangeName = mapping.exchangeName;
        }

        const assetType: AssetType =
          item.securityType?.toUpperCase().includes('ETF') || item.securityType2?.toUpperCase().includes('ETF')
            ? 'ETF'
            : 'EQUITY';

        candidates.push({
          symbol: yahooSymbol,
          name: item.name || rawTicker,
          exchange: exchangeName,
          currency: 'EUR',
          assetType,
          source: 'OPENFIGI',
          figi: item.figi,
          micCode: item.micCode,
          hasActiveTradingHistory: false,
        });
      }

      return candidates;
    } catch (error: any) {
      logger.warn(`OpenFIGI lookup error for ISIN "${cleanIsin}": ${error.message}`);
      return [];
    }
  }

  /**
   * Search Yahoo Finance for candidates by ISIN or query
   */
  public async fetchYahooCandidates(query: string): Promise<ISINCandidate[]> {
    const { quotes } = await marketDataService.searchYahoo(query, 10, 0);
    const candidates: ISINCandidate[] = [];

    for (const q of quotes) {
      if (!q.symbol) continue;

      const assetType = marketDataService.mapInstrumentType(q.quoteType, q.symbol);
      candidates.push({
        symbol: q.symbol.toUpperCase(),
        name: q.longname || q.shortname || q.symbol,
        exchange: (q.exchange || 'UNKNOWN').toUpperCase(),
        currency: 'EUR',
        assetType,
        source: 'YAHOO_SEARCH',
        hasActiveTradingHistory: false,
        score: q.score,
      });
    }

    return candidates;
  }

  /**
   * Resolve an input (ISIN or direct Ticker) into validated candidates
   */
  public async resolve(input: string): Promise<ResolutionResponse> {
    const cleanInput = input.trim().toUpperCase();

    if (!cleanInput) {
      return { query: input, resolved: false, candidates: [], error: 'Input query cannot be empty.' };
    }

    const isIsinInput = this.isIsin(cleanInput);
    const rawCandidates: ISINCandidate[] = [];

    if (isIsinInput) {
      // 1. Try OpenFIGI
      const openFigiCandidates = await this.fetchOpenFigiCandidates(cleanInput);
      rawCandidates.push(...openFigiCandidates);

      // 2. Try Yahoo Finance Search fallback
      const yahooCandidates = await this.fetchYahooCandidates(cleanInput);
      rawCandidates.push(...yahooCandidates);
    } else {
      // Direct ticker or symbol search
      const directValidation = await marketDataService.validateActiveTrading(cleanInput);
      if (directValidation.isValid && directValidation.quote) {
        rawCandidates.push({
          symbol: directValidation.quote.symbol,
          name: directValidation.quote.name,
          exchange: directValidation.quote.exchange,
          currency: directValidation.quote.currency,
          assetType: directValidation.quote.assetType,
          source: 'DIRECT_TICKER',
          hasActiveTradingHistory: true,
          lastPrice: directValidation.quote.price,
        });
      }

      // Also search Yahoo for symbol suggestions
      const searchCandidates = await this.fetchYahooCandidates(cleanInput);
      rawCandidates.push(...searchCandidates);
    }

    // Deduplicate candidates by symbol
    const candidateMap = new Map<string, ISINCandidate>();
    for (const c of rawCandidates) {
      const sym = c.symbol.toUpperCase();
      if (!candidateMap.has(sym)) {
        candidateMap.set(sym, c);
      }
    }

    const uniqueCandidates = Array.from(candidateMap.values());
    const validatedCandidates: ISINCandidate[] = [];

    // Validate active trading for top candidates in parallel
    await Promise.all(
      uniqueCandidates.slice(0, 8).map(async (cand) => {
        const check = await marketDataService.validateActiveTrading(cand.symbol);
        if (check.isValid && check.quote) {
          cand.hasActiveTradingHistory = true;
          cand.lastPrice = check.quote.price;
          cand.currency = check.quote.currency;
          cand.exchange = check.quote.exchange;
          cand.assetType = check.quote.assetType;

          // Preserve clean name from OpenFIGI / Yahoo Search if available
          const existingName =
            cand.name && cand.name.toUpperCase() !== cand.symbol.toUpperCase() ? cand.name : null;
          cand.name = existingName || check.quote.name || cand.symbol;

          validatedCandidates.push(cand);
        }
      })
    );

    if (validatedCandidates.length === 0) {
      return {
        query: cleanInput,
        resolved: false,
        candidates: [],
        error: isIsinInput
          ? `Could not find an actively traded instrument for ISIN "${cleanInput}".`
          : `No active market quote found for ticker "${cleanInput}".`,
      };
    }

    // Prioritize candidates:
    // If European ISIN, rank .DE / .MI / .L / .PA first.
    // If US ISIN, rank US tickers first.
    const isEuropean = isIsinInput && ['IE', 'LU', 'DE', 'IT', 'FR', 'NL', 'ES'].some((p) => cleanInput.startsWith(p));
    const isUS = isIsinInput && cleanInput.startsWith('US');

    validatedCandidates.sort((a, b) => {
      if (isEuropean) {
        const aEur = a.symbol.endsWith('.DE') || a.symbol.endsWith('.MI') || a.symbol.endsWith('.L') || a.symbol.endsWith('.PA');
        const bEur = b.symbol.endsWith('.DE') || b.symbol.endsWith('.MI') || b.symbol.endsWith('.L') || b.symbol.endsWith('.PA');
        if (aEur && !bEur) return -1;
        if (!aEur && bEur) return 1;
      }
      if (isUS) {
        const aUS = !a.symbol.includes('.');
        const bUS = !b.symbol.includes('.');
        if (aUS && !bUS) return -1;
        if (!aUS && bUS) return 1;
      }
      return (b.lastPrice || 0) - (a.lastPrice || 0);
    });

    const bestMatch = validatedCandidates[0];

    return {
      query: cleanInput,
      resolved: true,
      bestMatch,
      candidates: validatedCandidates,
    };
  }
}

export const isinResolverService = new IsinResolverService();
