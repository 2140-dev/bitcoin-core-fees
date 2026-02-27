import { useState, useEffect, useCallback } from "react";
import { api } from "../services/api";
import { AnalyticsSummary, MempoolHealthStats } from "../types/api";

export function useStats(target: number = 2) {
  const [performanceData, setPerformanceData] = useState<{ blocks: any[]; estimates: any[] }>({ blocks: [], estimates: [] });
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
      
      const [pData, fSum, feeEst] = await Promise.all([
        api.getPerformanceData(start, count, confTarget),
        api.getFeesSum(start, confTarget),
        api.getFeeEstimate(confTarget, "unset", 2)
      ]);

      setPerformanceData(pData);
      setSummary(fSum);
      setHealthStats(feeEst.mempool_health_statistics || []);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to fetch performance data";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  const syncHeight = useCallback(async () => {
    try {
      const { blockcount } = await api.getBlockCount();
      setLatestBlock(blockcount);
      return blockcount;
    } catch (err) {
      return null;
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      const currentHeight = await syncHeight();
      if (currentHeight && startBlock === null) {
        const s = currentHeight - 100; // Default to 100 for clarity
        const e = currentHeight;
        setStartBlock(s);
        setEndBlock(e);
        fetchData(s, e, target);
      }
    };
    init();
  }, [syncHeight]);

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
