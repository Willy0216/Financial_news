import React, { useState, useEffect } from 'react';
import {
  Copy,
  Check,
  Trash2,
  TrendingUp,
  TrendingDown,
  Minus,
  Sparkles,
  Loader2,
} from 'lucide-react';
import { TrackedAsset, Timeframe } from '../types/asset';
import { apiClient } from '../api/client';

export type TimeArc = '1D' | '1W' | '1M' | '6M' | '1Y' | 'YTD';

const TIME_ARCS: TimeArc[] = ['1D', '1W', '1M', '6M', '1Y', 'YTD'];

interface WatchlistTableProps {
  assets: TrackedAsset[];
  loading: boolean;
  onSelectAsset: (asset: TrackedAsset) => void;
  onDeleteAsset: (symbol: string) => void;
  selectedTimeArc?: TimeArc;
  onTimeArcChange?: (timeArc: TimeArc) => void;
}

export const WatchlistTable: React.FC<WatchlistTableProps> = ({
  assets,
  loading,
  onSelectAsset,
  onDeleteAsset,
  selectedTimeArc: externalTimeArc,
  onTimeArcChange,
}) => {
  const [internalTimeArc, setInternalTimeArc] = useState<TimeArc>('1D');
  const timeArc = externalTimeArc ?? internalTimeArc;

  const [copiedIsin, setCopiedIsin] = useState<string | null>(null);
  const [deletingSymbol, setDeletingSymbol] = useState<string | null>(null);

  // Cache for historical period returns: { [symbol]: { [timeArc]: number } }
  const [periodReturns, setPeriodReturns] = useState<Record<string, Record<string, number>>>({});
  const [loadingTimeArc, setLoadingTimeArc] = useState<boolean>(false);

  const handleTimeArcSelect = (arc: TimeArc) => {
    if (onTimeArcChange) {
      onTimeArcChange(arc);
    } else {
      setInternalTimeArc(arc);
    }
  };

  // Fetch historical data for all assets when a non-1D time arc is selected
  useEffect(() => {
    if (timeArc === '1D' || assets.length === 0) return;

    const tf = timeArc as Timeframe;
    const symbolsToFetch = assets
      .map((a) => a.symbol.toUpperCase())
      .filter((sym) => periodReturns[sym]?.[timeArc] === undefined);

    if (symbolsToFetch.length === 0) return;

    let isMounted = true;
    setLoadingTimeArc(true);

    Promise.all(
      symbolsToFetch.map(async (symbol) => {
        try {
          const points = await apiClient.getChart(symbol, tf);
          if (points && points.length >= 2) {
            const startPrice = points[0].close;
            const endPrice = points[points.length - 1].close;
            const pct = startPrice > 0 ? ((endPrice - startPrice) / startPrice) * 100 : 0;
            return { symbol, pct: Number(pct.toFixed(2)) };
          }
          return { symbol, pct: null };
        } catch {
          return { symbol, pct: null };
        }
      })
    ).then((results) => {
      if (isMounted) {
        setPeriodReturns((prev) => {
          const updated = { ...prev };
          for (const res of results) {
            if (res.pct !== null) {
              updated[res.symbol] = {
                ...(updated[res.symbol] || {}),
                [timeArc]: res.pct,
              };
            }
          }
          return updated;
        });
        setLoadingTimeArc(false);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [timeArc, assets]);

  const handleCopyIsin = (isin: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(isin);
    setCopiedIsin(isin);
    setTimeout(() => setCopiedIsin(null), 2000);
  };

  const handleDelete = async (symbol: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm(`Remove ${symbol} from your tracked watchlist?`)) {
      setDeletingSymbol(symbol);
      try {
        await onDeleteAsset(symbol);
      } finally {
        setDeletingSymbol(null);
      }
    }
  };

  const formatPrice = (price: number, currency: string) => {
    try {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currency || 'EUR',
        minimumFractionDigits: 2,
        maximumFractionDigits: 4,
      }).format(price);
    } catch {
      return `${currency} ${price?.toFixed(2) ?? '0.00'}`;
    }
  };

  const getAssetTypeBadgeColor = (type: string) => {
    switch (type?.toUpperCase()) {
      case 'ETF':
        return 'bg-blue-900/40 text-blue-300 border-blue-700/50';
      case 'INDEX':
        return 'bg-purple-900/40 text-purple-300 border-purple-700/50';
      case 'COMMODITY':
        return 'bg-amber-900/40 text-amber-300 border-amber-700/50';
      default:
        return 'bg-emerald-900/40 text-emerald-300 border-emerald-700/50';
    }
  };

  const getChangeForAsset = (asset: TrackedAsset): { changePct: number; isPending: boolean } => {
    if (timeArc === '1D') {
      return { changePct: asset.priceChangePct ?? 0, isPending: false };
    }

    const sym = asset.symbol.toUpperCase();
    const val = periodReturns[sym]?.[timeArc];

    if (val !== undefined) {
      return { changePct: val, isPending: false };
    }

    return { changePct: asset.priceChangePct ?? 0, isPending: loadingTimeArc };
  };

  if (loading && assets.length === 0) {
    return (
      <div className="w-full bg-gray-900/50 border border-gray-800 rounded-2xl p-12 flex flex-col items-center justify-center space-y-4">
        <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-sm text-gray-400 font-medium">Loading tracked assets...</p>
      </div>
    );
  }

  if (assets.length === 0) {
    return (
      <div className="w-full bg-gray-900/40 border border-gray-800 rounded-2xl p-12 text-center">
        <img
          src="/logo.jpg"
          alt="EconomicsUpdate Logo"
          className="w-16 h-16 rounded-2xl object-cover border border-gray-700/80 shadow-xl mx-auto mb-4"
        />
        <h3 className="text-lg font-bold text-gray-200">No Tracked Instruments Yet</h3>
        <p className="text-sm text-gray-400 max-w-md mx-auto mt-1">
          Use the search bar above to add global Stocks, ETFs, Indices, or Commodities by Ticker (e.g.{' '}
          <span className="text-gray-300 font-mono">AAPL</span>,{' '}
          <span className="text-gray-300 font-mono">VWCE.DE</span>) or ISIN.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Time Arc Selector Toolbar above the Table */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-1">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
            Performance Time Arc:
          </span>
          {loadingTimeArc && (
            <span className="flex items-center gap-1 text-[11px] text-indigo-400 font-mono animate-pulse">
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>Fetching {timeArc} data...</span>
            </span>
          )}
        </div>

        {/* Time Arc Buttons */}
        <div className="flex items-center bg-gray-900/90 p-1 rounded-xl border border-gray-800 shadow-inner">
          {TIME_ARCS.map((arc) => (
            <button
              key={arc}
              onClick={() => handleTimeArcSelect(arc)}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all ${
                timeArc === arc
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/60'
              }`}
            >
              {arc === '1D' ? '1D (Session)' : arc}
            </button>
          ))}
        </div>
      </div>

      {/* Main Table Card */}
      <div className="w-full bg-gray-900/70 border border-gray-800 rounded-2xl shadow-xl overflow-hidden backdrop-blur-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-gray-800 bg-gray-900/90 text-[11px] font-bold uppercase tracking-wider text-gray-400">
                <th className="py-3.5 px-5">Instrument</th>
                <th className="py-3.5 px-4">ISIN</th>
                <th className="py-3.5 px-4">Exchange / Currency</th>
                <th className="py-3.5 px-4 text-right">Latest Close</th>
                <th className="py-3.5 px-4 text-right">
                  {timeArc === '1D' ? 'Session Change (1D)' : `Change (${timeArc})`}
                </th>
                <th className="py-3.5 px-5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/60 text-sm">
              {assets.map((asset) => {
                const { changePct, isPending } = getChangeForAsset(asset);
                const isPositive = changePct > 0;
                const isNegative = changePct < 0;
                const isZero = changePct === 0;

                return (
                  <tr
                    key={asset.symbol}
                    onClick={() => onSelectAsset(asset)}
                    className="hover:bg-gray-800/50 transition-colors cursor-pointer group"
                  >
                    {/* Instrument Name & Ticker */}
                    <td className="py-4 px-5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-gray-800 border border-gray-700 flex items-center justify-center font-mono font-bold text-xs text-indigo-300 shrink-0">
                          {asset.symbol.slice(0, 3)}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-gray-100 font-mono text-sm group-hover:text-indigo-400 transition-colors">
                              {asset.symbol}
                            </span>
                            <span
                              className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded border ${getAssetTypeBadgeColor(
                                asset.assetType || 'EQUITY'
                              )}`}
                            >
                              {asset.assetType || 'EQUITY'}
                            </span>
                          </div>
                          <p className="text-xs text-gray-400 truncate max-w-xs sm:max-w-sm mt-0.5">
                            {asset.name}
                          </p>
                        </div>
                      </div>
                    </td>

                    {/* ISIN */}
                    <td className="py-4 px-4">
                      {asset.isin ? (
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-gray-800/80 border border-gray-700/60 text-xs font-mono text-gray-300">
                          <span>{asset.isin}</span>
                          <button
                            onClick={(e) => handleCopyIsin(asset.isin!, e)}
                            title="Copy ISIN to clipboard"
                            className="text-gray-400 hover:text-gray-200 transition-colors p-0.5"
                          >
                            {copiedIsin === asset.isin ? (
                              <Check className="w-3 h-3 text-emerald-400" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-600 font-mono">—</span>
                      )}
                    </td>

                    {/* Exchange / Currency */}
                    <td className="py-4 px-4">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] font-semibold uppercase px-2 py-0.5 rounded bg-gray-800 text-gray-300 border border-gray-700">
                          {asset.exchange || 'N/A'}
                        </span>
                        <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-gray-800/60 text-gray-400">
                          {asset.currency || 'EUR'}
                        </span>
                      </div>
                    </td>

                    {/* Latest Close / Price */}
                    <td className="py-4 px-4 text-right font-mono font-semibold text-gray-100">
                      {formatPrice(asset.lastClose, asset.currency)}
                    </td>

                    {/* Session / Time Arc Change */}
                    <td className="py-4 px-4 text-right">
                      {isPending ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold font-mono bg-gray-800 text-gray-400 border border-gray-700 animate-pulse">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          <span>...</span>
                        </span>
                      ) : (
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold font-mono ${
                            isPositive
                              ? 'bg-emerald-950/70 text-emerald-400 border border-emerald-800/60'
                              : isNegative
                              ? 'bg-rose-950/70 text-rose-400 border border-rose-800/60'
                              : 'bg-gray-800 text-gray-400 border border-gray-700'
                          }`}
                        >
                          {isPositive && <TrendingUp className="w-3 h-3" />}
                          {isNegative && <TrendingDown className="w-3 h-3" />}
                          {isZero && <Minus className="w-3 h-3" />}
                          <span>
                            {isPositive ? '+' : ''}
                            {changePct.toFixed(2)}%
                          </span>
                        </span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="py-4 px-5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectAsset(asset);
                          }}
                          title="View Details & AI Report"
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 hover:border-indigo-500/50 text-xs font-semibold transition-all"
                        >
                          <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                          <span>AI Report</span>
                        </button>

                        <button
                          onClick={(e) => handleDelete(asset.symbol, e)}
                          disabled={deletingSymbol === asset.symbol}
                          title="Remove asset"
                          className="p-1.5 rounded-lg text-gray-400 hover:text-rose-400 hover:bg-rose-950/30 border border-transparent hover:border-rose-900/50 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
