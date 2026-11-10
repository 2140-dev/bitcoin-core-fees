import { useState, useEffect, useCallback } from "react";
import { api } from "../services/api";
import { AnalyticsSummary } from "../types/api";
import { useBlockHeight } from "./useBlockHeight";

export type SummaryScope = "all-time" | "range";
export type FeeMode = "economical" | "conservative";
export type Estimator = "auto" | "block_policy";

/** Estimate-accuracy summary for a (scope, mode, estimator) combination. */
export function useSummary(target: number, chain?: string) {
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [scope, setScope] = useState<SummaryScope>("all-time");
  const [feeMode, setFeeMode] = useState<FeeMode>("economical");
  const [estimator, setEstimator] = useState<Estimator>("auto");
  const [startBlock, setStartBlock] = useState<number | null>(null);
  const [endBlock, setEndBlock] = useState<number | null>(null);
  const { latestBlock, syncHeight } = useBlockHeight(chain);

  const fetchSummary = useCallback(
    async (scp: SummaryScope, start: number, confTarget: number, fMode: FeeMode, est: Estimator) => {
      try {
        setLoading(true);
        const fSum = await api.getFeesSum(start, confTarget, chain, scp === "all-time", fMode, est);
        setSummary(fSum);
      } catch {
        // non-fatal — keep the previous value
      } finally {
        setLoading(false);
      }
    },
    [chain],
  );

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
      fetchSummary(scope, s, target, feeMode, estimator);
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chain, syncHeight, fetchSummary]);

  // Any selector change: refetch (all-time ignores the range server-side).
  useEffect(() => {
    if (!chain || startBlock === null) return;
    fetchSummary(scope, startBlock, target, feeMode, estimator);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, scope, feeMode, estimator]);

  const handleApply = () => {
    if (startBlock !== null) fetchSummary(scope, startBlock, target, feeMode, estimator);
  };

  return {
    summary,
    loading,
    scope,
    setScope,
    feeMode,
    setFeeMode,
    estimator,
    setEstimator,
    startBlock,
    setStartBlock,
    endBlock,
    setEndBlock,
    latestBlock,
    handleApply,
    syncHeight,
  };
}
