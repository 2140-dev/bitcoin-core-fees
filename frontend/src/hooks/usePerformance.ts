import { useState, useEffect, useCallback } from "react";
import { api } from "../services/api";
import { PerformanceData } from "../types/api";
import { statsCache } from "../lib/statsCache";
import { useBlockHeight } from "./useBlockHeight";

/** Inclusion-history chart data over a block range (History page). */
export function usePerformance(target: number, chain?: string) {
  const [performanceData, setPerformanceData] = useState<PerformanceData>({ blocks: [], estimates: [], block_policy_estimates: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [startBlock, setStartBlock] = useState<number | null>(null);
  const [endBlock, setEndBlock] = useState<number | null>(null);
  const { latestBlock, syncHeight } = useBlockHeight(chain);

  const fetchPerformance = useCallback(async (start: number, end: number, confTarget: number, silent = false) => {
    try {
      if (!silent) setLoading(true);
      setError(null);
      const count = Math.max(1, end - start);
      const pData = await api.getPerformanceData(start, count, confTarget, chain);
      if (chain) statsCache.set(chain, confTarget, { performanceData: pData, startBlock: start, endBlock: end });
      setPerformanceData(pData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch performance data");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [chain]);

  // Chain change: reset range to the latest window, serve from cache, then refresh.
  useEffect(() => {
    if (!chain) return;
    let cancelled = false;
    const init = async () => {
      const cached = statsCache.get(chain, target);
      if (cached) {
        setPerformanceData(cached.performanceData);
        setStartBlock(cached.startBlock);
        setEndBlock(cached.endBlock);
        setLoading(false);
      }
      const h = await syncHeight();
      if (cancelled || !h) return;
      const s = h - 1000;
      setStartBlock(s);
      setEndBlock(h);
      fetchPerformance(s, h, target, !!cached);
    };
    init();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chain, syncHeight, fetchPerformance]);

  // Target change: cache-first refresh at the current range.
  useEffect(() => {
    if (!chain || startBlock === null || endBlock === null) return;
    const cached = statsCache.get(chain, target);
    if (cached) {
      setPerformanceData(cached.performanceData);
      setLoading(false);
    } else {
      fetchPerformance(startBlock, endBlock, target);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  const handleApply = () => {
    if (startBlock !== null && endBlock !== null) fetchPerformance(startBlock, endBlock, target);
  };

  return {
    blocks: performanceData.blocks,
    estimates: performanceData.estimates,
    blockPolicyEstimates: performanceData.block_policy_estimates,
    loading,
    error,
    startBlock,
    setStartBlock,
    endBlock,
    setEndBlock,
    latestBlock,
    handleApply,
    syncHeight,
  };
}
