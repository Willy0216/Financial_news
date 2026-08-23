import axios from 'axios';
import { config } from '../config/env.js';
import { ISINCandidate, ResolutionResponse, AssetType } from '../types/index.js';
import { marketDataService } from './market-data.service.js';
import { logger } from '../utils/logger.js';
import { ISIN_OVERRIDES, SYMBOL_TO_ISIN } from '../config/isin-overrides.js';

interface ExchangeConfig {
  codes: string[];
  suffix: string;
  exchangeName: string;
}

const EXCHANGE_CONFIGS: Record<string, ExchangeConfig> = {
  MI: {
    codes: ['IM', 'XMIL', 'MTAA', 'ETFP', 'MIL', 'BIT', 'BSI', 'MOT', 'SEDEX'],
    suffix: '.MI',
    exchangeName: 'MIL',
  },
  DE: {
    codes: ['GY', 'GR', 'GF', 'XETR', 'XFRA', 'FRA', 'GER', 'XET', 'STU', 'BER', 'MUN', 'DUS'],
    suffix: '.DE',
    exchangeName: 'GER',
  },
  L: {
    codes: ['LN', 'XLON', 'LSE', 'LON', 'IOB'],
    suffix: '.L',
    exchangeName: 'LSE',
  },
  PA: {
    codes: ['FP', 'XPAR', 'PAR', 'EPA'],
    suffix: '.PA',
    exchangeName: 'PAR',
  },
  AS: {
    codes: ['NA', 'XAMS', 'AMS'],
    suffix: '.AS',
    exchangeName: 'AMS',
  },
  SW: {
    codes: ['SW', 'VX', 'XSWX', 'EBS', 'SIX'],
    suffix: '.SW',
    exchangeName: 'SWX',
  },
  US: {
    codes: ['US', 'UN', 'UQ', 'UW', 'UR', 'XNYS', 'XNAS', 'NYSE', 'NASDAQ', 'BATS', 'ARCX', 'ARCA'],
    suffix: '',
    exchangeName: 'NMS',
  },
};

export class IsinResolverService {
  private readonly isinRegex = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/i;

  public isIsin(input: string): boolean {
    return this.isinRegex.test(input.trim());
  }

