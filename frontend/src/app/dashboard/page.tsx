"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  api,
  type MempoolHealthResponse,
  type MempoolInfo,
  type UnifiedEstimate,
} from "@/lib/api";
import BlockStatsChartD3 from "@/app/components/BlockStatsChartD3";
import MempoolHealthSummary from "@/app/components/MempoolHealthSummary";

type ChartBlock = {
  height: number;
  p25: number | null;
  p75: number | null;
};

export default function DashboardPage() {
  const [estimate, setEstimate] = useState<UnifiedEstimate | null>(null);
  const [mempoolHealth, setMempoolHealth] =
    useState<MempoolHealthResponse | null>(null);
  const [mempoolInfo, setMempoolInfo] = useState<MempoolInfo | null>(null);
  const [target, setTarget] = useState(2);
  const [healthInterval, setHealthInterval] = useState(50);
  const [healthStart, setHealthStart] = useState<number | null>(null);
  const [blockHeight, setBlockHeight] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [startNotice, setStartNotice] = useState<string | null>(null);

  const fetchEstimate = async (confTarget: number) => {
    try {
      const result = await api.getUnifiedEstimate("mempool", confTarget, 50);
      setEstimate(result);
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load fee estimate"
      );
      setEstimate(null);
    }
  };

  const refreshAll = async (startOverride?: number) => {
    setLoading(true);
    setError(null);
    try {
      const info = await api.getBlockchainInfo();
      const latest = info.blocks;
      const requestedStart =
        startOverride ?? healthStart ?? Math.max(1, latest - healthInterval);
      const maxStart = Math.max(1, latest - healthInterval);
      const clampedStart = Math.min(requestedStart, maxStart);
      setStartNotice(
        requestedStart !== clampedStart
          ? `Start height adjusted to ${clampedStart.toLocaleString()} because window exceeds tip ${latest.toLocaleString()}.`
          : null
      );
      setBlockHeight(latest);
      setHealthStart(clampedStart);
      const [est, health, mem] = await Promise.all([
        api.getUnifiedEstimate("mempool", target, 50),
        api.getMempoolHealth(clampedStart, healthInterval, "local"),
        api.getMempoolInfo(),
      ]);
      setEstimate(est);
      setMempoolHealth(health);
      setMempoolInfo(mem);
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load dashboard data"
      );
      setEstimate(null);
      setMempoolHealth(null);
      setMempoolInfo(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshAll();
  }, []);

  useEffect(() => {
    fetchEstimate(target);
  }, [target]);

  const chartBlocks = useMemo<ChartBlock[]>(() => {
    if (!mempoolHealth) return [];
    return mempoolHealth.blocks
      .map((b) => ({
        height: b.height,
        p25: b.p25 ?? null,
        p75: b.p75 ?? null,
      }))
      .sort((a, b) => a.height - b.height);
  }, [mempoolHealth]);

  const estimatePoints = useMemo(() => {
    const value = estimate?.fee_rate_sat_per_vb;
    if (value == null) return [];
    const baseHeight =
      mempoolHealth?.end_height ??
      (blockHeight ? Math.max(1, blockHeight - 1) : undefined);
    if (!baseHeight) return [];
    return Array.from({ length: target }, (_, idx) => ({
      height: baseHeight + idx + 1,
      value,
    }));
  }, [estimate, mempoolHealth, blockHeight, target]);

  const startHeight =
    mempoolHealth?.start_height ??
    healthStart ??
    (blockHeight ? Math.max(1, blockHeight - healthInterval) : 0);

  const endHeight = useMemo(
    () =>
      Math.max(
        mempoolHealth?.end_height ?? startHeight,
        ...estimatePoints.map((p) => p.height)
      ),
    [mempoolHealth, startHeight, estimatePoints]
  );

  const feeDisplay =
    estimate?.fee_rate_sat_per_vb != null
      ? estimate.fee_rate_sat_per_vb.toFixed(1)
      : "—";

  return (
    <div
      className="min-h-screen text-gray-100 relative overflow-hidden"
      style={{
        background:
          "radial-gradient(circle at 20% 20%, rgba(255,184,76,0.06), transparent 28%), radial-gradient(circle at 80% 15%, rgba(56,189,248,0.05), transparent 24%), linear-gradient(180deg, #0b1222 0%, #070c1a 55%, #050910 100%)",
      }}
    >
      <nav className="bg-black/80 backdrop-blur-md border-b border-gray-800 shadow-xl">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-[#cc7400] rounded-lg flex items-center justify-center shadow-lg">
                <span className="text-black font-bold text-sm">₿</span>
              </div>
              <Link href="/" className="text-xl font-bold text-[#cc7400]">
                Bitcoin Core Fees
              </Link>
            </div>
            <div className="flex space-x-6 text-sm font-medium">
              <Link
                href="/"
                className="text-gray-300 hover:text-[#cc7400] transition-all duration-200"
              >
                Home
              </Link>
              <span className="text-gray-500">Dashboard</span>
            </div>
          </div>
        </div>
      </nav>

      <main className="relative max-w-6xl mx-auto px-4 py-10 space-y-10">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center px-3 py-1 bg-[#cc7400]/10 border border-[#cc7400]/40 rounded-full text-[#cc7400] text-xs font-semibold">
            Live mempool analytics
          </div>
          <h1 className="text-4xl font-bold text-white">
            Bitcoin Fee Dashboard
          </h1>
          <p className="text-gray-300">
            Log-scale view of the 25th-75th percentile mempool feerates per
            block height with the current target-based estimate overlaid.
          </p>
        </div>

        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-[#0f172a] border border-[#1f2937] rounded-2xl p-5 shadow-xl shadow-black/30">
            <div className="text-xs uppercase tracking-wide text-gray-400">
              Target {target} estimate
            </div>
            <div className="text-4xl font-bold text-[#cc7400] mt-2">
              {feeDisplay}
            </div>
            <div className="text-sm text-gray-400">sat/vB</div>
            {estimate?.warnings && estimate.warnings.length > 0 && (
              <div className="mt-3 text-xs text-yellow-200 space-y-1">
                {estimate.warnings.slice(0, 2).map((w, idx) => (
                  <div key={idx}>{w}</div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-[#0f172a] border border-[#1f2937] rounded-2xl p-5 shadow-xl shadow-black/30">
            <div className="text-xs uppercase tracking-wide text-gray-400">
              Latest block
            </div>
            <div className="text-3xl font-bold text-white mt-2">
              {blockHeight ? blockHeight.toLocaleString() : "—"}
            </div>
            <div className="text-sm text-gray-400">Chain tip</div>
          </div>

          <div className="bg-[#0f172a] border border-[#1f2937] rounded-2xl p-5 shadow-xl shadow-black/30">
            <div className="text-xs uppercase tracking-wide text-gray-400">
              Mempool depth
            </div>
            <div className="text-3xl font-bold text-white mt-2">
              {mempoolInfo?.size != null
                ? mempoolInfo.size.toLocaleString()
                : "—"}
            </div>
            <div className="text-sm text-gray-400">transactions in mempool</div>
            {mempoolInfo?.total_fee != null && (
              <div className="text-xs text-gray-400 mt-2">
                Total fees: {mempoolInfo.total_fee.toFixed(4)} BTC
              </div>
            )}
          </div>
        </section>

        <section className="bg-[#0b1324] backdrop-blur-sm rounded-2xl p-6 shadow-2xl border border-[#1f2a3a] shadow-black/30">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Confirmation target
              </label>
              <select
                value={target}
                onChange={(e) => setTarget(Number(e.target.value))}
                className="w-full px-4 py-2 border border-[#1f2a3a] rounded-lg bg-[#10182b] text-white focus:ring-2 focus:ring-[#cc7400] focus:border-transparent"
              >
                <option value={1}>1 block</option>
                <option value={2}>2 blocks</option>
                <option value={3}>3 blocks</option>
                <option value={6}>6 blocks</option>
                <option value={12}>12 blocks</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Start height
              </label>
              <input
                type="number"
                min={1}
                value={healthStart ?? ""}
                onChange={(e) =>
                  setHealthStart(Math.max(1, Number(e.target.value)))
                }
                className="w-full px-4 py-2 border border-[#1f2a3a] rounded-lg bg-[#10182b] text-white focus:ring-2 focus:ring-[#cc7400] focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Interval (blocks)
              </label>
              <input
                type="number"
                min={1}
                max={2000}
                value={healthInterval}
                onChange={(e) =>
                  setHealthInterval(Math.max(1, Number(e.target.value)))
                }
                className="w-full px-4 py-2 border border-[#1f2a3a] rounded-lg bg-[#10182b] text-white focus:ring-2 focus:ring-[#cc7400] focus:border-transparent"
              />
            </div>

            <div className="flex items-end">
              <button
                onClick={() => refreshAll(healthStart ?? undefined)}
                disabled={loading}
                className="w-full bg-[#cc7400] hover:brightness-110 disabled:bg-gray-600 text-black px-6 py-2 rounded-lg font-semibold transition-colors"
              >
                {loading ? "Loading..." : "Refresh data"}
              </button>
            </div>
          </div>

          <div className="mt-4 text-sm text-gray-400 flex flex-wrap gap-4">
            <span>
              Latest block:{" "}
              {blockHeight ? blockHeight.toLocaleString() : "loading…"}
            </span>
            <span>
              Window: {healthInterval} blocks starting at{" "}
              {startHeight ? startHeight.toLocaleString() : "—"}
            </span>
            <span>
              Estimate spans heights{" "}
              {mempoolHealth
                ? `${(mempoolHealth.end_height + 1).toLocaleString()} – ${(
                    mempoolHealth.end_height + target
                  ).toLocaleString()}`
                : "—"}
            </span>
            {lastUpdated && <span>Last update: {lastUpdated}</span>}
            {startNotice && (
              <span className="text-yellow-300">{startNotice}</span>
            )}
          </div>
        </section>

        {error && (
          <div className="bg-red-900/20 border border-red-700 rounded-xl p-4 text-red-200">
            {error}
          </div>
        )}
        <section>
          {loading ? (
            <div className="flex justify-center items-center h-64">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#cc7400]" />
            </div>
          ) : mempoolHealth && chartBlocks.length > 0 ? (
            <>
              <BlockStatsChartD3
                blocks={chartBlocks}
                startHeight={startHeight}
                endHeight={endHeight}
                estimatePoints={estimatePoints}
                estimateLabel={`Target ${target} estimate`}
              />
              <p className="text-sm text-gray-400 mt-4">
                Shaded band shows the 25th-75th percentile feerates per block
                height, plotted on a logarithmic scale. The dashed line is the
                current mempool-based estimate repeated for the next {target}{" "}
                block heights (e.g., a target of 2 at height h appears at h+1
                and h+2).
              </p>
            </>
          ) : (
            <div className="text-center text-gray-400">
              No mempool percentile data available for this window.
            </div>
          )}
        </section>
        <section>
          <MempoolHealthSummary 
            summary={mempoolHealth?.summary ?? null}
            loading={loading}
          />
        </section>
        <div className="mt-4 flex items-center justify-center space-x-3 text-gray-300">
          <div className="w-3 h-3 bg-green-400 rounded-full animate-pulse"></div>
          <span className="font-medium">
            Live data • Last updated: {lastUpdated ?? "—"}
          </span>
        </div>
      </main>
    </div>
  );
}
