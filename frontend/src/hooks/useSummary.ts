import { useState, useEffect, useCallback } from "react";
import { api } from "../services/api";
import { AnalyticsSummary } from "../types/api";
import { useBlockHeight } from "./useBlockHeight";

export type SummaryMode = "all-time" | "range";

/** Estimate-accuracy summary — all-time (cached) or over a block range (Accuracy page). */
export function useSummary(target: number, chain?: string) {
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<SummaryMode>("all-time");
  const [startBlock, setStartBlock] = useState<number | null>(null);
  const [endBlock, setEndBlock] = useState<number | null>(null);
  const { latestBlock, syncHeight } = useBlockHeight(chain);

  const fetchSummary = useCallback(async (m: SummaryMode, start: number, confTarget: number) => {
    try {
      setLoading(true);
      const fSum = await api.getFeesSum(start, confTarget, chain, m === "all-time");
      setSummary(fSum);
    } catch {
      // non-fatal — keep the previous value
    } finally {
      setLoading(false);
    }
  }, [chain]);

  // Chain change: establish the default range, then fetch.
  useEffect(() => {
    if (!chain) return;
    let cancelled = false;
    (async () => {
      const h = await syncHeight();
      if (cancelled || !h) return;
      const s = h - 1000;
      setStartBlock(s);
      setEndBlock(h);
      fetchSummary(mode, s, target);
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chain, syncHeight, fetchSummary]);

  // Target or mode change: refetch (all-time ignores the range server-side).
  useEffect(() => {
    if (!chain || startBlock === null) return;
    fetchSummary(mode, startBlock, target);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, mode]);

  const handleApply = () => {
    if (startBlock !== null) fetchSummary(mode, startBlock, target);
  };

  return {
    summary,
    loading,
    mode,
    setMode,
    startBlock,
    setStartBlock,
    endBlock,
    setEndBlock,
    latestBlock,
    handleApply,
    syncHeight,
  };
}