  /**
   * Reverse ISIN lookup: given a ticker symbol (e.g. MEUD.MI, AAPL, VWCE.DE), find its official ISIN.
   */
  public async findIsinForSymbol(symbol: string): Promise<string | null> {
    const clean = symbol.trim().toUpperCase();
    const baseTicker = clean.split('.')[0];

    // 1. Check static override dictionary first
    if (SYMBOL_TO_ISIN[clean]) {
      return SYMBOL_TO_ISIN[clean];
    }
    if (SYMBOL_TO_ISIN[baseTicker]) {
      return SYMBOL_TO_ISIN[baseTicker];
    }

    // 2. Query OpenFIGI search / mapping by TICKER
    try {
      const url = 'https://api.openfigi.com/v3/search';
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (config.openFigiApiKey) {
        headers['X-OPENFIGI-APIKEY'] = config.openFigiApiKey;
      }

      const response = await axios.post(
        url,
        { query: baseTicker },
        { headers, timeout: 5000 }
      );

      const items = response.data?.data;
      if (Array.isArray(items) && items.length > 0) {
        // Look for match with shareClassFIGI or compositeFIGI
        for (const item of items) {
          if (item.ticker?.toUpperCase() === baseTicker) {
            // Check if ISIN is available or can be resolved
            const nameSearch = await marketDataService.searchYahoo(item.name || baseTicker, 5, 0);
            for (const q of nameSearch.quotes) {
              if (this.isIsin(q.symbol)) {
                return q.symbol.toUpperCase();
              }
            }
          }
        }
      }
    } catch {
      // Gracefully ignore network errors on external reverse lookup
    }

    return null;
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
        const micCode = (item.micCode || '').toUpperCase();

        let yahooSymbol = rawTicker;
        let exchangeName = exchCode || micCode || 'UNKNOWN';

        for (const cfg of Object.values(EXCHANGE_CONFIGS)) {
          if (cfg.codes.includes(exchCode) || cfg.codes.includes(micCode)) {
            yahooSymbol = `${rawTicker}${cfg.suffix}`;
            exchangeName = cfg.exchangeName;
            break;
          }
        }

        const assetType: AssetType =
          item.securityType?.toUpperCase().includes('ETF') ||
          item.securityType2?.toUpperCase().includes('ETF') ||
          item.securityType?.toUpperCase().includes('ETP')
            ? 'ETF'
            : 'EQUITY';

        const candCurrency =
          yahooSymbol.endsWith('.MI') ||
          yahooSymbol.endsWith('.DE') ||
          yahooSymbol.endsWith('.PA') ||
          yahooSymbol.endsWith('.AS')
            ? 'EUR'
            : yahooSymbol.endsWith('.L')
            ? rawTicker.endsWith('GBX')
              ? 'GBp'
              : 'GBP'
            : yahooSymbol.endsWith('.SW')
            ? 'CHF'
            : rawTicker.endsWith('EUR')
            ? 'EUR'
            : rawTicker.endsWith('GBX')
            ? 'GBp'
            : 'USD';

        candidates.push({
          symbol: yahooSymbol,
          name: item.name || rawTicker,
          exchange: exchangeName,
          currency: candCurrency,
          assetType,
          source: 'OPENFIGI',
          figi: item.figi,
          micCode: item.micCode,
          hasActiveTradingHistory: false,
        });

        // Also add European suffix candidates if ticker has no suffix
        const cleanBaseTicker = rawTicker.replace(/(EUR|GBX|USD)$/i, '');
        const tickersToExpand = new Set([rawTicker, cleanBaseTicker]);

        for (const base of tickersToExpand) {
          if (!base.includes('.')) {
            for (const sfx of ['.MI', '.DE', '.L', '.PA', '.AS']) {
              candidates.push({
                symbol: `${base}${sfx}`,
                name: item.name || base,
                exchange: sfx.replace('.', ''),
                currency: sfx === '.L' ? 'GBP' : 'EUR',
                assetType,
                source: 'OPENFIGI',
                hasActiveTradingHistory: false,
              });
            }
          }
        }
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

      const sym = q.symbol.toUpperCase();
      const candCurrency =
        sym.endsWith('.MI') || sym.endsWith('.DE') || sym.endsWith('.PA') || sym.endsWith('.AS')
          ? 'EUR'
          : sym.endsWith('.L')
          ? 'GBP'
          : sym.endsWith('.SW')
          ? 'CHF'
          : 'USD';

      const assetType = marketDataService.mapInstrumentType(q.quoteType, q.symbol);
      candidates.push({
        symbol: sym,
        name: q.longname || q.shortname || q.symbol,
        exchange: (q.exchange || 'UNKNOWN').toUpperCase(),
        currency: candCurrency,
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
      // 0. Check Static Override for known ISINs (e.g. LU0908500753 -> MEUD.MI)
      const overrideTicker = ISIN_OVERRIDES[cleanInput];
      if (overrideTicker) {
        rawCandidates.push({
          symbol: overrideTicker.toUpperCase(),
          name: overrideTicker,
          exchange: overrideTicker.endsWith('.MI') ? 'MIL' : 'NMS',
          currency: 'EUR',
          assetType: 'ETF',
          source: 'DIRECT_TICKER',
          hasActiveTradingHistory: false,
        });
      }

      // 1. Try OpenFIGI
      const openFigiCandidates = await this.fetchOpenFigiCandidates(cleanInput);
      rawCandidates.push(...openFigiCandidates);

      // 2. Try Yahoo Finance Search fallback
      const yahooCandidates = await this.fetchYahooCandidates(cleanInput);
      rawCandidates.push(...yahooCandidates);

      // 3. Cross-Exchange Milan Preference Fallback:
      // If none of the discovered candidates is on Milan (.MI), search Yahoo using the clean asset name
      const hasMilanCandidate = rawCandidates.some((c) => c.symbol.endsWith('.MI'));
      if (!hasMilanCandidate && rawCandidates.length > 0) {
        const primaryName = rawCandidates[0].name;
        if (primaryName && primaryName !== cleanInput) {
          const secondarySearch = await marketDataService.searchYahoo(primaryName, 10, 0);
          for (const q of secondarySearch.quotes) {
            if (q.symbol && q.symbol.toUpperCase().endsWith('.MI')) {
              rawCandidates.push({
                symbol: q.symbol.toUpperCase(),
                name: q.longname || q.shortname || primaryName,
                exchange: 'MIL',
                currency: 'EUR',
                assetType: marketDataService.mapInstrumentType(q.quoteType, q.symbol),
                source: 'YAHOO_SEARCH',
                hasActiveTradingHistory: false,
              });
            }
          }
        }
      }
    } else {
      // Direct ticker or symbol search
      // A. If input has exchange suffix (e.g. BITC.MI, AAPL.DE), validate directly
      if (cleanInput.includes('.')) {
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
      } else {
        // B. If input has no suffix (e.g. BITC, SWDA, AAPL), generate exchange variants
        for (const sfx of ['.MI', '.DE', '.L', '.PA', '.AS', '']) {
          const candidateSym = `${cleanInput}${sfx}`;
          rawCandidates.push({
            symbol: candidateSym,
            name: candidateSym,
            exchange: sfx ? sfx.replace('.', '') : 'US',
            currency: sfx === '.L' ? 'GBP' : sfx ? 'EUR' : 'USD',
            assetType: 'EQUITY',
            source: 'DIRECT_TICKER',
            hasActiveTradingHistory: false,
          });
        }
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
      uniqueCandidates.slice(0, 25).map(async (cand) => {
        const check = await marketDataService.validateActiveTrading(cand.symbol);
        if (check.isValid && check.quote) {
          cand.hasActiveTradingHistory = true;
          cand.lastPrice = check.quote.price;
          cand.currency = check.quote.currency || 'USD';
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

    // Prioritize candidates by strict relevance matching & preferred European exchange hierarchy
    const isUS = isIsinInput && cleanInput.startsWith('US');
    const queryHasSuffix = cleanInput.includes('.');

    validatedCandidates.sort((a, b) => {
      const symA = a.symbol.toUpperCase();
      const symB = b.symbol.toUpperCase();
      const baseSymA = symA.split('.')[0];
      const baseSymB = symB.split('.')[0];
      const queryBase = cleanInput.split('.')[0];

      // 1. Exact Full Match (when query explicitly specifies an exchange suffix, e.g. "BITC.MI" or "SGLN.L")
      if (queryHasSuffix) {
        if (symA === cleanInput && symB !== cleanInput) return -1;
        if (symB === cleanInput && symA !== cleanInput) return 1;
      }

      // 2. Exact Base Ticker Match (e.g. input "BITC" === candidate "BITC.MI" vs "BTC-USD")
      const aExactBase = baseSymA === queryBase;
      const bExactBase = baseSymB === queryBase;
      if (aExactBase && !bExactBase) return -1;
      if (!aExactBase && bExactBase) return 1;

      // 3. Preferred Exchange Hierarchy (MI > DE > L > PA > AS > Major US > Other > OTC/Penny)
      const getExchangeRank = (sym: string, cand: ISINCandidate) => {
        const isPennyOrOtc =
          cand.exchange === 'PNK' ||
          cand.exchange === 'OTC' ||
          cand.exchange === 'OTHER_OTC' ||
          (cand.lastPrice !== undefined && cand.lastPrice < 0.005);

        if (isPennyOrOtc) return 99;

        const isMajorUS =
          cand.exchange === 'NMS' ||
          cand.exchange === 'NYQ' ||
          cand.exchange === 'NASDAQ' ||
          cand.exchange === 'NYSE';

        if (isUS) {
          if (isMajorUS) return 0;
          if (!sym.includes('.')) return 1;
          if (sym.endsWith('.MI')) return 2;
          if (sym.endsWith('.DE')) return 3;
          return 4;
        }

        if (sym.endsWith('.MI')) return 1;
        if (sym.endsWith('.DE')) return 2;
        if (sym.endsWith('.L')) return 3;
        if (sym.endsWith('.PA')) return 4;
        if (sym.endsWith('.AS')) return 5;
        if (isMajorUS) return 6;
        if (!sym.includes('.')) return 7;
        return 8;
      };

      const rankA = getExchangeRank(symA, a);
      const rankB = getExchangeRank(symB, b);
      if (rankA !== rankB) return rankA - rankB;

      // 4. Search Score Fallback
      return (b.score || 0) - (a.score || 0);
    });

    const topCandidates = validatedCandidates.slice(0, 8);
    const bestMatch = topCandidates[0];

    return {
      query: cleanInput,
      resolved: true,
      bestMatch,
      candidates: topCandidates,
    };
  }
}

export const isinResolverService = new IsinResolverService();
