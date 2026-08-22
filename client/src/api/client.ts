import axios from 'axios';
import { TrackedAsset, ResolveResult, ChartDataPoint, ReportResponse, Timeframe } from '../types/asset';

const api = axios.create({
  baseURL: '/api',
  timeout: 20000,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const apiClient = {
  /**
   * GET /api/assets - Fetch all tracked assets
   */
  async getAssets(): Promise<TrackedAsset[]> {
    const response = await api.get<{ success: boolean; data: TrackedAsset[] }>('/assets');
    return response.data?.data || [];
  },

  /**
   * POST /api/assets - Add new asset by Ticker or ISIN
   */
  async addAsset(identifier: string): Promise<TrackedAsset> {
    const response = await api.post<{ success: boolean; data: TrackedAsset }>('/assets', {
      identifier,
    });
    return response.data.data;
  },

  /**
   * DELETE /api/assets/:symbol - Remove asset from watchlist
   */
  async deleteAsset(symbol: string): Promise<boolean> {
    const response = await api.delete<{ success: boolean }>(`/assets/${encodeURIComponent(symbol)}`);
    return response.data?.success || false;
  },

  /**
   * POST /api/resolve - Auto-resolve Ticker or ISIN candidates
   */
  async resolveQuery(query: string): Promise<ResolveResult | null> {
    if (!query.trim()) return null;
    const response = await api.post<{
      success: boolean;
      bestMatch?: ResolveResult;
      symbol?: string;
      name?: string;
      exchange?: string;
      assetType?: string;
      currency?: string;
      isin?: string;
      isValid?: boolean;
      candidates?: ResolveResult[];
    }>('/resolve', { query });

    if (response.data.bestMatch) {
      return response.data.bestMatch;
    }

    if (response.data.symbol && response.data.isValid) {
      return {
        symbol: response.data.symbol,
        name: response.data.name || response.data.symbol,
        exchange: response.data.exchange || '',
        assetType: response.data.assetType || 'EQUITY',
        currency: response.data.currency || 'EUR',
        isin: response.data.isin,
        isValid: true,
      };
    }

    if (response.data.candidates && response.data.candidates.length > 0) {
      return response.data.candidates[0];
    }

    return null;
  },

  /**
   * GET /api/chart/:symbol?range=1M - Fetch historical closing price points
   */
  async getChart(symbol: string, range: Timeframe = '1M'): Promise<ChartDataPoint[]> {
    const response = await api.get<{
      success: boolean;
      data: ChartDataPoint[];
    }>(`/chart/${encodeURIComponent(symbol)}`, {
      params: { range },
    });
    return response.data?.data || [];
  },

  /**
   * POST /api/assets/:symbol/report?refresh=false - Generate or fetch Gemini macro analysis
   */
  async getReport(symbol: string, refresh = false): Promise<ReportResponse> {
    const response = await api.post<ReportResponse>(
      `/assets/${encodeURIComponent(symbol)}/report`,
      { refresh },
      { params: { refresh: refresh ? 'true' : 'false' } }
    );
    return response.data;
  },

  /**
   * POST /api/reports/batch - Batch update reports
   */
  async batchReports(refresh = false): Promise<any> {
    const response = await api.post('/reports/batch', { refresh });
    return response.data;
  },

  /**
   * GET /api/health - Get backend status
   */
  async getHealth(): Promise<{ status: string; tracked_assets_count: number }> {
    const response = await api.get('/health');
    return response.data;
  },
};
