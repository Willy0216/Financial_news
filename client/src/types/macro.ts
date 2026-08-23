export type MacroCategory = 'CURRENCY' | 'VOLATILITY' | 'CREDIT' | 'RATIO';

export type RegimeVariant = 'emerald' | 'amber' | 'rose' | 'blue' | 'slate';

export interface RegimeStatus {
  label: string;
  variant: RegimeVariant;
}

export interface MacroIndicatorSummary {
  key: string;
  name: string;
  category: MacroCategory;
  description: string;
  latestValue: number;
  sma50: number | null;
  sma200: number | null;
  distSma200Pct: number | null;
  zScore1Y: number | null;
  regime: string;
  regimeVariant: RegimeVariant;
  sparkline: number[]; // Last 30 data points for mini sparkline charts
}

export interface MacroDashboardPayload {
  lastUpdated: string;
  metrics: MacroIndicatorSummary[];
}
