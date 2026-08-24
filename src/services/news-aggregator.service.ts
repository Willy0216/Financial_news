import axios from 'axios';
import { AssetType, NewsItem, TrackedAsset, UnderlyingProfileData } from '../types/index.js';
import { logger } from '../utils/logger.js';

export interface AssetDriverConfig {
  queryTickers: string[];
  keywords: string;
}

/**
 * Explicit mapping for commodity, crypto, and thematic ETC tickers
 * to their primary benchmark tickers and high-relevance search keywords.
 */
export const ASSET_NEWS_DRIVER_MAP: Record<string, AssetDriverConfig> = {
  // Gold ETCs
  'SGLN.MI': { queryTickers: ['GC=F', 'GLD'], keywords: 'Gold price bullion' },
  'SGLN.L': { queryTickers: ['GC=F', 'GLD'], keywords: 'Gold price bullion' },
  'PPFB.MI': { queryTickers: ['GC=F', 'GLD'], keywords: 'Gold price bullion' },
  '4GLD.DE': { queryTickers: ['GC=F', 'GLD'], keywords: 'Gold price bullion' },
  'IGLN.L': { queryTickers: ['GC=F', 'GLD'], keywords: 'Gold price bullion' },
  'EGLN.L': { queryTickers: ['GC=F', 'GLD'], keywords: 'Gold price bullion' },
  'GOLD.MI': { queryTickers: ['GC=F', 'GLD'], keywords: 'Gold price bullion' },

  // Silver ETCs
  'PHAG.MI': { queryTickers: ['SI=F', 'SLV'], keywords: 'Silver price commodity' },
  'ISLN.L': { queryTickers: ['SI=F', 'SLV'], keywords: 'Silver price commodity' },
  'SSLN.L': { queryTickers: ['SI=F', 'SLV'], keywords: 'Silver price commodity' },

  // Oil & Energy ETCs
  'CRUD.MI': { queryTickers: ['CL=F', 'USO', 'BZ=F'], keywords: 'Crude oil Brent WTI' },
  'CRUD.L': { queryTickers: ['CL=F', 'USO', 'BZ=F'], keywords: 'Crude oil Brent WTI' },

  // Copper & Industrial Metals
  'COPA.MI': { queryTickers: ['HG=F', 'CPER'], keywords: 'Copper price commodity' },
  'COPA.L': { queryTickers: ['HG=F', 'CPER'], keywords: 'Copper price commodity' },

  // Crypto ETCs
  'BITC.MI': { queryTickers: ['BTC-USD', 'BTC=F', 'IBIT'], keywords: 'Bitcoin cryptocurrency' },
  'BITC.DE': { queryTickers: ['BTC-USD', 'BTC=F', 'IBIT'], keywords: 'Bitcoin cryptocurrency' },
  'BITC.L': { queryTickers: ['BTC-USD', 'BTC=F', 'IBIT'], keywords: 'Bitcoin cryptocurrency' },
  'BTCW.MI': { queryTickers: ['BTC-USD', 'BTC=F', 'IBIT'], keywords: 'Bitcoin cryptocurrency' },
  'ETHE.MI': { queryTickers: ['ETH-USD', 'ETH=F', 'ETHA'], keywords: 'Ethereum crypto' },
  'ETHW.MI': { queryTickers: ['ETH-USD', 'ETH=F', 'ETHA'], keywords: 'Ethereum crypto' },
};

// Recognized institutional & major financial publishers for ranking priority
const MAJOR_PUBLISHERS = [
  'reuters',
  'bloomberg',
  'financial times',
  'ft',
  'the wall street journal',
  'wsj',
  'cnbc',
  'marketwatch',
  'barron\'s',
  'associated press',
  'ap',
  'morningstar',
  'forbes',
  'investing.com',
  'zacks',
  'coindesk',
  'beincrypto',
  'the block',
  'cointelegraph',
  'seeking alpha',
  'thestreet',
  'motley fool',
  'yahoo finance',
];

export interface FetchNewsOptions {
  symbol: string;
  name?: string;
  asset_type?: AssetType;
  assetType?: AssetType;
  underlying_data?: string | null;
  profile?: UnderlyingProfileData | null;
}

