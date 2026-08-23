import React, { useState, useEffect } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { Loader2, TrendingUp, TrendingDown } from 'lucide-react';
import { apiClient } from '../api/client';
import { ChartDataPoint, Timeframe } from '../types/asset';
import { formatCurrency } from '../utils/formatters';

interface PriceChartProps {
  symbol: string;
  currency: string;
}

const TIMEFRAMES: Timeframe[] = ['1W', '1M', '6M', '1Y', 'YTD'];

export const PriceChart: React.FC<PriceChartProps> = ({
  symbol,
  currency,
}) => {
  const [timeframe, setTimeframe] = useState<Timeframe>('1M');
  const [data, setData] = useState<ChartDataPoint[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setError(null);

    apiClient
      .getChart(symbol, timeframe)
      .then((points) => {
        if (isMounted) {
          setData(points);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(err.message || 'Failed to load chart data');
        }
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [symbol, timeframe]);

  // Calculate timeframe price change
  const startPrice = data.length > 0 ? data[0].close : 0;
  const endPrice = data.length > 0 ? data[data.length - 1].close : 0;
  const periodDiff = endPrice - startPrice;
  const periodChangePct = startPrice > 0 ? (periodDiff / startPrice) * 100 : 0;
  const isPeriodPositive = periodDiff >= 0;

  const strokeColor = isPeriodPositive ? '#10B981' : '#EF4444';
  const gradientId = `gradient-${symbol}-${isPeriodPositive ? 'gain' : 'loss'}`;

  const minPrice = Math.min(...data.map((d) => d.close), Infinity);
  const maxPrice = Math.max(...data.map((d) => d.close), -Infinity);
  const yPadding = data.length > 0 ? (maxPrice - minPrice) * 0.05 : 0;

  // Custom Tooltip component
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const value = payload[0].value;
      return (
        <div className="bg-gray-900/95 border border-gray-700 p-3 rounded-xl shadow-2xl backdrop-blur-md">
          <p className="text-[11px] font-mono text-gray-400">{label}</p>
          <p className="text-base font-bold font-mono text-gray-100 mt-0.5">
            {formatCurrency(Number(value), currency, 2)}
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="w-full bg-gray-900/40 border border-gray-800 rounded-2xl p-5 backdrop-blur-sm">
      {/* Timeframe selector header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              {timeframe} Performance
            </span>
            {data.length > 1 && (
              <span
                className={`inline-flex items-center gap-1 text-xs font-mono font-bold px-2 py-0.5 rounded ${
                  isPeriodPositive
                    ? 'bg-emerald-950/70 text-emerald-400'
                    : 'bg-rose-950/70 text-rose-400'
                }`}
              >
                {isPeriodPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                {isPeriodPositive ? '+' : ''}
                {periodChangePct.toFixed(2)}% ({isPeriodPositive ? '+' : ''}
                {periodDiff.toFixed(2)} {currency})
              </span>
            )}
          </div>
        </div>

        {/* Timeframe Buttons */}
        <div className="flex items-center bg-gray-950/80 p-1 rounded-xl border border-gray-800">
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf}
              onClick={() => setTimeframe(tf)}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all ${
                timeframe === tf
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/60'
              }`}
            >
              {tf}
            </button>
          ))}
        </div>
      </div>

      {/* Chart container */}
      <div className="h-64 w-full relative">
        {loading ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center space-y-2 bg-gray-900/40 rounded-xl">
            <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
            <span className="text-xs text-gray-400 font-medium">Fetching market history...</span>
          </div>
        ) : error || data.length === 0 ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-xs text-gray-400 bg-gray-900/20 rounded-xl">
            <span>Chart data currently unavailable for {symbol} ({timeframe}).</span>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="5%"
                    stopColor={strokeColor}
                    stopOpacity={isPeriodPositive ? 0.35 : 0.3}
                  />
                  <stop offset="95%" stopColor={strokeColor} stopOpacity={0.0} />
                </linearGradient>
              </defs>

              <CartesianGrid strokeDasharray="3 3" stroke="#1F2937" vertical={false} />

              <XAxis
                dataKey="timestamp"
                tickLine={false}
                axisLine={{ stroke: '#374151' }}
                tick={{ fill: '#9CA3AF', fontSize: 11, fontFamily: 'monospace' }}
                tickFormatter={(tick) => {
                  const parts = tick.split('-');
                  return parts.length === 3 ? `${parts[1]}/${parts[2]}` : tick;
                }}
              />

              <YAxis
                domain={[
                  minPrice !== Infinity ? Math.floor(minPrice - yPadding) : 'auto',
                  maxPrice !== -Infinity ? Math.ceil(maxPrice + yPadding) : 'auto',
                ]}
                orientation="right"
                tickLine={false}
                axisLine={false}
                tick={{ fill: '#9CA3AF', fontSize: 11, fontFamily: 'monospace' }}
                tickFormatter={(val) => `${val}`}
              />

              <Tooltip content={<CustomTooltip />} />

              <Area
                type="monotone"
                dataKey="close"
                stroke={strokeColor}
                strokeWidth={2}
                fillOpacity={1}
                fill={`url(#${gradientId})`}
                activeDot={{ r: 5, fill: strokeColor, stroke: '#FFFFFF', strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
};
