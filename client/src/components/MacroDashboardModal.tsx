import React, { useState, useEffect } from 'react';
import {
  X,
  RefreshCw,
  Activity,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertCircle,
  HelpCircle,
  Loader2,
} from 'lucide-react';
import { MacroDashboardPayload, MacroIndicatorSummary, RegimeVariant } from '../types/macro';
import { apiClient } from '../api/client';

interface MacroDashboardModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const MacroDashboardModal: React.FC<MacroDashboardModalProps> = ({ isOpen, onClose }) => {
  const [data, setData] = useState<MacroDashboardPayload | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchMacroData = async (forceRefresh = false) => {
    try {
      if (forceRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);

      const payload = forceRefresh
        ? await apiClient.refreshMacroDashboard()
        : await apiClient.getMacroDashboard();

      setData(payload);
    } catch (err: any) {
      setError(err.message || 'Failed to load macroeconomic intelligence data.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchMacroData(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const formatValue = (key: string, val: number): string => {
    if (val === null || val === undefined || isNaN(val)) return '—';
    if (key === 'HY_OAS') return `${val.toFixed(2)}%`;
    if (key === 'COPPER_GOLD' || key === 'Copper_Gold_Ratio') return val.toFixed(2);
    if (key === 'VIX' || key === 'DXY') return val.toFixed(2);
    return val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const getRegimeBadgeStyles = (variant?: RegimeVariant) => {
    switch (variant) {
      case 'emerald':
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
      case 'amber':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
      case 'rose':
        return 'bg-rose-500/10 text-rose-400 border-rose-500/20';
      case 'blue':
        return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
      case 'slate':
      default:
        return 'bg-slate-800 text-slate-400 border-slate-700';
    }
  };

  const getCategoryBadgeColor = (category: string) => {
    switch (category) {
      case 'CURRENCY':
        return 'bg-blue-900/40 text-blue-300 border-blue-700/50';
      case 'VOLATILITY':
        return 'bg-purple-900/40 text-purple-300 border-purple-700/50';
      case 'CREDIT':
        return 'bg-amber-900/40 text-amber-300 border-amber-700/50';
      case 'RATIO':
        return 'bg-indigo-900/40 text-indigo-300 border-indigo-700/50';
      default:
        return 'bg-gray-800 text-gray-300 border-gray-700';
    }
  };

  const renderSparkline = (points: number[]) => {
    if (!points || points.length < 2) return null;
    const min = Math.min(...points);
    const max = Math.max(...points);
    const range = max - min === 0 ? 1 : max - min;
    const width = 120;
    const height = 34;

    const pathData = points
      .map((val, idx) => {
        const x = (idx / (points.length - 1)) * width;
        const y = height - ((val - min) / range) * (height - 8) - 4;
        return `${idx === 0 ? 'M' : 'L'} ${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');

    const isTrendingUp = points[points.length - 1] >= points[0];
    const strokeColor = isTrendingUp ? '#10B981' : '#F43F5E';

    return (
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-28 h-8 overflow-visible"
        aria-hidden="true"
      >
        <path
          d={pathData}
          fill="none"
          stroke={strokeColor}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-200">
      <div className="relative w-full max-w-6xl bg-[#0F172A] border border-gray-800 rounded-3xl shadow-2xl overflow-hidden my-auto max-h-[92vh] flex flex-col">
        {/* Modal Header */}
        <div className="p-6 border-b border-gray-800 flex items-start justify-between bg-gray-900/70 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-950/80 border border-indigo-700/60 flex items-center justify-center text-indigo-400 shrink-0 shadow-lg shadow-indigo-950/40">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-bold text-white tracking-tight">
                  Global Macro & Regime Indicators
                </h2>
                <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-md bg-indigo-950 text-indigo-300 border border-indigo-800/80 font-mono">
                  2Y Daily Alignment
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-0.5">
                Multi-source intelligence (Yahoo Finance & FRED) • 252-Day Rolling Z-Scores • Moving Averages
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {data?.lastUpdated && (
              <span className="hidden md:inline-block text-[11px] font-mono text-gray-400 bg-gray-800/60 px-2.5 py-1 rounded-lg border border-gray-700/50">
                Updated: {new Date(data.lastUpdated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}

            <button
              onClick={() => fetchMacroData(true)}
              disabled={refreshing || loading}
              title="Force recalculate and refresh macro metrics"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-semibold border border-gray-700 transition-all disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-indigo-400' : ''}`} />
              <span className="hidden sm:inline">Refresh Data</span>
            </button>

            <button
              onClick={onClose}
              className="p-1.5 rounded-xl text-gray-400 hover:text-white hover:bg-gray-800 border border-transparent hover:border-gray-700 transition-colors cursor-pointer"
              title="Close Dashboard"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 custom-scrollbar">
          {loading && !data ? (
            <div className="py-20 flex flex-col items-center justify-center space-y-4">
              <Loader2 className="w-10 h-10 text-indigo-500 animate-spin" />
              <p className="text-sm font-medium text-gray-300">
                Ingesting 2 years of daily data from Yahoo Finance and FRED...
              </p>
              <p className="text-xs text-gray-500">
                Computing forward-fill alignment, moving averages, and 252-day Z-scores
              </p>
            </div>
          ) : error ? (
            <div className="p-6 rounded-2xl bg-rose-950/40 border border-rose-800/60 text-rose-300 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-bold">Failed to load macro intelligence</h4>
                <p className="text-xs text-rose-200/80 mt-1">{error}</p>
                <button
                  onClick={() => fetchMacroData(true)}
                  className="mt-3 px-3 py-1 bg-rose-900/60 hover:bg-rose-800/80 text-rose-100 rounded-lg text-xs font-semibold transition cursor-pointer"
                >
                  Retry Calculation
                </button>
              </div>
            </div>
          ) : data ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {data.metrics.map((metric: MacroIndicatorSummary) => {
                const badgeStyle = getRegimeBadgeStyles(metric.regimeVariant);
                const isDistPositive = (metric.distSma200Pct ?? 0) > 0;
                const isDistNegative = (metric.distSma200Pct ?? 0) < 0;

                return (
                  <div
                    key={metric.key}
                    className="bg-gray-900/70 border border-gray-800 rounded-2xl p-5 shadow-lg flex flex-col justify-between hover:border-gray-700/80 transition-all group"
                  >
                    {/* Top Row: Name, Category, Regime */}
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span
                            className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded border ${getCategoryBadgeColor(
                              metric.category
                            )}`}
                          >
                            {metric.category}
                          </span>
                          <span
                            className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded border ${badgeStyle}`}
                          >
                            {metric.regime}
                          </span>
                        </div>

                        {/* Mini Sparkline */}
                        <div className="shrink-0">
                          {renderSparkline(metric.sparkline)}
                        </div>
                      </div>

                      <h3 className="text-sm font-bold text-gray-100 mt-2.5 group-hover:text-indigo-300 transition-colors">
                        {metric.name}
                      </h3>

                      {/* Main Value Display */}
                      <div className="flex items-baseline justify-between mt-2 pt-2 border-t border-gray-800/60">
                        <div>
                          <div className="text-2xl font-extrabold font-mono text-white tracking-tight">
                            {formatValue(metric.key, metric.latestValue)}
                          </div>
                          <span className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">
                            Latest Closing Price
                          </span>
                        </div>

                        {/* Z-Score 1Y Badge */}
                        <div className="text-right">
                          <div
                            className={`text-sm font-bold font-mono ${
                              metric.zScore1Y !== null && metric.zScore1Y >= 1.0
                                ? 'text-amber-400'
                                : metric.zScore1Y !== null && metric.zScore1Y <= -1.0
                                ? 'text-blue-400'
                                : 'text-emerald-400'
                            }`}
                          >
                            {metric.zScore1Y !== null
                              ? `${metric.zScore1Y > 0 ? '+' : ''}${metric.zScore1Y.toFixed(2)}σ`
                              : '—'}
                          </div>
                          <span className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">
                            1Y Z-Score
                          </span>
                        </div>
                      </div>

                      {/* Quantitative Stats Matrix */}
                      <div className="grid grid-cols-3 gap-2 mt-4 p-2.5 rounded-xl bg-gray-950/60 border border-gray-800/70 text-xs font-mono">
                        <div>
                          <span className="text-[10px] text-gray-500 uppercase block font-sans font-bold">
                            SMA 50
                          </span>
                          <span className="text-gray-300 font-semibold">
                            {metric.sma50 !== null ? formatValue(metric.key, metric.sma50) : '—'}
                          </span>
                        </div>

                        <div>
                          <span className="text-[10px] text-gray-500 uppercase block font-sans font-bold">
                            SMA 200
                          </span>
                          <span className="text-gray-300 font-semibold">
                            {metric.sma200 !== null ? formatValue(metric.key, metric.sma200) : '—'}
                          </span>
                        </div>

                        <div>
                          <span className="text-[10px] text-gray-500 uppercase block font-sans font-bold">
                            vs SMA 200
                          </span>
                          {metric.distSma200Pct !== null ? (
                            <span
                              className={`font-bold flex items-center gap-0.5 ${
                                isDistPositive
                                  ? 'text-emerald-400'
                                  : isDistNegative
                                  ? 'text-rose-400'
                                  : 'text-gray-400'
                              }`}
                            >
                              {isDistPositive && <TrendingUp className="w-3 h-3" />}
                              {isDistNegative && <TrendingDown className="w-3 h-3" />}
                              {metric.distSma200Pct === 0 && <Minus className="w-3 h-3" />}
                              {isDistPositive ? '+' : ''}
                              {metric.distSma200Pct.toFixed(2)}%
                            </span>
                          ) : (
                            <span className="text-gray-500">—</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Economic Description */}
                    <div className="mt-4 pt-3 border-t border-gray-800/60 flex items-start gap-2 text-[11px] text-gray-400 leading-relaxed">
                      <HelpCircle className="w-3.5 h-3.5 text-indigo-400/80 shrink-0 mt-0.5" />
                      <p>{metric.description}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-gray-800 bg-gray-900/60 flex items-center justify-between text-xs text-gray-400 shrink-0">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            Statistical indicators calculated over a 252-day rolling trading window
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-200 font-semibold transition cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