export class NewsAggregatorService {
  private readonly userAgent =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

  // Clickbait headline prefixes and patterns
  public static readonly CLICKBAIT_PATTERNS = [
    /^(?:Why|Will|Is|Here'?s|Should you|Forget|Don't miss|If you invested)\b/i,
    /^(?:Top|Best)\s+(?:\d+\s+)?(?:stocks?|reasons?|things?|etfs?|ways?|crypto|investments?|dividend|picks?)\b/i,
    /^(?:\d+\s+things to know|\d+\s+reasons to|\d+\s+ways to)/i,
  ];

  // PR boilerplate, promotional spam, wire noise, class action lawsuit spam
  public static readonly NOISE_PATTERNS = [
    /\b(?:installs?\s+machine|appoints?\s+new\b|named as\b|names new\b|press release|announces? participation in|to present at|conference call details|zacks (?:rank|highlights|analyst blog highlights)|fool\.com|the motley fool|class action|lawsuit alert|shareholder alert|rosen law firm|gross law firm|pomerantz|robbins llp|glancy prongay|levi & korsinsky|bronstein)\b/i,
  ];

  // Substantive financial / macroeconomic keywords
  public static readonly FINANCIAL_KEYWORDS = [
    'earnings',
    'revenue',
    'inflation',
    'rates',
    'rate cut',
    'rate hike',
    'fed',
    'ecb',
    'margin',
    'demand',
    'shares',
    'rally',
    'slump',
    'surge',
    'surges',
    'gains',
    'gain',
    'jump',
    'jumps',
    'plunge',
    'falls',
    'rise',
    'rises',
    'profit',
    'guidance',
    'forecast',
    'deficit',
    'yields',
    'liquidity',
    'tariffs',
    'sanctions',
    'regulatory',
    'oas',
    'debt',
    'credit',
    'central bank',
    'gdp',
    'pmi',
    'cpi',
    'sales',
    'ipo',
    'merger',
    'acquisition',
    'deal',
    'dividend',
    'q1',
    'q2',
    'q3',
    'q4',
    'fy',
    'bull',
    'bear',
    'bullish',
    'bearish',
    'outperform',
    'target',
    'price target',
    'upgrade',
    'downgrade',
    'etf',
    'inflows',
    'outflows',
    'crypto',
    'bitcoin',
    'ether',
    'commodity',
    'oil',
    'gold',
    'copper',
    'silver',
    'bullion',
    'bonds',
    'treasury',
    'dollar',
    'dxy',
    'vix',
    'stock',
    'stocks',
    'market',
    'markets',
    'sector',
    'stoxx',
    's&p',
    'nasdaq',
    'dow',
    'tech',
    'semiconductor',
    'chip',
    'ai',
    'equities',
    'equity',
  ];

