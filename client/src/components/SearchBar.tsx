import React, { useState, useEffect, useRef } from 'react';
import { Search, Loader2, Plus, Check, AlertCircle } from 'lucide-react';
import { apiClient } from '../api/client';
import { ResolveResult } from '../types/asset';

interface SearchBarProps {
  onAssetAdded: () => void;
}

export const SearchBar: React.FC<SearchBarProps> = ({ onAssetAdded }) => {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ResolveResult | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [addedSuccess, setAddedSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Debounced search (350ms)
  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setResult(null);
      setLoading(false);
      setHasSearched(false);
      setIsOpen(false);
      setErrorMessage(null);
      return;
    }

    setLoading(true);
    setHasSearched(false);
    setErrorMessage(null);
    setIsOpen(true);

    const timer = setTimeout(async () => {
      try {
        const res = await apiClient.resolveQuery(trimmed);
        setResult(res);
        setHasSearched(true);
      } catch (err: any) {
        setErrorMessage(err.response?.data?.error || 'Resolution failed');
        setResult(null);
        setHasSearched(true);
      } finally {
        setLoading(false);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [query]);

  const handleAddAsset = async () => {
    if (!result?.symbol) return;
    setIsAdding(true);
    setErrorMessage(null);

    try {
      // Use resolved isin if available, otherwise symbol
      await apiClient.addAsset(result.isin || result.symbol);
      setAddedSuccess(true);
      setTimeout(() => {
        setAddedSuccess(false);
        setIsOpen(false);
        setQuery('');
        setResult(null);
        onAssetAdded();
      }, 700);
    } catch (err: any) {
      const msg = err.response?.data?.error || 'Failed to add asset to watchlist.';
      setErrorMessage(msg);
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <div ref={containerRef} className="relative w-full max-w-xl">
      {/* Search Input Box */}
      <div className="relative flex items-center">
        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
          ) : (
            <Search className="w-4 h-4" />
          )}
        </div>

        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => {
            if (query.trim()) setIsOpen(true);
          }}
          placeholder="Search by Ticker (e.g. AAPL, VWCE.DE) or ISIN (e.g. US0378331005)..."
          className="w-full pl-10 pr-4 py-2.5 bg-gray-900/90 border border-gray-700/80 rounded-xl text-sm text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all shadow-inner"
        />

        {query && (
          <button
            onClick={() => {
              setQuery('');
              setIsOpen(false);
            }}
            className="absolute inset-y-0 right-0 pr-3 flex items-center text-xs text-gray-400 hover:text-gray-200"
          >
            Clear
          </button>
        )}
      </div>

      {/* Dropdown Results Box */}
      {isOpen && query.trim().length > 0 && (
        <div className="absolute left-0 right-0 mt-2 z-50 bg-gray-900 border border-gray-800 rounded-xl shadow-2xl overflow-hidden backdrop-blur-md animate-in fade-in duration-150">
          {loading ? (
            <div className="px-4 py-6 flex items-center justify-center space-x-2 text-sm text-gray-400">
              <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
              <span>Resolving market instrument & verifying liquidity...</span>
            </div>
          ) : result && result.isValid ? (
            <div className="p-3">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 px-2 pb-1.5 flex items-center justify-between">
                <span>Resolved Instrument</span>
                <span className="text-emerald-400 flex items-center gap-1 font-mono">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  Active & Tradable
                </span>
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-lg bg-gray-800/60 hover:bg-gray-800 transition-colors border border-gray-700/50">
                <div className="flex-1 min-w-0 pr-3">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-100 font-mono text-base">
                      {result.symbol}
                    </span>
                    {result.exchange && (
                      <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-gray-700 text-gray-300">
                        {result.exchange}
                      </span>
                    )}
                    <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-indigo-900/60 text-indigo-300 border border-indigo-700/50">
                      {result.assetType || 'EQUITY'}
                    </span>
                    {result.currency && (
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-gray-700/80 text-gray-300">
                        {result.currency}
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-gray-300 truncate mt-0.5 font-medium">
                    {result.name}
                  </p>

                  {result.isin && (
                    <p className="text-[11px] text-gray-400 font-mono mt-0.5">
                      ISIN: <span className="text-gray-300">{result.isin}</span>
                    </p>
                  )}
                </div>

                {/* Add to Watchlist Button */}
                <button
                  onClick={handleAddAsset}
                  disabled={isAdding || addedSuccess}
                  className={`flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all shadow-md ${
                    addedSuccess
                      ? 'bg-emerald-600 text-white'
                      : 'bg-indigo-600 hover:bg-indigo-500 text-white hover:shadow-indigo-500/25'
                  } disabled:opacity-50`}
                >
                  {addedSuccess ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Added!</span>
                    </>
                  ) : isAdding ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <>
                      <Plus className="w-3.5 h-3.5" />
                      <span>Watchlist</span>
                    </>
                  )}
                </button>
              </div>

              {errorMessage && (
                <div className="mt-2 px-2.5 py-1.5 rounded-lg bg-red-900/30 border border-red-800/50 text-red-300 text-xs flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}
            </div>
          ) : hasSearched ? (
            <div className="px-4 py-6 text-center text-sm text-gray-400">
              <p className="text-gray-300 font-medium">No matching instruments found</p>
              <p className="text-xs text-gray-500 mt-1">
                Please verify the ticker symbol (e.g. <span className="text-gray-400 font-mono">AAPL</span>, <span className="text-gray-400 font-mono">VWCE.DE</span>) or 12-character ISIN.
              </p>
              {errorMessage && (
                <p className="text-xs text-red-400 mt-2 font-mono">{errorMessage}</p>
              )}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
};
