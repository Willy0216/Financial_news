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
  Sparkles,
  Edit3,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
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

  // AI Macro Synthesis States
  const [macroReport, setMacroReport] = useState<{ markdown: string; modelUsed: string } | null>(
    null
  );
  const [generatingReport, setGeneratingReport] = useState<boolean>(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [isPromptModalOpen, setIsPromptModalOpen] = useState<boolean>(false);
  const [promptText, setPromptText] = useState<string>('');
  const [loadingPrompt, setLoadingPrompt] = useState<boolean>(false);
  const [isSynthesisCollapsed, setIsSynthesisCollapsed] = useState<boolean>(false);
  const [hasTriggeredSynthesis, setHasTriggeredSynthesis] = useState<boolean>(false);

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

  const handleGenerateMacroReport = async (customPrompt?: string) => {
    try {
      setGeneratingReport(true);
      setReportError(null);
      setHasTriggeredSynthesis(true);
      setIsSynthesisCollapsed(false);

      const result = await apiClient.generateMacroReport(customPrompt);
      setMacroReport(result);
    } catch (err: any) {
      setReportError(err.message || 'Failed to generate AI macro synthesis.');
    } finally {
      setGeneratingReport(false);
    }
  };

  const handleOpenPromptModal = async () => {
    try {
      setLoadingPrompt(true);
      setIsPromptModalOpen(true);
      const livePrompt = await apiClient.getMacroPrompt();
      setPromptText(livePrompt);
    } catch (err: any) {
      setPromptText(`// Failed to fetch live macro prompt: ${err.message}`);
    } finally {
      setLoadingPrompt(false);
    }
  };

  const handleRegenerateFromPrompt = () => {
    setIsPromptModalOpen(false);
    handleGenerateMacroReport(promptText);
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

            {/* AI Macro Synthesis Trigger Button */}
            <button
              onClick={() => {
                if (!hasTriggeredSynthesis && !macroReport) {
                  handleGenerateMacroReport();
                } else {
                  setIsSynthesisCollapsed(!isSynthesisCollapsed);
                }
              }}
              disabled={generatingReport || loading}
              title={
                macroReport
                  ? isSynthesisCollapsed
                    ? 'Expand AI Synthesis'
                    : 'Collapse AI Synthesis'
                  : 'Synthesize global macroeconomic regime using Gemini'
              }
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-xs font-semibold shadow-lg shadow-indigo-950/50 transition-all disabled:opacity-50 cursor-pointer"
            >
              {generatingReport ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5" />
              )}
              <span>
                {generatingReport
                  ? 'Analyzing...'
                  : macroReport
                  ? isSynthesisCollapsed
                    ? 'Show AI Synthesis'
                    : 'Hide AI Synthesis'
                  : 'AI Macro Synthesis'}
              </span>
            </button>

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
          {/* Pinned AI Global Macro Regime Synthesis Card */}
          {(hasTriggeredSynthesis || macroReport || generatingReport) && (
            <div className="rounded-2xl bg-indigo-950/30 border border-indigo-800/60 shadow-xl overflow-hidden transition-all duration-200">
              {/* Card Header (Always Pinned & Visible) */}
              <div
                onClick={() => setIsSynthesisCollapsed(!isSynthesisCollapsed)}
                className="p-4 bg-indigo-950/50 border-b border-indigo-800/40 flex items-center justify-between cursor-pointer select-none hover:bg-indigo-900/40 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-indigo-900/80 border border-indigo-700 flex items-center justify-center text-indigo-300 shadow-md">
                    <Sparkles className="w-4 h-4 text-indigo-300 animate-pulse" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-white tracking-tight">
                        AI Global Macro Regime Synthesis
                      </h3>
                      {macroReport?.modelUsed && (
                        <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-md bg-indigo-900/80 text-indigo-300 border border-indigo-700/80 font-mono">
                          {macroReport.modelUsed}
                        </span>
                      )}
                      {generatingReport && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-950/70 text-amber-300 border border-amber-800/80 font-mono animate-pulse">
                          Analyzing Live Regimes...
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-indigo-300/80">
                      Multi-indicator synthesis • Real-time quantitative regime classification
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={handleOpenPromptModal}
                    title="Inspect & customize prompt with live SSOT variables"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-900/60 hover:bg-indigo-800/80 border border-indigo-700/80 text-indigo-200 text-xs font-semibold transition cursor-pointer"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>Edit Prompt</span>
                  </button>

                  <button
                    onClick={() => handleGenerateMacroReport()}
                    disabled={generatingReport}
                    title="Re-run synthesis on fresh data"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow transition disabled:opacity-50 cursor-pointer"
                  >
                    <RefreshCw
                      className={`w-3.5 h-3.5 ${generatingReport ? 'animate-spin' : ''}`}
                    />
                    <span className="hidden sm:inline">Regenerate</span>
                  </button>

                  <button
                    onClick={() => setIsSynthesisCollapsed(!isSynthesisCollapsed)}
                    title={isSynthesisCollapsed ? 'Expand Synthesis' : 'Collapse Synthesis'}
                    className="p-1.5 rounded-xl bg-indigo-900/40 hover:bg-indigo-800/60 border border-indigo-700/60 text-indigo-300 hover:text-white transition cursor-pointer"
                  >
                    {isSynthesisCollapsed ? (
                      <ChevronDown className="w-4 h-4" />
                    ) : (
                      <ChevronUp className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* Card Body (Collapsible Content) */}
              {!isSynthesisCollapsed && (
                <div className="p-5 bg-slate-950/40">
                  {generatingReport ? (
                    <div className="py-10 flex flex-col items-center justify-center space-y-3">
                      <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
                      <p className="text-sm text-indigo-200 font-medium">
                        Synthesizing DXY, VIX, High Yield Spreads, and Real-Asset Gold ratios...
                      </p>
                      <p className="text-xs text-slate-400">
                        Consuming live 252-day quantitative dataset via SSOT prompt
                      </p>
                    </div>
                  ) : reportError ? (
                    <div className="p-4 rounded-xl bg-rose-950/50 border border-rose-800/80 text-rose-300 text-xs flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                        <span>{reportError}</span>
                      </div>
                      <button
                        onClick={() => handleGenerateMacroReport()}
                        className="px-3 py-1 bg-rose-900/60 hover:bg-rose-800 text-white rounded-lg text-xs font-semibold transition cursor-pointer"
                      >
                        Retry
                      </button>
                    </div>
                  ) : macroReport?.markdown ? (
                    <div className="report-markdown-content text-slate-300 font-normal leading-[1.85] text-sm max-h-[420px] overflow-y-auto pr-3 custom-scrollbar">
                      <ReactMarkdown
                        components={{
                          p: ({ children }) => <p className="my-3 text-slate-300">{children}</p>,
                          strong: ({ children }) => (
                            <strong className="font-black text-white bg-indigo-950/70 border border-indigo-500/30 px-1 py-0.5 rounded">
                              {children}
                            </strong>
                          ),
                          h1: ({ children }) => (
                            <h1 className="text-base font-bold text-white mt-4 mb-2">{children}</h1>
                          ),
                          h2: ({ children }) => (
                            <h2 className="text-sm font-bold text-indigo-200 mt-4 mb-2">{children}</h2>
                          ),
                          h3: ({ children }) => (
                            <h3 className="text-xs font-bold text-indigo-300 mt-3 mb-1.5">{children}</h3>
                          ),
                          ul: ({ children }) => <ul className="space-y-1.5 my-2 list-disc pl-5">{children}</ul>,
                          ol: ({ children }) => (
                            <ol className="space-y-1.5 my-2 list-decimal pl-5">{children}</ol>
                          ),
                          li: ({ children }) => <li className="text-slate-300">{children}</li>,
                        }}
                      >
                        {macroReport.markdown}
                      </ReactMarkdown>
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          )}

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

      {/* Edit Global Macro Prompt Modal */}
      {isPromptModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="relative w-full max-w-4xl bg-[#0F172A] border border-indigo-700/80 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-gray-800 flex items-center justify-between bg-indigo-950/40">
              <div className="flex items-center gap-2">
                <Edit3 className="w-5 h-5 text-indigo-400" />
                <h3 className="text-base font-bold text-white">
                  Inspect & Edit Global Macro Prompt (SSOT)
                </h3>
              </div>
              <button
                onClick={() => setIsPromptModalOpen(false)}
                className="p-1 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 flex-1 overflow-y-auto">
              {loadingPrompt ? (
                <div className="py-16 flex items-center justify-center gap-2 text-indigo-300">
                  <Loader2 className="w-6 h-6 animate-spin" />
                  <span>Loading live macro indicators...</span>
                </div>
              ) : (
                <textarea
                  value={promptText}
                  onChange={(e) => setPromptText(e.target.value)}
                  className="w-full h-96 p-4 rounded-xl bg-gray-950 border border-gray-800 text-gray-200 font-mono text-xs focus:outline-none focus:border-indigo-500 leading-relaxed custom-scrollbar"
                />
              )}
            </div>

            <div className="p-4 border-t border-gray-800 bg-gray-900/60 flex items-center justify-end gap-2.5">
              <button
                onClick={() => setIsPromptModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-semibold transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleRegenerateFromPrompt}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition cursor-pointer"
              >
                <Sparkles className="w-4 h-4" />
                <span>Re-Synthesize Macro Regime</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
