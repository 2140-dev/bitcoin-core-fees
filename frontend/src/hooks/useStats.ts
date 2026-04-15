import { useState, useEffect, useCallback } from "react";
import { api } from "../services/api";
import { AnalyticsSummary, PerformanceData } from "../types/api";
import { statsCache } from "../lib/statsCache";

export function useStats(target: number = 2, chain?: string) {
  const [performanceData, setPerformanceData] = useState<PerformanceData>({ blocks: [], estimates: [] });
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [startBlock, setStartBlock] = useState<number | null>(null);
  const [endBlock, setEndBlock] = useState<number | null>(null);
  const [latestBlock, setLatestBlock] = useState<number | null>(null);

  const fetchData = useCallback(async (start: number, end: number, confTarget: number, silent = false) => {
    try {
      if (!silent) setLoading(true);
      setError(null);

      const count = Math.max(1, end - start);

      const [pData, fSum] = await Promise.all([
        api.getPerformanceData(start, count, confTarget, chain),
        api.getFeesSum(start, confTarget, chain),
      ]);

      if (chain) {
        statsCache.set(chain, confTarget, { performanceData: pData, summary: fSum, startBlock: start, endBlock: end });
      }
      setPerformanceData(pData);
      setSummary(fSum);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to fetch performance data";
      setError(msg);
    } finally {
      if (!silent) setLoading(false);
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

  // Reset range and refetch when chain changes.
  useEffect(() => {
    if (!chain) return;
    let cancelled = false;
    const init = async () => {
      // Serve from cache immediately if available.
      const cached = statsCache.get(chain, target);
      const hasCached = !!cached;
      if (cached) {
        setPerformanceData(cached.performanceData);
        setSummary(cached.summary);
        setStartBlock(cached.startBlock);
        setEndBlock(cached.endBlock);
        setLoading(false);
      }

      const currentHeight = await syncHeight();
      if (cancelled || !currentHeight) return;
      const s = currentHeight - 1000;
      const e = currentHeight;
      setStartBlock(s);
      setEndBlock(e);
      fetchData(s, e, target, hasCached);
    };
    init();
    return () => { cancelled = true; };
  // fetchData changes when chain changes, so this fires on chain switch.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chain, syncHeight, fetchData]);

  // Refetch with the current range when target changes, without resetting block range.
  useEffect(() => {
    if (!chain || startBlock === null || endBlock === null) return;
    // Serve from cache immediately if available.
    const cached = statsCache.get(chain, target);
    if (cached) {
      setPerformanceData(cached.performanceData);
      setSummary(cached.summary);
      setLoading(false);
      return;
    }
    fetchData(startBlock, endBlock, target);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  const handleApply = () => {
    if (startBlock !== null && endBlock !== null) {
      fetchData(startBlock, endBlock, target);
    }
  };

  return {
    blocks: performanceData.blocks,
    estimates: performanceData.estimates,
    summary,
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
