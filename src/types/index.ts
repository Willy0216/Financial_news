export type AssetType = 'ETF' | 'EQUITY' | 'INDEX' | 'COMMODITY';

export interface TrackedAsset {
  id: number;
  symbol: string;
  isin: string | null;
  name: string;
  asset_type: AssetType;
  exchange: string | null;
  currency: string;
  created_at: string;
}

export interface TrackedAssetInput {
  symbol: string;
  isin?: string | null;
  name: string;
  asset_type: AssetType;
  exchange?: string | null;
  currency?: string;
}

export interface AssetReport {
  id: number;
  symbol: string;
  price_change_pct: number;
  prev_close: number;
  last_close: number;
  report_markdown: string;
  created_at: string;
}

export interface AssetReportInput {
  symbol: string;
  price_change_pct: number;
  prev_close: number;
  last_close: number;
  report_markdown: string;
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