  /**
   * Resolve asset driver configuration (explicit map or dynamic keyword fallback)
   */
  public resolveAssetDriver(
    symbol: string,
    profile?: UnderlyingProfileData | null,
    assetType?: AssetType
  ): AssetDriverConfig | null {
    const sym = symbol.toUpperCase().trim();
    if (ASSET_NEWS_DRIVER_MAP[sym]) {
      return ASSET_NEWS_DRIVER_MAP[sym];
    }

    const underlying = (profile?.underlyingAsset || '').toLowerCase();

    // Dynamic Gold fallback
    if (
      sym.includes('SGLN') ||
      sym.includes('PPFB') ||
      sym.includes('4GLD') ||
      sym.includes('IGLN') ||
      sym.includes('EGLN') ||
      sym.includes('GOLD') ||
      underlying.includes('gold')
    ) {
      return { queryTickers: ['GC=F', 'GLD'], keywords: 'Gold price bullion' };
    }

    // Dynamic Silver fallback
    if (
      sym.includes('PHAG') ||
      sym.includes('SSLN') ||
      sym.includes('ISLN') ||
      sym.includes('SILVER') ||
      underlying.includes('silver')
    ) {
      return { queryTickers: ['SI=F', 'SLV'], keywords: 'Silver price commodity' };
    }

    // Dynamic Oil / Energy fallback
    if (
      sym.includes('CRUD') ||
      sym.includes('OIL') ||
      sym.includes('BRENT') ||
      underlying.includes('oil') ||
      underlying.includes('crude')
    ) {
      return { queryTickers: ['CL=F', 'USO', 'BZ=F'], keywords: 'Crude oil Brent WTI' };
    }

    // Dynamic Copper fallback
    if (
      sym.includes('COPA') ||
      sym.includes('COPPER') ||
      underlying.includes('copper')
    ) {
      return { queryTickers: ['HG=F', 'CPER'], keywords: 'Copper price commodity' };
    }

    // Dynamic Bitcoin fallback
    if (
      sym.includes('BITC') ||
      sym.includes('BTCW') ||
      sym.includes('BTC') ||
      underlying.includes('bitcoin')
    ) {
      return { queryTickers: ['BTC-USD', 'BTC=F', 'IBIT'], keywords: 'Bitcoin cryptocurrency' };
    }

    // Dynamic Ethereum fallback
    if (
      sym.includes('ETHE') ||
      sym.includes('ETHW') ||
      sym.includes('ETH') ||
      underlying.includes('ethereum')
    ) {
      return { queryTickers: ['ETH-USD', 'ETH=F', 'ETHA'], keywords: 'Ethereum crypto' };
    }

    return null;
  }

