import React from 'react';
import { X, Copy, Check, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { TrackedAsset } from '../types/asset';
import { PriceChart } from './PriceChart';
import { AIReportPanel } from './AIReportPanel';

interface AssetDetailModalProps {
  asset: TrackedAsset | null;
  isOpen: boolean;
  onClose: () => void;
}

export const AssetDetailModal: React.FC<AssetDetailModalProps> = ({
  asset,
  isOpen,
  onClose,
}) => {
  const [copiedIsin, setCopiedIsin] = React.useState(false);

  if (!isOpen || !asset) return null;

  const handleCopyIsin = () => {
    if (asset.isin) {
      navigator.clipboard.writeText(asset.isin);
      setCopiedIsin(true);
      setTimeout(() => setCopiedIsin(false), 2000);
    }
  };

  const changePct = asset.priceChangePct ?? 0;
  const isPositive = changePct > 0;
  const isNegative = changePct < 0;

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

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-200">
      <div className="relative w-full max-w-5xl bg-[#0F172A] border border-gray-800 rounded-3xl shadow-2xl overflow-hidden my-auto max-h-[92vh] flex flex-col">
        {/* Modal Header */}
        <div className="p-6 border-b border-gray-800 flex items-start justify-between bg-gray-900/60 shrink-0">
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="font-mono text-2xl font-extrabold text-white tracking-tight">
                {asset.symbol}
              </span>
              <span className="text-[11px] uppercase font-bold px-2 py-0.5 rounded-md bg-indigo-950 text-indigo-400 border border-indigo-800/80">
                {asset.assetType || 'EQUITY'}
              </span>
              {asset.exchange && (
                <span className="text-[11px] uppercase font-bold px-2 py-0.5 rounded-md bg-gray-800 text-gray-300 border border-gray-700">
                  {asset.exchange}
                </span>
              )}
              {asset.isin && (
                <button
                  onClick={handleCopyIsin}
                  className="flex items-center gap-1 text-xs font-mono text-gray-400 bg-gray-800/80 hover:bg-gray-700/80 px-2.5 py-0.5 rounded-md border border-gray-700 transition-colors"
                  title="Copy ISIN"
                >
                  <span>ISIN: {asset.isin}</span>
                  {copiedIsin ? (
                    <Check className="w-3 h-3 text-emerald-400" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )}
                </button>
              )}
            </div>

            <h2 className="text-sm font-medium text-gray-300 mt-1">{asset.name}</h2>

            <div className="flex items-baseline gap-3 mt-3">
              <span className="text-3xl font-extrabold font-mono text-white tracking-tight">
                {formatPrice(asset.lastClose, asset.currency)}
              </span>

              <span
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold font-mono ${
                  isPositive
                    ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                    : isNegative
                    ? 'bg-rose-950 text-rose-400 border border-rose-800'
                    : 'bg-gray-800 text-gray-400 border border-gray-700'
                }`}
              >
                {isPositive && <TrendingUp className="w-3.5 h-3.5" />}
                {isNegative && <TrendingDown className="w-3.5 h-3.5" />}
                {changePct === 0 && <Minus className="w-3.5 h-3.5" />}
                <span>
                  {isPositive ? '+' : ''}
                  {changePct.toFixed(2)}%
                </span>
              </span>

              <span className="text-xs text-gray-500 font-mono">
                Prev Close: {formatPrice(asset.prevClose, asset.currency)}
              </span>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* Price History Area Chart */}
          <PriceChart
            symbol={asset.symbol}
            currency={asset.currency}
          />

          {/* Gemini Macro Intelligence Markdown Panel */}
          <AIReportPanel symbol={asset.symbol} name={asset.name} />
        </div>
      </div>
    </div>
  );
};
