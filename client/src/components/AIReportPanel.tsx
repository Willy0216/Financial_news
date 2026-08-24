import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import {
  Sparkles,
  RefreshCw,
  Clock,
  CheckCircle2,
  ShieldAlert,
  Cpu,
  Edit3,
  X,
  RotateCcw,
  Copy,
  Check,
  Code2,
} from 'lucide-react';
import { useAIReport } from '../hooks/useAIReport';
import { apiClient } from '../api/client';

interface AIReportPanelProps {
  symbol: string;
  name: string;
}

export const AIReportPanel: React.FC<AIReportPanelProps> = ({ symbol, name }) => {
  const { report, loading, refreshing, error, fetchReport } = useAIReport(symbol);

  // Edit Prompt State
  const [isEditingPrompt, setIsEditingPrompt] = useState<boolean>(false);
  const [promptText, setPromptText] = useState<string>('');
  const [loadingPrompt, setLoadingPrompt] = useState<boolean>(false);
  const [copiedPrompt, setCopiedPrompt] = useState<boolean>(false);
  const [promptError, setPromptError] = useState<string | null>(null);

  // Helper to parse UTC timestamps from various formats (SQLite UTC strings without Z, ISO strings, etc.)
  const parseUtcDate = (dateStr?: string): Date => {
    if (!dateStr) return new Date();
    let s = String(dateStr).trim();
    if (!s.includes('T') && s.includes(' ')) {
      s = s.replace(' ', 'T');
    }
    if (!s.endsWith('Z') && !/[+-]\d{2}(:?\d{2})?$/.test(s)) {
      s = s + 'Z';
    }
    const d = new Date(s);
    return isNaN(d.getTime()) ? new Date(dateStr) : d;
  };

  // Format timestamp strictly to Europe/Rome timezone
  const formatTimestamp = (dateStr?: string) => {
    if (!dateStr) return 'Just now';
    try {
      const date = parseUtcDate(dateStr);
      const timeStr = date.toLocaleTimeString('en-GB', {
        timeZone: 'Europe/Rome',
        hour: '2-digit',
        minute: '2-digit',
      });
      const datePart = date.toLocaleDateString('en-GB', {
        timeZone: 'Europe/Rome',
        month: 'short',
        day: 'numeric',
      });
      return `${datePart}, ${timeStr} (Rome)`;
    } catch {
      return dateStr;
    }
  };

  const handleOpenEditPrompt = async () => {
    setIsEditingPrompt(true);
    setPromptError(null);

    if (!promptText) {
      setLoadingPrompt(true);
      try {
        const defaultPrompt = await apiClient.getPopulatedPrompt(symbol);
        setPromptText(defaultPrompt);
      } catch (err: any) {
        setPromptError(err.message || 'Failed to load populated prompt.');
      } finally {
        setLoadingPrompt(false);
      }
    }
  };

  const handleResetPrompt = async () => {
    setLoadingPrompt(true);
    setPromptError(null);
    try {
      const defaultPrompt = await apiClient.getPopulatedPrompt(symbol);
      setPromptText(defaultPrompt);
    } catch (err: any) {
      setPromptError(err.message || 'Failed to reset prompt.');
    } finally {
      setLoadingPrompt(false);
    }
  };

  const handleCopyPrompt = () => {
    if (promptText) {
      navigator.clipboard.writeText(promptText);
      setCopiedPrompt(true);
      setTimeout(() => setCopiedPrompt(false), 2000);
    }
  };

  const handleGenerateCustom = async () => {
    setIsEditingPrompt(false);
    await fetchReport(true, promptText.trim());
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

        {/* Status / Timestamp & Actions */}
        <div className="flex flex-wrap items-center gap-2.5">
          {report?.createdAt && (
            <div className="flex items-center gap-1.5 text-xs text-gray-400 bg-gray-800/80 px-2.5 py-1 rounded-lg border border-gray-700/60 font-mono">
              <Clock className="w-3.5 h-3.5 text-gray-400" />
              <span>
                {report.isHoliday ? 'Market Closed' : `Updated: ${formatTimestamp(report.createdAt)}`}
              </span>
            </div>
          )}

          {/* Edit Prompt Button */}
          <button
            onClick={handleOpenEditPrompt}
            disabled={loading || refreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-gray-200 hover:text-white text-xs font-semibold border border-gray-700 transition-all cursor-pointer shadow-sm"
            title="View and edit the populated Gemini prompt"
          >
            <Edit3 className="w-3.5 h-3.5 text-indigo-400" />
            <span>Edit Prompt</span>
          </button>

          {/* Refresh Analysis Button */}
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

      {/* Edit Prompt Modal / Overlay */}
      {isEditingPrompt && (
        <div className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-150">
          <div className="relative w-full max-w-3xl bg-[#0F172A] border border-gray-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[88vh]">
            {/* Modal Header */}
            <div className="p-5 border-b border-gray-800 bg-gray-900/80 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-indigo-950/80 border border-indigo-700/50 rounded-xl text-indigo-400">
                  <Code2 className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-gray-100">
                    Customize Gemini Prompt for {name} ({symbol})
                  </h4>
                  <p className="text-xs text-gray-400">
                    Live variables, pricing, and news are populated below. Edit freely and re-generate.
                  </p>
                </div>
              </div>

              <button
                onClick={() => setIsEditingPrompt(false)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
                title="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto flex-1 space-y-4">
              {loadingPrompt ? (
                <div className="py-20 flex flex-col items-center justify-center space-y-3 text-center">
                  <div className="w-8 h-8 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin"></div>
                  <p className="text-xs text-gray-400">Loading populated prompt template...</p>
                </div>
              ) : promptError ? (
                <div className="p-4 rounded-xl bg-red-950/40 border border-red-800 text-red-300 text-xs">
                  {promptError}
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-gray-400">
                    <span className="font-mono text-[11px] text-gray-400">
                      Characters: {promptText.length} | Lines: {promptText.split('\n').length}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleCopyPrompt}
                        className="flex items-center gap-1 text-[11px] font-mono px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors"
                      >
                        {copiedPrompt ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-400" />
                            <span>Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3 text-gray-400" />
                            <span>Copy</span>
                          </>
                        )}
                      </button>

                      <button
                        onClick={handleResetPrompt}
                        className="flex items-center gap-1 text-[11px] font-mono px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors"
                        title="Reset to default populated template"
                      >
                        <RotateCcw className="w-3 h-3 text-gray-400" />
                        <span>Reset Default</span>
                      </button>
                    </div>
                  </div>

                  <textarea
                    value={promptText}
                    onChange={(e) => setPromptText(e.target.value)}
                    rows={16}
                    className="w-full bg-[#050B14] border border-gray-700/80 rounded-xl p-4 font-mono text-xs text-gray-200 leading-relaxed focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 shadow-inner resize-y"
                    placeholder="Enter customized prompt instructions..."
                  />
                </div>
              )}
            </div>

            {/* Modal Actions Footer */}
            <div className="p-4 border-t border-gray-800 bg-gray-900/60 flex items-center justify-between gap-3">
              <button
                onClick={() => setIsEditingPrompt(false)}
                className="px-4 py-2 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white text-xs font-semibold transition-colors"
              >
                Close Tab
              </button>

              <button
                onClick={handleGenerateCustom}
                disabled={loadingPrompt || !promptText.trim()}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:opacity-50 text-white text-xs font-bold shadow-lg shadow-indigo-500/20 transition-all cursor-pointer"
              >
                <Sparkles className="w-4 h-4" />
                <span>Re-generate Analysis</span>
              </button>
            </div>
          </div>
        </div>
      )}

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
              <div className="flex items-center gap-2 mt-3">
                <button
                  onClick={() => fetchReport(true)}
                  className="px-3 py-1 bg-red-900/60 hover:bg-red-800/60 text-red-200 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                >
                  Retry Generation
                </button>
                <button
                  onClick={handleOpenEditPrompt}
                  className="px-3 py-1 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded-lg text-xs font-semibold transition-colors cursor-pointer border border-gray-700"
                >
                  Edit Prompt
                </button>
              </div>
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
              <div className="flex items-center gap-2 mt-3">
                <button
                  onClick={() => fetchReport(true)}
                  className="px-3 py-1 bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-200 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                >
                  Force Generate Anyway
                </button>
                <button
                  onClick={handleOpenEditPrompt}
                  className="px-3 py-1 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded-lg text-xs font-semibold transition-colors cursor-pointer border border-gray-700"
                >
                  Edit Prompt
                </button>
              </div>
            </div>
          </div>
        ) : report?.reportMarkdown ? (
          <div className="relative font-['Verdana',Geneva,Tahoma,sans-serif]">
            {refreshing && (
              <div className="absolute inset-0 bg-gray-900/60 backdrop-blur-[2px] rounded-xl flex items-center justify-center z-10 animate-in fade-in duration-150">
                <div className="flex items-center gap-2 bg-gray-900 border border-gray-700 px-4 py-2 rounded-xl shadow-xl text-xs font-semibold text-indigo-300">
                  <RefreshCw className="w-4 h-4 animate-spin text-indigo-400" />
                  <span>Regenerating macro report with Gemini...</span>
                </div>
              </div>
            )}
            <div className="report-markdown-content text-slate-300">
              <ReactMarkdown
                components={{
                  h1: ({ children }) => (
                    <h1 className="text-xl font-black text-white mt-8 mb-4 tracking-tight border-b border-gray-800/80 pb-3 flex items-center gap-2">
                      {children}
                    </h1>
                  ),
                  h2: ({ children }) => (
                    <h2 className="text-lg font-black text-white mt-8 mb-4 tracking-tight border-b border-gray-800/60 pb-2">
                      {children}
                    </h2>
                  ),
                  h3: ({ children }) => (
                    <h3 className="text-base font-extrabold text-indigo-200 mt-6 mb-3 tracking-tight">
                      {children}
                    </h3>
                  ),
                  h4: ({ children }) => (
                    <h4 className="text-[14.5px] font-black text-white mt-6 mb-3 tracking-wide flex items-center gap-2">
                      <span className="w-1.5 h-4 bg-indigo-500 rounded-full inline-block"></span>
                      {children}
                    </h4>
                  ),
                  p: ({ children }) => (
                    <p className="my-5 text-[14px] leading-[1.85] font-normal text-slate-300 tracking-[0.01em]">
                      {children}
                    </p>
                  ),
                  ul: ({ children }) => (
                    <ul className="my-4 space-y-3 list-disc pl-6 text-slate-300 text-[14px] leading-[1.85]">
                      {children}
                    </ul>
                  ),
                  ol: ({ children }) => (
                    <ol className="my-4 space-y-3 list-decimal pl-6 text-slate-300 text-[14px] leading-[1.85]">
                      {children}
                    </ol>
                  ),
                  li: ({ children }) => (
                    <li className="font-normal text-slate-300 my-2 leading-[1.85] pl-1">
                      {children}
                    </li>
                  ),
                  strong: ({ children }) => (
                    <strong className="font-black text-white bg-indigo-950/60 px-1.5 py-0.5 rounded border border-indigo-500/30 tracking-normal shadow-sm">
                      {children}
                    </strong>
                  ),
                  em: ({ children }) => (
                    <em className="italic text-slate-200">
                      {children}
                    </em>
                  ),
                  blockquote: ({ children }) => (
                    <blockquote className="my-5 border-l-4 border-indigo-500/80 bg-indigo-950/20 pl-4 py-2 rounded-r text-slate-300 italic text-[14px] leading-[1.8]">
                      {children}
                    </blockquote>
                  ),
                  hr: () => (
                    <hr className="my-8 border-gray-800/80" />
                  ),
                  code: ({ children }) => (
                    <code className="font-mono text-xs bg-gray-800/90 text-indigo-200 px-1.5 py-0.5 rounded border border-gray-700">
                      {children}
                    </code>
                  ),
                }}
              >
                {report.reportMarkdown}
              </ReactMarkdown>
            </div>
          </div>
        ) : (
          <div className="py-8 text-center text-sm text-gray-400 flex flex-col items-center gap-3">
            <p>No report available for {symbol}.</p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => fetchReport(true)}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold transition-colors"
              >
                Generate Analysis
              </button>
              <button
                onClick={handleOpenEditPrompt}
                className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-xs font-semibold transition-colors border border-gray-700"
              >
                Edit Prompt First
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