  /**
   * Decode HTML entities in text
   */
  public decodeHtmlEntities(str: string): string {
    if (!str) return '';
    return str
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&apos;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&nbsp;/g, ' ')
      .replace(/&#8217;/g, "'")
      .replace(/&#8216;/g, "'")
      .replace(/&#8220;/g, '"')
      .replace(/&#8221;/g, '"')
      .replace(/&#8211;/g, '-')
      .replace(/&#8212;/g, '-')
      .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
      .trim();
  }

  /**
   * Strip HTML tags, decode entities, and normalize whitespace for summary snippets
   */
  public stripHtmlAndCleanSnippet(raw: string): string {
    if (!raw) return '';
    const stripped = raw.replace(/<[^>]*>/g, ' ');
    return this.decodeHtmlEntities(stripped).replace(/\s+/g, ' ').trim();
  }

  /**
   * Clean redundant trailing source tags from title (e.g. "Headline - Reuters" -> "Headline")
   */
  public cleanTitle(title: string, publisher?: string): string {
    let cleaned = this.decodeHtmlEntities(title);

    if (publisher) {
      const pubLower = publisher.toLowerCase().trim();
      const lastHyphenIdx = cleaned.lastIndexOf(' - ');
      if (lastHyphenIdx > 0) {
        const trailingSource = cleaned.substring(lastHyphenIdx + 3).trim().toLowerCase();
        if (
          trailingSource === pubLower ||
          pubLower.includes(trailingSource) ||
          trailingSource.includes(pubLower)
        ) {
          cleaned = cleaned.substring(0, lastHyphenIdx).trim();
        }
      }
    }

    return cleaned.trim();
  }

  /**
   * Compute relative time string (e.g. "45m ago", "3h ago", "2d ago")
   */
  public computeTimeAgo(publishedAt: Date, now: Date = new Date()): string {
    const diffMs = Math.max(0, now.getTime() - publishedAt.getTime());
    const diffMinutes = Math.floor(diffMs / (60 * 1000));
    const diffHours = Math.floor(diffMs / (3600 * 1000));
    const diffDays = Math.floor(diffMs / (86400 * 1000));

    if (diffMinutes < 60) {
      return `${Math.max(1, diffMinutes)}m ago`;
    }
    if (diffHours < 24) {
      return `${diffHours}h ago`;
    }
    return `${diffDays}d ago`;
  }

  /**
   * Check if date is within recency threshold (max 7 days)
   */
  public isWithinRecency(publishedAt: Date, maxDays = 7, now: Date = new Date()): boolean {
    if (!publishedAt || isNaN(publishedAt.getTime())) return false;
    const diffMs = now.getTime() - publishedAt.getTime();
    if (diffMs < -24 * 3600 * 1000) return false; // More than 1 day in the future
    return diffMs <= maxDays * 24 * 3600 * 1000;
  }

  /**
   * Noise & Clickbait Filter Heuristics
   */
  public isHighValueNews(item: NewsItem): boolean {
    const title = item.title.trim();
    const summary = item.summary || '';
    const publisher = item.publisher || '';

    // 1. Exclude clickbait patterns
    for (const pattern of NewsAggregatorService.CLICKBAIT_PATTERNS) {
      if (pattern.test(title)) return false;
    }

    // 2. Exclude PR / Legal noise / non-financial wire filler
    for (const pattern of NewsAggregatorService.NOISE_PATTERNS) {
      if (pattern.test(title) || pattern.test(summary) || pattern.test(publisher)) {
        return false;
      }
    }

    // 3. Minimum length / substance check
    const hasSubstantiveSummary = summary.length >= 40;
    const titleLower = title.toLowerCase();
    const hasFinancialKeyword = NewsAggregatorService.FINANCIAL_KEYWORDS.some((kw) =>
      titleLower.includes(kw)
    );

    return hasSubstantiveSummary || hasFinancialKeyword;
  }

  /**
   * Normalize title for fuzzy deduplication
   */
  public normalizeTitleForDedup(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .trim();
  }

  /**
   * Fetch headlines and summaries from Yahoo Finance search endpoint
   */
  public async fetchYahooNews(query: string, count = 6): Promise<NewsItem[]> {
    const cleanQuery = query.trim();
    if (!cleanQuery) return [];

    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(
      cleanQuery
    )}&quotesCount=0&newsCount=${count}`;

    try {
      const response = await axios.get(url, {
        headers: {
          'User-Agent': this.userAgent,
          Accept: 'application/json',
        },
        timeout: 8000,
      });

      const rawNews: any[] = response.data?.news || [];
      const results: NewsItem[] = [];
      const now = new Date();

      for (const item of rawNews) {
        if (!item.title) continue;

        const publisher = this.decodeHtmlEntities(item.publisher || 'Yahoo Finance');
        const title = this.cleanTitle(item.title, publisher);
        const summary = this.stripHtmlAndCleanSnippet(
          item.description || item.summary || item.snippet || ''
        );
        const publishedAt = item.providerPublishTime
          ? new Date(item.providerPublishTime * 1000)
          : now;

        if (this.isWithinRecency(publishedAt, 7, now)) {
          results.push({
            title,
            summary: summary || undefined,
            publisher,
            link: item.link,
            publishedAt,
            timeAgo: this.computeTimeAgo(publishedAt, now),
            source: 'yahoo',
          });
        }
      }

      return results;
    } catch (err: any) {
      logger.warn(`Yahoo news search failed for "${cleanQuery}": ${err.message}`);
      return [];
    }
  }

  /**
   * Fetch headlines and summaries from Google News RSS with time constraint
   */
  public async fetchGoogleRssNews(query: string, count = 6): Promise<NewsItem[]> {
    const cleanQuery = query.trim();
    if (!cleanQuery) return [];

    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(
      cleanQuery
    )}&hl=en-US&gl=US&ceid=US:en`;

    try {
      const response = await axios.get(url, {
        headers: {
          'User-Agent': this.userAgent,
          Accept: 'application/xml, text/xml, */*',
        },
        timeout: 8000,
      });

      const xml = response.data || '';
      const items = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
      const results: NewsItem[] = [];
      const now = new Date();

      for (const itemXml of items) {
        if (results.length >= count) break;

        const titleMatch = itemXml.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/);
        const sourceMatch = itemXml.match(
          /<source[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/source>/
        );
        const descMatch = itemXml.match(
          /<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/
        );
        const contentMatch = itemXml.match(
          /<content:encoded>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/content:encoded>/
        );
        const pubDateMatch = itemXml.match(/<pubDate>([\s\S]*?)<\/pubDate>/);
        const linkMatch = itemXml.match(/<link>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/);

        const rawTitle = titleMatch ? titleMatch[1] : '';
        const publisher = sourceMatch
          ? this.decodeHtmlEntities(sourceMatch[1])
          : 'Financial News';
        const title = this.cleanTitle(rawTitle, publisher);

        const rawSnippet = contentMatch ? contentMatch[1] : descMatch ? descMatch[1] : '';
        const summary = this.stripHtmlAndCleanSnippet(rawSnippet);

        const pubDateStr = pubDateMatch ? pubDateMatch[1] : '';
        const publishedAt = pubDateStr ? new Date(pubDateStr) : now;

        if (title && this.isWithinRecency(publishedAt, 7, now)) {
          results.push({
            title,
            summary: summary || undefined,
            publisher,
            link: linkMatch ? linkMatch[1] : undefined,
            publishedAt,
            timeAgo: this.computeTimeAgo(publishedAt, now),
            source: 'google_rss',
          });
        }
      }

      return results;
    } catch (err: any) {
      logger.warn(`Google News RSS search failed for "${cleanQuery}": ${err.message}`);
      return [];
    }
  }

  /**
   * Score an article for ranking
   */
  private scoreArticle(item: NewsItem, assetName?: string, symbol?: string): number {
    let score = 50;
    const now = new Date();
    const ageHours = (now.getTime() - item.publishedAt.getTime()) / (3600 * 1000);

    // 1. Freshness bonus
    if (ageHours <= 12) score += 40;
    else if (ageHours <= 24) score += 30;
    else if (ageHours <= 48) score += 20;
    else if (ageHours <= 96) score += 10;

    // 2. Authoritative publisher bonus
    const pubLower = item.publisher.toLowerCase();
    if (MAJOR_PUBLISHERS.some((p) => pubLower.includes(p))) {
      score += 25;
    }

    // 3. Asset relevance bonus
    const titleLower = item.title.toLowerCase();
    if (symbol && titleLower.includes(symbol.toLowerCase().replace(/[^a-z0-9]/g, ''))) {
      score += 15;
    }
    if (assetName) {
      const cleanName = assetName.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
      const firstWord = cleanName.split(' ')[0];
      if (firstWord && firstWord.length > 3 && titleLower.includes(firstWord)) {
        score += 15;
      }
    }

    // 4. Substantial context summary bonus
    if (item.summary && item.summary.length >= 40) {
      score += 10;
    }

    return score;
  }

  /**
   * Deduplicate, filter noise/clickbait, and rank candidate articles
   */
  public sanitizeAndRankArticles(
    articles: NewsItem[],
    options?: { assetName?: string; symbol?: string; maxItems?: number }
  ): NewsItem[] {
    const maxItems = options?.maxItems || 8;
    const dedupMap = new Map<string, NewsItem>();

    // Sort initially by publication date descending
    const sorted = [...articles].sort(
      (a, b) => b.publishedAt.getTime() - a.publishedAt.getTime()
    );

    for (const item of sorted) {
      const key = this.normalizeTitleForDedup(item.title);
      if (key.length < 10) continue;

      if (!dedupMap.has(key)) {
        dedupMap.set(key, item);
      }
    }

    const uniqueList = Array.from(dedupMap.values());

    // Filter noise and clickbait
    const highValueList = uniqueList.filter((item) => this.isHighValueNews(item));
    const pool = highValueList.length >= 2 ? highValueList : uniqueList;

    // Score and rank
    const scored = pool.map((item) => ({
      item,
      score: this.scoreArticle(item, options?.assetName, options?.symbol),
    }));

    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.item.publishedAt.getTime() - a.item.publishedAt.getTime();
    });

    return scored.slice(0, maxItems).map((s) => s.item);
  }

  /**
   * Main entry point: Fetch multi-tiered news for a tracked asset
   */
  public async fetchNewsForAsset(asset: FetchNewsOptions | TrackedAsset): Promise<NewsItem[]> {
    const symbol = asset.symbol.trim().toUpperCase();
    const assetType = (asset.asset_type || asset.assetType || 'EQUITY').toUpperCase() as AssetType;
    const name = asset.name || symbol;

    let profile: UnderlyingProfileData | null = asset.profile || null;
    if (!profile && asset.underlying_data) {
      try {
        profile = JSON.parse(asset.underlying_data);
      } catch {
        profile = null;
      }
    }

    const candidateArticles: NewsItem[] = [];
    const searchPromises: Promise<NewsItem[]>[] = [];

    // 1. Check Primary Driver Ticker Mapping
    const driver = this.resolveAssetDriver(symbol, profile, assetType);

    if (driver) {
      // Query primary driver tickers on Yahoo Finance (e.g. GC=F and GLD for SGLN)
      for (const ticker of driver.queryTickers) {
        searchPromises.push(this.fetchYahooNews(ticker, 6));
      }

      // Query Google News RSS with primary driver keywords and 2-day time constraint
      searchPromises.push(
        this.fetchGoogleRssNews(`${driver.keywords} when:2d`, 8)
      );

      // Query primary driver main keyword on Yahoo Finance
      const primaryKeyword = driver.keywords.split(' ')[0];
      if (primaryKeyword && primaryKeyword.length > 2) {
        searchPromises.push(this.fetchYahooNews(primaryKeyword, 6));
      }
    } else {
      const isETF = assetType === 'ETF' || (profile?.topHoldings && profile.topHoldings.length > 0);

      // ==========================================
      // Strategy B: Underlying-Aware Search (ETFs & Index Funds)
      // ==========================================
      if (isETF) {
        // Top 3 constituent holdings headlines
        const topConstituents = (profile?.topHoldings || []).slice(0, 3);
        for (const holding of topConstituents) {
          const queryTerm = holding.symbol || holding.name;
          if (queryTerm) {
            searchPromises.push(
              this.fetchGoogleRssNews(`${queryTerm} stock news when:2d`, 3)
            );
          }
        }

        // Sector / Category / Benchmark macro news
        if (profile?.benchmark) {
          searchPromises.push(
            this.fetchGoogleRssNews(`${profile.benchmark} market news when:2d`, 5)
          );
        } else if (profile?.categoryName) {
          searchPromises.push(
            this.fetchGoogleRssNews(`${profile.categoryName} market news when:2d`, 5)
          );
        } else {
          searchPromises.push(
            this.fetchGoogleRssNews(`European stock market when:2d`, 5)
          );
        }

        // Direct ticker search
        searchPromises.push(this.fetchYahooNews(symbol, 6));
      } else {
        // ==========================================
        // Strategy A: Direct Search (Single Equities)
        // ==========================================
        searchPromises.push(this.fetchYahooNews(symbol, 8));

        const cleanName = name
          .replace(/UCITS ETF.*$/i, '')
          .replace(/Inc\..*$/i, '')
          .replace(/Corp\..*$/i, '')
          .trim();
        searchPromises.push(
          this.fetchGoogleRssNews(`${cleanName} stock financial news when:2d`, 8)
        );
      }
    }

    // Execute all queries in parallel
    const results = await Promise.allSettled(searchPromises);
    for (const res of results) {
      if (res.status === 'fulfilled' && Array.isArray(res.value)) {
        candidateArticles.push(...res.value);
      }
    }

    // If candidate articles are few (< 4), perform fallback broad search
    if (candidateArticles.length < 4) {
      const fallbackQuery = driver ? driver.keywords : name.length > 3 ? name : symbol;
      const fallbackItems = await this.fetchGoogleRssNews(`${fallbackQuery} when:2d`, 8);
      candidateArticles.push(...fallbackItems);
    }

    return this.sanitizeAndRankArticles(candidateArticles, {
      assetName: name,
      symbol,
      maxItems: 8,
    });
  }

  /**
   * Format the resulting headlines into structured format for the LLM prompt
   */
  public formatHeadlinesForPrompt(newsItems: NewsItem[], maxItems = 8): string {
    if (!newsItems || newsItems.length === 0) {
      return 'No direct headlines captured. Infer performance drivers from macro correlations, sector beta, and asset-class dynamics.';
    }

    const items = newsItems.slice(0, maxItems);
    return items
      .map((item) => `- [${item.publisher} | ${item.timeAgo || 'recent'}] ${item.title}`)
      .join('\n');
  }
}

export const newsAggregatorService = new NewsAggregatorService();
