import { useState, useEffect, useCallback } from "react";
import { api } from "../services/api";
import { AnalyticsSummary, PerformanceData } from "../types/api";
import { statsCache } from "../lib/statsCache";

export type SummaryMode = "all-time" | "range";

export function useStats(target: number = 2, chain?: string) {
  const [performanceData, setPerformanceData] = useState<PerformanceData>({ blocks: [], estimates: [], block_policy_estimates: [] });
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  // Chart (inclusion history) and the accuracy summary load independently so
  // their "syncing" states are distinct and a slow summary never blocks the chart.
  const [chartLoading, setChartLoading] = useState(true);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Summary scope: all-time (precomputed, server-cached) or the selected range.
  const [summaryMode, setSummaryMode] = useState<SummaryMode>("all-time");

  const [startBlock, setStartBlock] = useState<number | null>(null);
  const [endBlock, setEndBlock] = useState<number | null>(null);
  const [latestBlock, setLatestBlock] = useState<number | null>(null);

  const fetchPerformance = useCallback(async (start: number, end: number, confTarget: number, silent = false) => {
    try {
      if (!silent) setChartLoading(true);
      setError(null);
      const count = Math.max(1, end - start);
      const pData = await api.getPerformanceData(start, count, confTarget, chain);
      if (chain) statsCache.set(chain, confTarget, { performanceData: pData, startBlock: start, endBlock: end });
      setPerformanceData(pData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch performance data");
    } finally {
      if (!silent) setChartLoading(false);
    }
  }, [chain]);

  const fetchSummary = useCallback(async (mode: SummaryMode, start: number, confTarget: number) => {
    try {
      setSummaryLoading(true);
      const fSum = await api.getFeesSum(start, confTarget, chain, mode === "all-time");
      setSummary(fSum);
    } catch {
      // Summary failure is non-fatal — keep the chart usable; leave prior value.
    } finally {
      setSummaryLoading(false);
    }
  }, [chain]);

  const syncHeight = useCallback(async () => {
    try {
      const { blockcount } = await api.getBlockCount(chain);
      setLatestBlock(blockcount);
      return blockcount;
    } catch {
      return null;
    }
  }, [chain]);

  // Chain change: reset the range to the latest window, serve the chart from
  // cache if present, then refresh both the chart and the summary.
  useEffect(() => {
    if (!chain) return;
    let cancelled = false;
    const init = async () => {
      const cached = statsCache.get(chain, target);
      if (cached) {
        setPerformanceData(cached.performanceData);
        setStartBlock(cached.startBlock);
        setEndBlock(cached.endBlock);
        setChartLoading(false);
      }
      const currentHeight = await syncHeight();
      if (cancelled || !currentHeight) return;
      const s = currentHeight - 1000;
      const e = currentHeight;
      setStartBlock(s);
      setEndBlock(e);
      fetchPerformance(s, e, target, !!cached);
      fetchSummary(summaryMode, s, target);
    };
    init();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chain, syncHeight, fetchPerformance, fetchSummary]);

  // Target change: refetch chart (cache-first) and summary at the current range.
  useEffect(() => {
    if (!chain || startBlock === null || endBlock === null) return;
    const cached = statsCache.get(chain, target);
    if (cached) {
      setPerformanceData(cached.performanceData);
      setChartLoading(false);
    } else {
      fetchPerformance(startBlock, endBlock, target);
    }
    fetchSummary(summaryMode, startBlock, target);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  // Summary-scope toggle: refetch the summary only (chart is unaffected).
  useEffect(() => {
    if (!chain || startBlock === null) return;
    fetchSummary(summaryMode, startBlock, target);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summaryMode]);

  const handleApply = () => {
    if (startBlock !== null && endBlock !== null) {
      fetchPerformance(startBlock, endBlock, target);
      // Only the range-scoped summary depends on the selected window.
      if (summaryMode === "range") fetchSummary("range", startBlock, target);
    }
  };

  return {
    blocks: performanceData.blocks,
    estimates: performanceData.estimates,
    blockPolicyEstimates: performanceData.block_policy_estimates,
    summary,
    summaryMode,
    setSummaryMode,
    chartLoading,
    summaryLoading,
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
