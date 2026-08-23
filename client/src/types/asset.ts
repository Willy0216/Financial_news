export type AssetType = 'ETF' | 'EQUITY' | 'INDEX' | 'COMMODITY';

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
  assetType: AssetType;
  exchange: string;
  currency: string;
  lastClose: number;
  prevClose: number;
  priceChangePct: number;
  created_at?: string;
  underlying_data?: string | null;
  profile?: UnderlyingProfileData | null;
  quote?: {
    price: number;
    prevClose: number;
    priceChange: number;
    priceChangePct: number;
    currency: string;
    exchange: string;
    volume?: number;
    marketCap?: number;
  } | null;
  latest_report?: {
    id: number;
    price_change_pct: number;
    last_close: number;
    created_at: string;
  } | null;
}

export interface ResolveResult {
  symbol: string;
  name: string;
  exchange: string;
  assetType: string;
  currency: string;
  isin?: string;
  isValid: boolean;
  lastPrice?: number;
}

export interface ResolutionData {
  success: boolean;
  bestMatch?: ResolveResult | null;
  candidates: ResolveResult[];
  error?: string;
}

export interface ChartDataPoint {
  timestamp: string;
  close: number;
}

export interface ReportResponse {
  symbol: string;
  reportMarkdown: string;
  createdAt: string;
  isHoliday?: boolean;
  status?: 'generated' | 'cached' | 'skipped_market_closed' | 'skipped_zero_change' | 'error';
  modelUsed?: string;
  model_used?: string;
}

export type Timeframe = '1W' | '1M' | '6M' | '1Y' | 'YTD';
