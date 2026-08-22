import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { Sparkles, RefreshCw, Clock, CheckCircle2, ShieldAlert } from 'lucide-react';
import { apiClient } from '../api/client';
import { ReportResponse } from '../types/asset';

interface AIReportPanelProps {
  symbol: string;
  name: string;
}

export const AIReportPanel: React.FC<AIReportPanelProps> = ({ symbol, name }) => {
  const [report, setReport] = useState<ReportResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchReport = async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const res = await apiClient.getReport(symbol, refresh);
      setReport(res);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Failed to generate AI macro report.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchReport(false);
  }, [symbol]);

  const formatTimestamp = (dateStr?: string) => {
    if (!dateStr) return 'Just now';
    try {
      const date = new Date(dateStr);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="w-full bg-gray-900/40 border border-gray-800 rounded-2xl p-6 backdrop-blur-sm shadow-xl">
      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-gray-800">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/25">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-base text-gray-100">
                Gemini Macro Intelligence
              </h3>
              {report?.modelUsed && (
                <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-indigo-950/80 text-indigo-400 border border-indigo-800/60">
                  {report.modelUsed}
                </span>
              )}
            </div>
            <p className="text-xs text-gray-400">
              Macroeconomic drivers, sector dynamics, and key catalysts for {symbol}
            </p>
          </div>
        </div>

        {/* Status / Timestamp & Refresh Button */}
        <div className="flex items-center gap-3">
          {report?.createdAt && (
            <div className="flex items-center gap-1.5 text-xs text-gray-400 bg-gray-800/80 px-2.5 py-1 rounded-lg border border-gray-700/60 font-mono">
              <Clock className="w-3.5 h-3.5 text-gray-400" />
              <span>
                {report.isHoliday ? 'Market Closed' : `Updated: ${formatTimestamp(report.createdAt)}`}
              </span>
            </div>
          )}

          <button
            onClick={() => fetchReport(true)}
            disabled={loading || refreshing}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold shadow-md shadow-indigo-600/20 transition-all"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span>{refreshing ? 'Analyzing...' : 'Refresh Analysis'}</span>
          </button>
        </div>
      </div>

      {/* Report Content Body */}
      <div className="mt-5">
        {loading ? (
          <div className="py-12 flex flex-col items-center justify-center space-y-3">
            <div className="w-8 h-8 border-3 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-sm text-gray-400 font-medium">
              Generating macro intelligence report for {name} ({symbol})...
            </p>
          </div>
        ) : error ? (
          <div className="p-4 rounded-xl bg-red-950/40 border border-red-800/60 text-red-300 text-sm flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Unable to Generate Analysis</p>
              <p className="text-xs text-red-400/90 mt-1">{error}</p>
              <button
                onClick={() => fetchReport(true)}
                className="mt-3 px-3 py-1 bg-red-900/60 hover:bg-red-800/60 text-red-200 rounded-lg text-xs font-semibold transition-colors"
              >
                Retry Generation
              </button>
            </div>
          </div>
        ) : report?.isHoliday || (report?.status === 'skipped_zero_change' && !report.reportMarkdown) ? (
          <div className="p-4 rounded-xl bg-gray-800/50 border border-gray-700/60 text-gray-300 text-sm flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-gray-200">Market Inactive / Zero Change</p>
              <p className="text-xs text-gray-400 mt-1">
                The market recorded a 0.00% price change or was closed during the latest session. AI report generation was skipped to prevent redundant token consumption.
              </p>
              <button
                onClick={() => fetchReport(true)}
                className="mt-3 px-3 py-1 bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-200 rounded-lg text-xs font-semibold transition-colors"
              >
                Force Generate Anyway
              </button>
            </div>
          </div>
        ) : report?.reportMarkdown ? (
          <div className="prose prose-invert max-w-none prose-headings:font-bold prose-headings:text-gray-100 prose-h1:text-xl prose-h2:text-lg prose-h3:text-base prose-h4:text-sm prose-p:text-gray-300 prose-p:text-sm prose-p:leading-relaxed prose-li:text-gray-300 prose-li:text-sm prose-strong:text-indigo-300 prose-code:font-mono prose-code:text-xs prose-code:bg-gray-800 prose-code:px-1 prose-code:py-0.5 prose-code:rounded">
            <ReactMarkdown>{report.reportMarkdown}</ReactMarkdown>
          </div>
        ) : (
          <div className="py-8 text-center text-sm text-gray-400">
            No report available. Click "Refresh Analysis" to generate one.
          </div>
        )}
      </div>
    </div>
  );
};
