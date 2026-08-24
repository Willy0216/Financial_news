export type AssetType = 'ETF' | 'EQUITY' | 'INDEX' | 'COMMODITY';

export interface NewsItem {
  title: string;
  summary?: string;
  publisher: string;
  link?: string;
  publishedAt: Date;
  timeAgo?: string;
  source?: 'yahoo' | 'google_rss' | 'fallback';
}

export interface HoldingItem {
  symbol?: string;
  name: string;
  weightPct: number;
}

export interface UnderlyingProfileData {
  categoryName?: string;
  family?: string;
  benchmark?: string;
  sector?: string;
  industry?: string;
  summary?: string;
  topHoldings?: HoldingItem[];
  sectorWeights?: Record<string, number>;
  underlyingAsset?: string;
}

export interface TrackedAsset {
  id: number;
  symbol: string;
  isin: string | null;
  name: string;
  asset_type: AssetType;
  exchange: string | null;
  currency: string;
  underlying_data?: string | null;
  profile?: UnderlyingProfileData | null;
  created_at: string;
}

export interface TrackedAssetInput {
  symbol: string;
  isin?: string | null;
  name: string;
  asset_type: AssetType;
  exchange?: string | null;
  currency?: string;
  underlying_data?: string | null;
}

export interface AssetReport {
  id: number;
  symbol: string;
  price_change_pct: number;
  prev_close: number;
  last_close: number;
  report_markdown: string;
  model_used?: string | null;
  created_at: string;
}

export interface AssetReportInput {
  symbol: string;
  price_change_pct: number;
  prev_close: number;
  last_close: number;
  report_markdown: string;
  model_used?: string | null;
}

export interface MarketQuote {
  symbol: string;
  name: string;
  price: number;
  prevClose: number;
  priceChange: number;
  priceChangePct: number;
  currency: string;
  exchange: string;
  assetType: AssetType;
  marketState?: string;
  isMarketClosed?: boolean;
  marketCap?: number;
  volume?: number;
  lastTradingDay?: string;
}

export interface ISINCandidate {
  symbol: string;
  isin?: string;
  name: string;
  exchange: string;
  currency: string;
  assetType: AssetType;
  source: 'OPENFIGI' | 'YAHOO_SEARCH' | 'DIRECT_TICKER';
  figi?: string;
  micCode?: string;
  hasActiveTradingHistory: boolean;
  lastPrice?: number;
  score?: number;
}

export interface ResolutionResponse {
  query: string;
  isin?: string;
  resolved: boolean;
  bestMatch?: ISINCandidate;
  candidates: ISINCandidate[];
  error?: string;
}

export interface ReportGenerationResult {
  symbol: string;
  status: 'generated' | 'cached' | 'skipped_market_closed' | 'skipped_zero_change' | 'error';
  reason?: string;
  report?: AssetReport;
  reportMarkdown?: string;
  modelUsed?: string;
}

export * from './macro.js';

