import React, { useState, useEffect, useCallback } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Sparkles,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { apiClient } from './api/client';
import { TrackedAsset } from './types/asset';
import { Header } from './components/Header';
import { WatchlistTable, TimeArc } from './components/WatchlistTable';
import { AssetDetailModal } from './components/AssetDetailModal';

export const App: React.FC = () => {
  const [assets, setAssets] = useState<TrackedAsset[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedAsset, setSelectedAsset] = useState<TrackedAsset | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState<boolean>(false);
  const [isBatchLoading, setIsBatchLoading] = useState<boolean>(false);
  const [selectedTimeArc, setSelectedTimeArc] = useState<TimeArc>('1D');
  const [notification, setNotification] = useState<{
    type: 'success' | 'error' | 'info';
    message: string;
  } | null>(null);

  const showNotification = (
    message: string,
    type: 'success' | 'error' | 'info' = 'success'
  ) => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4000);
  };

  const loadAssets = useCallback(async () => {
    try {
      setLoading(true);
      const data = await apiClient.getAssets();
      setAssets(data);
    } catch (err: any) {
      showNotification(err.message || 'Failed to load watchlist assets.', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAssets();
  }, [loadAssets]);

  const handleAssetAdded = () => {
    loadAssets();
    showNotification('Instrument added to watchlist successfully!', 'success');
  };

  const handleDeleteAsset = async (symbol: string) => {
    try {
      const success = await apiClient.deleteAsset(symbol);
      if (success) {
        setAssets((prev) => prev.filter((a) => a.symbol.toUpperCase() !== symbol.toUpperCase()));
        if (selectedAsset?.symbol.toUpperCase() === symbol.toUpperCase()) {
          setIsDetailOpen(false);
          setSelectedAsset(null);
        }
        showNotification(`Removed ${symbol} from watchlist.`, 'info');
      }
    } catch (err: any) {
      showNotification(`Failed to remove ${symbol}.`, 'error');
    }
  };

  const handleSelectAsset = (asset: TrackedAsset) => {
    setSelectedAsset(asset);
    setIsDetailOpen(true);
  };

  const handleBatchGenerate = async () => {
    if (assets.length === 0) return;
    setIsBatchLoading(true);
    try {
      const res = await apiClient.batchReports(true);
      showNotification(
        res.message || 'Batch AI report generation completed.',
        'success'
      );
      loadAssets();
    } catch (err: any) {
      showNotification(
        err.response?.data?.error || 'Failed to run batch analysis.',
        'error'
      );
    } finally {
      setIsBatchLoading(false);
    }
  };

  // Metric calculations
  const topGainer = [...assets].sort((a, b) => (b.priceChangePct ?? 0) - (a.priceChangePct ?? 0))[0];
  const topLoser = [...assets].sort((a, b) => (a.priceChangePct ?? 0) - (b.priceChangePct ?? 0))[0];

  return (
    <div className="min-h-screen bg-[#0B0F19] text-gray-100 flex flex-col font-['Plus_Jakarta_Sans',sans-serif]">
      {/* Sticky Header with Search */}
      <Header
        onAssetAdded={handleAssetAdded}
        onBatchGenerate={handleBatchGenerate}
        isBatchLoading={isBatchLoading}
        totalAssets={assets.length}
      />

      {/* Notification Toast */}
      {notification && (
        <div className="fixed bottom-6 right-6 z-50 animate-in slide-in-from-bottom-5 duration-300">
          <div
            className={`flex items-center gap-3 px-4 py-3 rounded-2xl shadow-2xl border backdrop-blur-md ${
              notification.type === 'success'
                ? 'bg-emerald-950/90 border-emerald-800/80 text-emerald-200'
                : notification.type === 'error'
                ? 'bg-rose-950/90 border-rose-800/80 text-rose-200'
                : 'bg-indigo-950/90 border-indigo-800/80 text-indigo-200'
            }`}
          >
            {notification.type === 'success' && <CheckCircle2 className="w-5 h-5 text-emerald-400" />}
            {notification.type === 'error' && <AlertCircle className="w-5 h-5 text-rose-400" />}
            {notification.type === 'info' && <Sparkles className="w-5 h-5 text-indigo-400" />}
            <span className="text-sm font-medium">{notification.message}</span>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Top Movers (Top Gainer & Top Laggard) */}
        {assets.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Top Performer */}
            <div className="bg-gray-900/60 border border-gray-800/80 rounded-2xl p-4 backdrop-blur-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                  Top Gainer (24h)
                </span>
                <div className="p-1.5 rounded-xl bg-emerald-950/60 border border-emerald-800/40 text-emerald-400">
                  <TrendingUp className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-2">
                {topGainer && (topGainer.priceChangePct ?? 0) > 0 ? (
                  <div className="flex items-baseline justify-between">
                    <span className="font-mono font-bold text-white text-base truncate">
                      {topGainer.symbol} <span className="text-xs text-gray-400 font-normal">({topGainer.name})</span>
                    </span>
                    <span className="font-mono font-bold text-emerald-400 text-sm">
                      +{topGainer.priceChangePct?.toFixed(2)}%
                    </span>
                  </div>
                ) : (
                  <span className="text-xs text-gray-500 font-mono">—</span>
                )}
              </div>
            </div>

            {/* Top Lag */}
            <div className="bg-gray-900/60 border border-gray-800/80 rounded-2xl p-4 backdrop-blur-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                  Top Laggard (24h)
                </span>
                <div className="p-1.5 rounded-xl bg-rose-950/60 border border-rose-800/40 text-rose-400">
                  <TrendingDown className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-2">
                {topLoser && (topLoser.priceChangePct ?? 0) < 0 ? (
                  <div className="flex items-baseline justify-between">
                    <span className="font-mono font-bold text-white text-base truncate">
                      {topLoser.symbol} <span className="text-xs text-gray-400 font-normal">({topLoser.name})</span>
                    </span>
                    <span className="font-mono font-bold text-rose-400 text-sm">
                      {topLoser.priceChangePct?.toFixed(2)}%
                    </span>
                  </div>
                ) : (
                  <span className="text-xs text-gray-500 font-mono">—</span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Watchlist Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold tracking-tight text-white">
                Tracked Watchlist
              </h2>
              <p className="text-xs text-gray-400">
                Live pricing, ISIN resolution, and Gemini macroeconomic analysis
              </p>
            </div>

            <button
              onClick={loadAssets}
              disabled={loading}
              title="Refresh quotes"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gray-900 hover:bg-gray-800 border border-gray-800 text-xs text-gray-300 font-semibold transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Refresh Quotes</span>
            </button>
          </div>

          <WatchlistTable
            assets={assets}
            loading={loading}
            onSelectAsset={handleSelectAsset}
            onDeleteAsset={handleDeleteAsset}
            selectedTimeArc={selectedTimeArc}
            onTimeArcChange={setSelectedTimeArc}
          />
        </div>
      </main>

      {/* Asset Deep Dive & Macro Report Modal */}
      <AssetDetailModal
        asset={selectedAsset}
        isOpen={isDetailOpen}
        onClose={() => {
          setIsDetailOpen(false);
          setSelectedAsset(null);
        }}
      />
    </div>
  );
};

export default App;
