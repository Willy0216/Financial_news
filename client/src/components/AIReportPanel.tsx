import React from 'react';
import ReactMarkdown from 'react-markdown';
import { Sparkles, RefreshCw, Clock, CheckCircle2, ShieldAlert, Cpu } from 'lucide-react';
import { useAIReport } from '../hooks/useAIReport';

interface AIReportPanelProps {
  symbol: string;
  name: string;
}

export const AIReportPanel: React.FC<AIReportPanelProps> = ({ symbol, name }) => {
  const { report, loading, refreshing, error, fetchReport } = useAIReport(symbol);

  const formatTimestamp = (dateStr?: string) => {
    if (!dateStr) return 'Just now';
    try {
      const date = new Date(dateStr);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  const modelName = report?.modelUsed || report?.model_used;

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
              {modelName && (
                <span className="inline-flex items-center gap-1 text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-indigo-950/90 text-indigo-300 border border-indigo-700/60">
                  <Cpu className="w-3 h-3 text-indigo-400" />
                  <span>{modelName}</span>
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
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold shadow-md shadow-indigo-600/20 transition-all cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span>{refreshing ? 'Analyzing...' : 'Refresh Analysis'}</span>
          </button>
        </div>
      </div>

      {/* Report Content Body */}
      <div className="mt-5">
        {loading ? (
          <div className="py-16 flex flex-col items-center justify-center space-y-4 text-center">
            <div className="relative">
              <div className="w-12 h-12 border-3 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin"></div>
              <Sparkles className="w-5 h-5 text-indigo-400 absolute inset-0 m-auto animate-pulse" />
            </div>
            <div className="space-y-1 max-w-md">
              <p className="text-sm font-semibold text-gray-200">
                Generating macro analysis with Gemini...
              </p>
              <p className="text-xs text-gray-400 leading-relaxed">
                Synthesizing market drivers, sector dynamics, and macroeconomic catalysts for <span className="text-indigo-300 font-medium">{name}</span> (<span className="font-mono">{symbol}</span>). This usually takes 10–25 seconds.
              </p>
            </div>
          </div>
        ) : error ? (
          <div className="p-4 rounded-xl bg-red-950/40 border border-red-800/60 text-red-300 text-sm flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Unable to Generate Analysis</p>
              <p className="text-xs text-red-400/90 mt-1">{error}</p>
              <button
                onClick={() => fetchReport(true)}
                className="mt-3 px-3 py-1 bg-red-900/60 hover:bg-red-800/60 text-red-200 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
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
                className="mt-3 px-3 py-1 bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-200 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
              >
                Force Generate Anyway
              </button>
            </div>
          </div>
        ) : report?.reportMarkdown ? (
          <div className="relative">
            {refreshing && (
              <div className="absolute inset-0 bg-gray-900/60 backdrop-blur-[2px] rounded-xl flex items-center justify-center z-10 animate-in fade-in duration-150">
                <div className="flex items-center gap-2 bg-gray-900 border border-gray-700 px-4 py-2 rounded-xl shadow-xl text-xs font-semibold text-indigo-300">
                  <RefreshCw className="w-4 h-4 animate-spin text-indigo-400" />
                  <span>Regenerating macro report with Gemini...</span>
                </div>
              </div>
            )}
            <div className="prose prose-invert max-w-none prose-headings:font-bold prose-headings:text-gray-100 prose-h1:text-xl prose-h2:text-lg prose-h3:text-base prose-h4:text-sm prose-p:text-gray-300 prose-p:text-sm prose-p:leading-relaxed prose-li:text-gray-300 prose-li:text-sm prose-strong:text-indigo-300 prose-code:font-mono prose-code:text-xs prose-code:bg-gray-800 prose-code:px-1 prose-code:py-0.5 prose-code:rounded">
              <ReactMarkdown>{report.reportMarkdown}</ReactMarkdown>
            </div>
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
