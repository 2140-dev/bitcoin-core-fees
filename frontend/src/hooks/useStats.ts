import { useState, useEffect, useCallback } from "react";
import { api } from "../services/api";
import { AnalyticsSummary, MempoolHealthStats, PerformanceData } from "../types/api";

export function useStats(target: number = 2, chain?: string) {
  const [performanceData, setPerformanceData] = useState<PerformanceData>({ blocks: [], estimates: [] });
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [healthStats, setHealthStats] = useState<MempoolHealthStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [startBlock, setStartBlock] = useState<number | null>(null);
  const [endBlock, setEndBlock] = useState<number | null>(null);
  const [latestBlock, setLatestBlock] = useState<number | null>(null);

  const fetchData = useCallback(async (start: number, end: number, confTarget: number) => {
    try {
      setLoading(true);
      setError(null);
      
      const count = Math.max(1, end - start);
      
      const [pData, fSum, health] = await Promise.all([
        api.getPerformanceData(start, count, confTarget, chain),
        api.getFeesSum(start, confTarget, chain),
        api.getMempoolHealth(chain),
      ]);

      setPerformanceData(pData);
      setSummary(fSum);
      setHealthStats(health);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to fetch performance data";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [chain]);

  const syncHeight = useCallback(async () => {
    try {
      const { blockcount } = await api.getBlockCount(chain);
      setLatestBlock(blockcount);
      return blockcount;
    } catch (err) {
      return null;
    }
  }, [chain]);

  // Reset default range and refetch whenever the chain changes (not only on first mount).
  // If we only initialized when startBlock === null, switching networks would keep the old
  // heights and never resync for the new chain.
  useEffect(() => {
    if (!chain) return;
    let cancelled = false;
    const init = async () => {
      const currentHeight = await syncHeight();
      if (cancelled || !currentHeight) return;
      const s = currentHeight - 1000;
      const e = currentHeight;
      setStartBlock(s);
      setEndBlock(e);
      fetchData(s, e, target);
    };
    init();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- target is applied via SYNC; only chain should reset range
  }, [chain, syncHeight, fetchData]);

  const handleApply = () => {
    if (startBlock !== null && endBlock !== null) {
      fetchData(startBlock, endBlock, target);
    }
  };

  return {
    blocks: performanceData.blocks,
    estimates: performanceData.estimates,
    summary,
    healthStats,
    loading,
    error,
    startBlock,
    setStartBlock,
    endBlock,
    setEndBlock,
    latestBlock,
    handleApply,
    syncHeight
  };
}
