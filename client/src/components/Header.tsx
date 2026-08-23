import React from 'react';
import { Sparkles, Activity } from 'lucide-react';
import { SearchBar } from './SearchBar';

interface HeaderProps {
  onAssetAdded: () => void;
  onBatchGenerate: () => void;
  onOpenMacro: () => void;
  isBatchLoading: boolean;
  totalAssets: number;
}

export const Header: React.FC<HeaderProps> = ({
  onAssetAdded,
  onBatchGenerate,
  onOpenMacro,
  isBatchLoading,
  totalAssets,
}) => {
  return (
    <header className="sticky top-0 z-30 bg-[#0B0F19]/90 backdrop-blur-md border-b border-gray-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-4">
          {/* App Branding */}
          <div className="flex items-center gap-3 shrink-0">
            <img
              src="/logo.jpg"
              alt="EconomicsUpdate Logo"
              className="w-10 h-10 rounded-xl object-cover border border-gray-700/80 shadow-md shadow-black/50"
            />
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-lg tracking-tight text-white font-['Plus_Jakarta_Sans']">
                  Economics<span className="text-indigo-400">Update</span>
                </span>
                <span className="text-[10px] uppercase font-bold tracking-widest px-1.5 py-0.5 rounded bg-indigo-950 text-indigo-400 border border-indigo-800/60">
                  AI Macro
                </span>
              </div>
              <p className="text-[11px] text-gray-400 hidden sm:block">
                Global Asset Tracking & Gemini Intelligence
              </p>
            </div>
          </div>

          {/* Centered Search Bar & Macro Button */}
          <div className="flex-1 flex justify-center max-w-2xl mx-auto">
            <div className="flex items-center gap-2.5 w-full">
              <div className="flex-1">
                <SearchBar onAssetAdded={onAssetAdded} />
              </div>
              <button
                onClick={onOpenMacro}
                title="Open Global Macro Intelligence & Regime Dashboard"
                className="flex items-center gap-2 px-3.5 py-2.5 text-xs font-semibold text-slate-200 bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 hover:border-indigo-500/50 rounded-xl transition shadow-sm whitespace-nowrap cursor-pointer shrink-0"
              >
                <Activity className="w-4 h-4 text-indigo-400" />
                <span className="hidden sm:inline">Macro Health</span>
              </button>
            </div>
          </div>

          {/* Actions & Health Status */}
          <div className="flex items-center gap-3 shrink-0">
            {totalAssets > 0 && (
              <button
                onClick={onBatchGenerate}
                disabled={isBatchLoading}
                title="Generate/Refresh macro analysis reports for all watchlist assets"
                className="flex items-center gap-2 px-3 py-2 rounded-xl bg-gray-900 hover:bg-gray-800 border border-gray-700/80 text-xs font-semibold text-gray-200 transition-all hover:border-gray-600 disabled:opacity-50 shadow-sm"
              >
                <Sparkles className={`w-3.5 h-3.5 text-indigo-400 ${isBatchLoading ? 'animate-spin' : ''}`} />
                <span className="hidden md:inline">Batch AI Reports</span>
              </button>
            )}

            <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-gray-900/60 border border-gray-800/80 text-xs text-gray-400">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span className="font-mono text-gray-300">{totalAssets}</span> Tracked
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};
