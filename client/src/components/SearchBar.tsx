import React, { useState, useEffect, useRef } from 'react';
import { Search, Loader2, Plus, Check, AlertCircle } from 'lucide-react';
import { apiClient } from '../api/client';
import { ResolveResult } from '../types/asset';
import { formatCurrency } from '../utils/formatters';

interface SearchBarProps {
  onAssetAdded: () => void;
}

export const SearchBar: React.FC<SearchBarProps> = ({ onAssetAdded }) => {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [candidates, setCandidates] = useState<ResolveResult[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [addingSymbol, setAddingSymbol] = useState<string | null>(null);
  const [addedSymbols, setAddedSymbols] = useState<Set<string>>(new Set());
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

  // Debounced search (300ms)
  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setCandidates([]);
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
        if (res && res.candidates && res.candidates.length > 0) {
          setCandidates(res.candidates);
        } else if (res && res.bestMatch) {
          setCandidates([res.bestMatch]);
        } else {
          setCandidates([]);
        }
        setHasSearched(true);
      } catch (err: any) {
        setErrorMessage(err.response?.data?.error || 'Resolution failed');
        setCandidates([]);
        setHasSearched(true);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  const handleAddAsset = async (item: ResolveResult) => {
    const sym = item.symbol;
    setAddingSymbol(sym);
    setErrorMessage(null);

    try {
      // Use resolved isin if available, otherwise symbol
      await apiClient.addAsset(item.isin || item.symbol);
      setAddedSymbols((prev) => new Set(prev).add(sym));
      setTimeout(() => {
        setIsOpen(false);
        setQuery('');
        setCandidates([]);
        setAddingSymbol(null);
        onAssetAdded();
      }, 650);
    } catch (err: any) {
      const msg = err.response?.data?.error || `Failed to add ${sym} to watchlist.`;
      setErrorMessage(msg);
      setAddingSymbol(null);
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
          placeholder="Search by Ticker (e.g. BITC, SWDA, AAPL) or ISIN (e.g. US0378331005)..."
          className="w-full pl-10 pr-4 py-2.5 bg-gray-900/90 border border-gray-700/80 rounded-xl text-sm text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all shadow-inner"
        />

        {query && (
          <button
            onClick={() => {
              setQuery('');
              setIsOpen(false);
              setCandidates([]);
            }}
            className="absolute inset-y-0 right-0 pr-3 flex items-center text-xs text-gray-400 hover:text-gray-200 cursor-pointer"
          >
            Clear
          </button>
        )}
      </div>

      {/* Multi-Result Dropdown Results Box */}
      {isOpen && query.trim().length > 0 && (
        <div className="absolute left-0 right-0 mt-2 z-50 bg-gray-900/95 border border-gray-800 rounded-2xl shadow-2xl overflow-hidden backdrop-blur-md animate-in fade-in duration-150 max-h-96 flex flex-col">
          {loading ? (
            /* Loading Skeleton */
            <div className="p-3 space-y-2.5">
              <div className="flex items-center justify-between px-2 pb-1 border-b border-gray-800 text-[11px] text-gray-400">
                <span className="flex items-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400" />
                  Resolving market instruments across global exchanges...
                </span>
              </div>
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="p-3 rounded-xl bg-gray-800/40 border border-gray-700/30 animate-pulse flex items-center justify-between"
                >
                  <div className="space-y-1.5 flex-1">
                    <div className="flex items-center gap-2">
                      <div className="h-4 w-16 bg-gray-700 rounded"></div>
                      <div className="h-3.5 w-10 bg-gray-700/60 rounded"></div>
                      <div className="h-3.5 w-12 bg-gray-700/60 rounded"></div>
                    </div>
                    <div className="h-3 w-48 bg-gray-700/40 rounded"></div>
                  </div>
                  <div className="h-7 w-20 bg-gray-700/50 rounded-lg"></div>
                </div>
              ))}
            </div>
          ) : candidates.length > 0 ? (
            <>
              {/* Header Bar */}
              <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 px-3.5 py-2 bg-gray-950/70 border-b border-gray-800/80 flex items-center justify-between shrink-0">
                <span>
                  Found {candidates.length} matching {candidates.length === 1 ? 'instrument' : 'instruments'}
                </span>
                <span className="text-emerald-400 flex items-center gap-1 font-mono text-[10px]">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  Active & Tradable
                </span>
              </div>

              {/* Scrollable List */}
              <div className="overflow-y-auto divide-y divide-gray-800/60 p-2 space-y-1">
                {candidates.map((item) => {
                  const isAddingThis = addingSymbol === item.symbol;
                  const isAddedThis = addedSymbols.has(item.symbol);

                  return (
                    <div
                      key={item.symbol}
                      className="flex items-center justify-between p-2.5 rounded-xl hover:bg-gray-800/70 transition-colors group"
                    >
                      {/* Left: Metadata */}
                      <div className="flex-1 min-w-0 pr-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-bold text-gray-100 font-mono text-sm tracking-tight group-hover:text-indigo-300 transition-colors">
                            {item.symbol}
                          </span>
                          {item.exchange && (
                            <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.2 rounded bg-gray-800 text-gray-300 border border-gray-700">
                              {item.exchange}
                            </span>
                          )}
                          <span className="text-[10px] uppercase font-bold px-1.5 py-0.2 rounded bg-indigo-950/80 text-indigo-400 border border-indigo-800/60">
                            {item.assetType || 'EQUITY'}
                          </span>
                          {item.currency && (
                            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-gray-800/60 text-gray-400 border border-gray-700/50">
                              {item.currency}
                            </span>
                          )}
                        </div>

                        <p className="text-xs text-gray-300 truncate mt-1 font-medium">
                          {item.name}
                        </p>

                        <div className="flex items-center gap-3 mt-1 text-[11px] font-mono">
                          {item.lastPrice !== undefined && item.lastPrice !== null && (
                            <span className="font-bold text-indigo-300">
                              {formatCurrency(item.lastPrice, item.currency)}
                            </span>
                          )}
                          {item.isin && (
                            <span className="text-gray-400">
                              ISIN: <span className="text-gray-300">{item.isin}</span>
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Right: Action Button */}
                      <button
                        onClick={() => handleAddAsset(item)}
                        disabled={isAddingThis || isAddedThis}
                        className={`flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all shrink-0 cursor-pointer shadow-md ${
                          isAddedThis
                            ? 'bg-emerald-600 text-white'
                            : 'bg-indigo-600 hover:bg-indigo-500 text-white hover:shadow-indigo-500/25'
                        } disabled:opacity-75`}
                      >
                        {isAddedThis ? (
                          <>
                            <Check className="w-3.5 h-3.5" />
                            <span>Added</span>
                          </>
                        ) : isAddingThis ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span>Adding...</span>
                          </>
                        ) : (
                          <>
                            <Plus className="w-3.5 h-3.5" />
                            <span>Watchlist</span>
                          </>
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            </>
          ) : hasSearched ? (
            <div className="px-4 py-6 text-center text-sm text-gray-400">
              <p className="text-gray-300 font-medium">No matching instruments found</p>
              <p className="text-xs text-gray-500 mt-1">
                Please verify the ticker symbol (e.g. <span className="text-gray-400 font-mono">BITC</span>, <span className="text-gray-400 font-mono">SWDA</span>, <span className="text-gray-400 font-mono">AAPL</span>) or 12-character ISIN.
              </p>
            </div>
          ) : null}

          {errorMessage && (
            <div className="m-2 px-3 py-2 rounded-xl bg-red-900/30 border border-red-800/50 text-red-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 text-red-400" />
              <span>{errorMessage}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
