import React, { useState } from 'react';
import {
  Layers,
  Building2,
  Target,
  ChevronDown,
  ChevronUp,
  PieChart,
  ShieldCheck,
  Coins,
} from 'lucide-react';
import { UnderlyingProfileData } from '../types/asset';

interface AssetProfileCardProps {
  profile?: UnderlyingProfileData | null;
  assetType: string;
  symbol: string;
  name: string;
}

export const AssetProfileCard: React.FC<AssetProfileCardProps> = ({
  profile,
  assetType,
  symbol,
  name,
}) => {
  const [isSummaryExpanded, setIsSummaryExpanded] = useState<boolean>(false);

  if (!profile) return null;

  const hasHoldings = profile.topHoldings && profile.topHoldings.length > 0;
  const isCryptoOrCommodity =
    assetType === 'COMMODITY' ||
    Boolean(profile.underlyingAsset) ||
    symbol.includes('BTC') ||
    symbol.includes('BITC') ||
    symbol.includes('GC') ||
    symbol.includes('SGLN');

  return (
    <div className="w-full bg-gray-900/40 border border-gray-800 rounded-2xl p-5 sm:p-6 backdrop-blur-sm shadow-xl space-y-5">
      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-gray-800">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-600 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
            {isCryptoOrCommodity ? (
              <Coins className="w-5 h-5 text-white" />
            ) : hasHoldings ? (
              <PieChart className="w-5 h-5 text-white" />
            ) : (
              <Building2 className="w-5 h-5 text-white" />
            )}
          </div>
          <div>
            <h3 className="font-bold text-base text-gray-100 flex items-center gap-2">
              <span>Product Profile & Underlying Assets</span>
            </h3>
            <p className="text-xs text-gray-400">
              Portfolio basket, issuer metadata, and asset profile for {name} ({symbol})
            </p>
          </div>
        </div>

        {/* Badges */}
        <div className="flex flex-wrap items-center gap-2">
          {profile.categoryName && (
            <span className="text-[11px] font-semibold bg-gray-800 text-gray-300 px-2.5 py-1 rounded-lg border border-gray-700">
              {profile.categoryName}
            </span>
          )}
          {profile.family && (
            <span className="text-[11px] font-semibold bg-indigo-950/80 text-indigo-300 px-2.5 py-1 rounded-lg border border-indigo-700/60">
              {profile.family}
            </span>
          )}
          {profile.sector && (
            <span className="text-[11px] font-semibold bg-blue-950/80 text-blue-300 px-2.5 py-1 rounded-lg border border-blue-700/60">
              {profile.sector} {profile.industry ? `· ${profile.industry}` : ''}
            </span>
          )}
        </div>
      </div>

      {/* Benchmark Banner (if ETF / Fund) */}
      {profile.benchmark && (
        <div className="flex items-center gap-2 text-xs bg-gray-950/60 border border-gray-800/80 px-3.5 py-2 rounded-xl text-gray-300">
          <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
          <span className="text-gray-400">Benchmark Index:</span>
          <span className="font-semibold text-gray-200">{profile.benchmark}</span>
        </div>
      )}

      {/* Commodity / Crypto Underlying Asset Callout */}
      {profile.underlyingAsset && (
        <div className="flex items-start gap-3 bg-amber-950/20 border border-amber-800/40 p-3.5 rounded-xl text-xs text-amber-200/90">
          <Target className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold text-amber-300">Underlying Spot Target: </span>
            <span className="text-gray-200 font-medium">{profile.underlyingAsset}</span>
          </div>
        </div>
      )}

      {/* ETF Top 10 Holdings Table */}
      {hasHoldings && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-gray-300 uppercase tracking-wider flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-indigo-400" />
              <span>Top Portfolio Basket Holdings ({profile.topHoldings!.length})</span>
            </span>
            <span className="text-[11px] text-gray-400 font-mono">Weight (%)</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-72 overflow-y-auto pr-1">
            {profile.topHoldings!.map((holding, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between text-xs py-2 px-3 rounded-xl bg-gray-800/40 hover:bg-gray-800/80 border border-gray-700/40 transition-colors"
              >
                <div className="flex items-center gap-2.5 min-w-0 max-w-[65%]">
                  <span className="text-gray-400 font-mono text-[10px] font-bold w-4 shrink-0">
                    #{idx + 1}
                  </span>
                  <div className="truncate">
                    <span className="text-gray-200 font-medium truncate block">
                      {holding.name}
                    </span>
                    {holding.symbol && (
                      <span className="text-gray-400 font-mono text-[10px]">
                        {holding.symbol}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2.5 shrink-0">
                  <div className="w-16 h-1.5 bg-gray-700/60 rounded-full overflow-hidden hidden sm:block">
                    <div
                      className="h-full bg-gradient-to-r from-indigo-500 to-cyan-400 rounded-full"
                      style={{ width: `${Math.min(holding.weightPct * 10, 100)}%` }}
                    />
                  </div>
                  <span className="text-gray-200 font-mono font-bold text-xs">
                    {holding.weightPct > 0 ? `${holding.weightPct.toFixed(2)}%` : '-'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Equity Business Summary */}
      {profile.summary && (
        <div className="space-y-2">
          <span className="text-xs font-bold text-gray-300 uppercase tracking-wider flex items-center gap-1.5">
            <Building2 className="w-3.5 h-3.5 text-blue-400" />
            <span>Business Summary</span>
          </span>
          <div className="bg-gray-950/40 border border-gray-800/80 p-3.5 rounded-xl">
            <p
              className={`text-xs text-gray-300 leading-relaxed ${
                isSummaryExpanded ? '' : 'line-clamp-3'
              }`}
            >
              {profile.summary}
            </p>
            {profile.summary.length > 200 && (
              <button
                onClick={() => setIsSummaryExpanded(!isSummaryExpanded)}
                className="mt-2 text-[11px] font-semibold text-indigo-400 hover:text-indigo-300 flex items-center gap-1 transition-colors cursor-pointer"
              >
                {isSummaryExpanded ? (
                  <>
                    <span>Show Less</span>
                    <ChevronUp className="w-3 h-3" />
                  </>
                ) : (
                  <>
                    <span>Read More</span>
                    <ChevronDown className="w-3 h-3" />
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
