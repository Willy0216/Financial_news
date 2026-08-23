import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../api/client';
import { ReportResponse } from '../types/asset';

// Module-level in-memory session cache map persisting across component unmounts
const reportSessionCache = new Map<string, ReportResponse>();

export function useAIReport(symbol: string, initialFetch = true) {
  const cleanSymbol = symbol ? symbol.trim().toUpperCase() : '';

  const [report, setReport] = useState<ReportResponse | null>(() => {
    if (cleanSymbol && reportSessionCache.has(cleanSymbol)) {
      return reportSessionCache.get(cleanSymbol)!;
    }
    return null;
  });

  const [loading, setLoading] = useState<boolean>(() => {
    if (!cleanSymbol) return false;
    return !reportSessionCache.has(cleanSymbol) && initialFetch;
  });

  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchReport = useCallback(
    async (refresh = false) => {
      if (!cleanSymbol) return;

      if (refresh) {
        setRefreshing(true);
      } else {
        // If we already have session cache, use it immediately
        if (reportSessionCache.has(cleanSymbol)) {
          setReport(reportSessionCache.get(cleanSymbol)!);
          setLoading(false);
          setError(null);
          return;
        }
        setLoading(true);
      }
      setError(null);

      try {
        const res = await apiClient.getReport(cleanSymbol, refresh);
        reportSessionCache.set(cleanSymbol, res);
        setReport(res);
      } catch (err: any) {
        const msg =
          err.response?.data?.error ||
          err.message ||
          'Failed to generate AI macro report.';
        setError(msg);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [cleanSymbol]
  );

  useEffect(() => {
    if (!cleanSymbol) return;

    if (reportSessionCache.has(cleanSymbol)) {
      setReport(reportSessionCache.get(cleanSymbol)!);
      setLoading(false);
      setError(null);
    } else if (initialFetch) {
      fetchReport(false);
    }
  }, [cleanSymbol, initialFetch, fetchReport]);

  return {
    report,
    loading,
    refreshing,
    error,
    fetchReport,
    clearCache: () => reportSessionCache.delete(cleanSymbol),
  };
}

export { reportSessionCache };
