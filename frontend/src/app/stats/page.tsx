"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  api,
  type FeeEstimate,
  type AnalyticsSummary,
  type MempoolHealthResponse,
} from "@/lib/api";
import BlockTemplateVisualization from "@/app/components/BlockTemplateVisualization";
import BlockStatsChartD3 from "@/app/components/BlockStatsChartD3";
import FeeRateTimeline from "@/app/components/FeeRateTimeline";
import FeeDistributionChart from "@/app/components/FeeDistributionChart";

export default function StatsPage() {
  const [feeEstimate, setFeeEstimate] = useState<FeeEstimate | null>(null);
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [mempoolHealth, setMempoolHealth] =
    useState<MempoolHealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [target, setTarget] = useState(1);
  const [blockHeight, setBlockHeight] = useState(800000);
  const [healthStart, setHealthStart] = useState<number | null>(null);
  const [healthInterval, setHealthInterval] = useState<number>(50);
  const [healthSource, setHealthSource] = useState<"local" | "external">(
    "local"
  );
  const [healthError, setHealthError] = useState<string | null>(null);
  const [healthLoading, setHealthLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState(10); // seconds

  const fetchFeeEstimate = async (confTarget: number) => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.getFeeEstimate(confTarget, "economical", 2);
      setFeeEstimate(data);
      // Also refresh analytics summary if not auto-refreshing
      if (!autoRefresh) {
        const s = await api.getAnalyticsSummary(1000);
        setSummary(s);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch data");
      setFeeEstimate(null);
    } finally {
      setLoading(false);
    }
  };

  const fetchAnalyticsSummary = async () => {
    try {
      const s = await api.getAnalyticsSummary(1000);
      setSummary(s);
    } catch (err) {
      console.error("Failed to fetch analytics summary:", err);
    }
  };

  useEffect(() => {
    fetchFeeEstimate(target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  // Auto-refresh performance metrics
  useEffect(() => {
    if (!autoRefresh) return;

    // Initial fetch
    fetchAnalyticsSummary();

    // Set up polling interval
    const interval = setInterval(() => {
      fetchAnalyticsSummary();
    }, refreshInterval * 1000);

    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval]);

  useEffect(() => {
    const loadHealth = async () => {
      try {
        setHealthLoading(true);
        setHealthError(null);
        const info = await api.getBlockchainInfo();
        setBlockHeight(info.blocks);
        const start = Math.max(1, info.blocks - 50);
        setHealthStart(start);
        const mh = await api.getMempoolHealth(
          start,
          healthInterval,
          healthSource
        );
        setMempoolHealth(mh);
      } catch (err) {
        setHealthError(
          err instanceof Error ? err.message : "Failed to load mempool health"
        );
        setMempoolHealth(null);
      } finally {
        setHealthLoading(false);
      }
    };
    loadHealth();
  }, [healthInterval, healthSource]);

  const refreshMempoolHealth = async (overrideStart?: number) => {
    const start = overrideStart ?? healthStart;
    if (!start) return;
    try {
      setHealthLoading(true);
      setHealthError(null);
      const mh = await api.getMempoolHealth(
        start,
        healthInterval,
        healthSource
      );
      setMempoolHealth(mh);
    } catch (err) {
      setHealthError(
        err instanceof Error ? err.message : "Failed to load mempool health"
      );
      setMempoolHealth(null);
    } finally {
      setHealthLoading(false);
    }
  };

  useEffect(() => {
    // keep healthStart in sync with blockHeight/interval for refresh
    const start = Math.max(1, blockHeight - healthInterval);
    setHealthStart(start);
  }, [blockHeight, healthInterval]);

  const formatFeeRate = (feerate: number) => {
    return `${(feerate * 100000000).toFixed(2)} sat/vB`;
  };

  const getStatusColor = (hasErrors: boolean) => {
    return hasErrors
      ? "text-red-600 dark:text-red-400"
      : "text-green-600 dark:text-green-400";
  };

  const getStatusText = (hasErrors: boolean) => {
    return hasErrors ? "Issues Detected" : "Working Properly";
  };

  return (
    <div className="min-h-screen bg-[#0b0c10] text-gray-100 relative overflow-hidden">
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-yellow-500/10 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-yellow-500/5 rounded-full blur-3xl animate-pulse delay-1000"></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-yellow-500/3 rounded-full blur-3xl animate-pulse delay-500"></div>
      </div>

      {/* Navigation */}
      <nav className=" bg-black/80 backdrop-blur-md border-b border-gray-800 shadow-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-gradient-to-br from-yellow-400 to-yellow-600 rounded-lg flex items-center justify-center shadow-lg">
                <span className="text-black font-bold text-sm">₿</span>
              </div>
              <Link
                href="/"
                className="text-xl font-bold bg-gradient-to-r from-yellow-400 to-yellow-600 bg-clip-text text-transparent"
              >
                Bitcoin Core Fee Estimation
              </Link>
            </div>
            <div className="flex space-x-6">
              <Link
                href="/"
                className="text-gray-300 hover:text-yellow-400 transition-all duration-300 hover:scale-105 font-medium relative group"
              >
                Home
                <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-yellow-400 transition-all duration-300 group-hover:w-full"></span>
              </Link>
              <Link
                href="/dashboard"
                className="text-gray-300 hover:text-yellow-400 transition-all duration-300 hover:scale-105 font-medium relative group"
              >
                Dashboard
                <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-yellow-400 transition-all duration-300 group-hover:w-full"></span>
              </Link>
            </div>
          </div>
        </div>
      </nav>

      <main className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center px-4 py-2 bg-[#cc7400]/10 border border-[#cc7400]/30 rounded-full text-[#cc7400] text-sm font-medium mb-6">
            <div className="w-2 h-2 bg-[#cc7400] rounded-full mr-2 animate-ping"></div>
            Live Analytics Dashboard
          </div>
          <h1 className="text-4xl md:text-6xl font-bold mb-4">
            <span className="text-[#cc7400]">Live Fee Estimation</span>
          </h1>
          <p className="text-xl text-gray-300 max-w-2xl mx-auto">
            Real-time Bitcoin fee estimation using{" "}
            <span className="text-[#cc7400] font-semibold">
              current mempool data
            </span>
          </p>
        </div>

        {/* Controls */}
        <div className="bg-[#0f1115] backdrop-blur-sm rounded-2xl p-8 shadow-2xl border border-gray-800 mb-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Confirmation Target (blocks)
              </label>
              <select
                value={target}
                onChange={(e) => setTarget(Number(e.target.value))}
                className="w-full px-4 py-2 border border-gray-700 rounded-lg bg-[#0b0c10] text-white focus:ring-2 focus:ring-[#cc7400] focus:border-transparent"
              >
                <option value={1}>1 block (~10 minutes)</option>
                <option value={2}>2 blocks (~20 minutes)</option>
                <option value={3}>3 blocks (~30 minutes)</option>
                <option value={6}>6 blocks (~1 hour)</option>
                <option value={12}>12 blocks (~2 hours)</option>
                <option value={24}>24 blocks (~4 hours)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Block Height for Analysis
              </label>
              <input
                type="number"
                value={blockHeight}
                onChange={(e) => setBlockHeight(Number(e.target.value))}
                className="w-full px-4 py-2 border border-gray-700 rounded-lg bg-[#0b0c10] text-white focus:ring-2 focus:ring-[#cc7400] focus:border-transparent"
                placeholder="800000"
                min="1"
              />
            </div>
            <div className="flex items-end">
              <button
                onClick={async () => {
                  const start = Math.max(1, blockHeight - healthInterval);
                  setHealthStart(start);
                  await Promise.all([
                    fetchFeeEstimate(target),
                    refreshMempoolHealth(start),
                  ]);
                }}
                disabled={loading || healthLoading}
                className="w-full bg-[#cc7400] hover:brightness-110 disabled:bg-gray-600 text-black px-6 py-2 rounded-lg font-semibold transition-colors"
              >
                {loading || healthLoading ? "Loading..." : "Refresh Data"}
              </button>
            </div>
          </div>
        </div>

        {/* Error State */}
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-6 mb-8">
            <h3 className="text-xl font-semibold text-red-800 dark:text-red-200 mb-2">
              Error Loading Data
            </h3>
            <p className="text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}

        {/* Mempool Health (local node) */}
        <div className="mb-8">
          <div className="bg-[#0f1115] backdrop-blur-sm rounded-2xl p-6 shadow-2xl border border-gray-800">
            <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
              <div>
                <h3 className="text-2xl font-bold text-white">
                  Mempool Health (local node)
                </h3>
                <p className="text-sm text-gray-400">
                  Window: {healthInterval} blocks starting at{" "}
                  {healthStart ?? "…"} • Source:{" "}
                  {mempoolHealth?.source || "local"}
                </p>
              </div>
              <div className="text-sm text-gray-300">
                Height: {blockHeight.toLocaleString()}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1">
                  Start height
                </label>
                <input
                  type="number"
                  value={healthStart ?? ""}
                  onChange={(e) => setHealthStart(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-800 rounded-lg bg-[#0b0c10] text-white focus:ring-2 focus:ring-[#cc7400] focus:border-transparent"
                  placeholder="283400"
                  min={1}
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">
                  Interval (blocks)
                </label>
                <input
                  type="number"
                  value={healthInterval}
                  onChange={(e) => setHealthInterval(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-800 rounded-lg bg-[#0b0c10] text-white focus:ring-2 focus:ring-[#cc7400] focus:border-transparent"
                  min={1}
                  max={2000}
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">
                  Source
                </label>
                <select
                  value={healthSource}
                  onChange={(e) =>
                    setHealthSource(e.target.value as "local" | "external")
                  }
                  className="w-full px-3 py-2 border border-gray-800 rounded-lg bg-[#0b0c10] text-white focus:ring-2 focus:ring-[#cc7400] focus:border-transparent"
                >
                  <option value="local">Local (signet RPC)</option>
                  <option value="external">External (mainnet dataset)</option>
                </select>
              </div>
              <div className="flex items-end">
                <button
                  onClick={() => refreshMempoolHealth()}
                  className="w-full bg-[#cc7400] hover:brightness-110 text-black px-4 py-2 rounded-lg font-semibold transition-colors"
                  disabled={healthLoading || !healthStart}
                >
                  {healthLoading ? "Loading..." : "Refresh"}
                </button>
              </div>
            </div>

            {healthLoading && (
              <div className="flex items-center text-gray-300">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-yellow-500 mr-3"></div>
                Loading mempool health...
              </div>
            )}

            {healthError && (
              <div className="text-red-400 text-sm">
                Failed to load mempool health: {healthError}
              </div>
            )}

            {!healthLoading && mempoolHealth && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-[#0b0c10] border border-gray-800 rounded-xl p-4">
                  <div className="text-sm text-gray-400 mb-1">Underpaid</div>
                  <div className="text-2xl font-bold text-[#cc7400]">
                    {mempoolHealth.summary.underpaid.count}
                  </div>
                  <div className="text-xs text-gray-400">
                    {mempoolHealth.summary.underpaid.percent}% of window
                  </div>
                </div>
                <div className="bg-[#0b0c10] border border-gray-800 rounded-xl p-4">
                  <div className="text-sm text-gray-400 mb-1">Within Range</div>
                  <div className="text-2xl font-bold text-green-400">
                    {mempoolHealth.summary.within.count}
                  </div>
                  <div className="text-xs text-gray-400">
                    {mempoolHealth.summary.within.percent}% of window
                  </div>
                </div>
                <div className="bg-[#0b0c10] border border-gray-800 rounded-xl p-4">
                  <div className="text-sm text-gray-400 mb-1">Overpaid</div>
                  <div className="text-2xl font-bold text-red-400">
                    {mempoolHealth.summary.overpaid.count}
                  </div>
                  <div className="text-xs text-gray-400">
                    {mempoolHealth.summary.overpaid.percent}% of window
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Loading State */}
        {loading && !feeEstimate && (
          <div className="bg-white dark:bg-gray-800 rounded-xl p-8 shadow-lg border border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-600"></div>
              <span className="ml-3 text-gray-600 dark:text-gray-400">
                Loading fee estimation...
              </span>
            </div>
          </div>
        )}

        {/* Fee Estimation Results */}
        {feeEstimate && (
          <div className="grid md:grid-cols-2 gap-8 mb-8">
            {/* Current Fee Estimate */}
            <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-lg border border-gray-200 dark:border-gray-700">
              <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
                Current Fee Estimate
              </h2>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-gray-600 dark:text-gray-400">
                    Fee Rate:
                  </span>
                  <span className="text-2xl font-bold text-orange-600 dark:text-orange-400 transition-all duration-500 ease-out">
                    {formatFeeRate(feeEstimate.feerate)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600 dark:text-gray-400">
                    Forecaster:
                  </span>
                  <span className="font-semibold text-gray-900 dark:text-white">
                    {feeEstimate.forecaster}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600 dark:text-gray-400">
                    Blocks:
                  </span>
                  <span className="font-semibold text-gray-900 dark:text-white">
                    {feeEstimate.blocks}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600 dark:text-gray-400">
                    Status:
                  </span>
                  <span
                    className={`font-semibold ${getStatusColor(
                      !!(feeEstimate.errors && feeEstimate.errors.length > 0)
                    )}`}
                  >
                    {getStatusText(
                      !!(feeEstimate.errors && feeEstimate.errors.length > 0)
                    )}
                  </span>
                </div>
              </div>
            </div>

            {/* Issues/Errors */}
            <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-lg border border-gray-200 dark:border-gray-700">
              <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
                System Status
              </h2>
              {feeEstimate.errors && feeEstimate.errors.length > 0 ? (
                <div className="space-y-3">
                  <div className="flex items-center">
                    <div className="w-3 h-3 bg-red-500 rounded-full mr-3"></div>
                    <span className="text-red-600 dark:text-red-400 font-semibold">
                      Issues Detected
                    </span>
                  </div>
                  {feeEstimate.errors.map((error, index) => (
                    <div
                      key={index}
                      className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3"
                    >
                      <p className="text-red-600 dark:text-red-400 text-sm">
                        {error}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex items-center">
                  <div className="w-3 h-3 bg-green-500 rounded-full mr-3"></div>
                  <span className="text-green-600 dark:text-green-400 font-semibold">
                    System Working Properly
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Block Template Visualization */}
        <div className="mt-12">
          <h2 className="text-3xl font-bold text-center text-white mb-6">
            Block Template Analysis
          </h2>
          <BlockTemplateVisualization blockHeight={blockHeight} />
        </div>

        {/* D3.js Visualizations */}
        {mempoolHealth && mempoolHealth.blocks.length > 0 && (
          <div className="mt-12">
            <h2 className="text-3xl font-bold text-center text-white mb-6">
              Mempool Health Visualization (D3.js)
            </h2>
            <BlockStatsChartD3
              blocks={mempoolHealth.blocks.map((b) => ({
                height: b.height,
                p25: b.p25 ?? 0,
                p75: b.p75 ?? 0,
                avgFee: b.avgFee ?? 0,
                status: b.status,
              }))}
              startHeight={mempoolHealth.start_height}
              endHeight={mempoolHealth.end_height}
            />
          </div>
        )}

        {/* Additional D3.js Charts */}
        <div className="mt-12 space-y-8">
          <div className="text-center">
            <h2 className="text-3xl font-bold text-white mb-2">
              Real-time Fee Visualizations
            </h2>
            <p className="text-gray-400">Interactive charts powered by D3.js</p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <FeeRateTimeline />
            <FeeDistributionChart />
          </div>
        </div>

        {/* Performance Metrics (live from /analytics/summary) */}
        <div className="mt-12">
          <div className="flex flex-col md:flex-row justify-between items-center mb-6">
            <h2 className="text-3xl font-bold text-center text-white mb-4 md:mb-0">
              Performance Metrics
            </h2>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm text-gray-300">
                <input
                  type="checkbox"
                  checked={autoRefresh}
                  onChange={(e) => setAutoRefresh(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-600 bg-[#0b0c10] text-[#cc7400] focus:ring-[#cc7400]"
                />
                <span>Auto-refresh</span>
              </label>
              {autoRefresh && (
                <div className="flex items-center gap-2">
                  <label className="text-xs text-gray-400">Interval (s):</label>
                  <input
                    type="number"
                    value={refreshInterval}
                    onChange={(e) =>
                      setRefreshInterval(Math.max(5, Number(e.target.value)))
                    }
                    min="5"
                    max="60"
                    className="w-16 px-2 py-1 border border-gray-700 rounded bg-[#0b0c10] text-white text-sm focus:ring-2 focus:ring-[#cc7400] focus:border-transparent"
                  />
                </div>
              )}
              <button
                onClick={fetchAnalyticsSummary}
                disabled={!summary}
                className="px-4 py-2 bg-[#cc7400] hover:brightness-110 disabled:bg-gray-600 disabled:cursor-not-allowed text-black rounded-lg font-semibold text-sm transition-colors"
              >
                Refresh Now
              </button>
            </div>
          </div>
          <div className="text-center mb-8">
            <p className="text-gray-400">
              {summary
                ? `Window: ${summary.window ?? 1000} • Source: ${
                    summary.source ?? "internal"
                  }`
                : "Loading recent analytics..."}
            </p>
            {autoRefresh && summary && (
              <p className="text-sm text-green-400 mt-2 flex items-center justify-center gap-2">
                <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
                Auto-refreshing every {refreshInterval}s
              </p>
            )}
          </div>

          {summary ? (
            <div className="grid md:grid-cols-3 gap-8 mb-12">
              <div className="bg-[#0f1115] border border-gray-800 rounded-2xl p-8">
                <div className="text-5xl font-bold text-green-400 mb-3">
                  {summary.within_perc != null
                    ? `${summary.within_perc}%`
                    : "—"}
                </div>
                <div className="text-lg text-gray-300 mb-2">Accuracy Rate</div>
                <div className="text-sm text-green-400">
                  Within target range ({summary.within_val ?? 0} of{" "}
                  {summary.total ?? 0})
                </div>
              </div>

              <div className="bg-[#0f1115] border border-gray-800 rounded-2xl p-8">
                <div className="text-5xl font-bold text-blue-400 mb-3">
                  {summary.overpayment_perc != null
                    ? `${summary.overpayment_perc}%`
                    : "—"}
                </div>
                <div className="text-lg text-gray-300 mb-2">
                  Overpayment Rate
                </div>
                <div className="text-sm text-blue-400">
                  {`${summary.overpayment_val ?? 0} overpaid of ${
                    summary.total ?? 0
                  }`}
                </div>
              </div>

              <div className="bg-[#0f1115] border border-gray-800 rounded-2xl p-8">
                <div className="text-5xl font-bold text-yellow-400 mb-3">
                  {summary.avg_block_coverage != null
                    ? `${Math.round(summary.avg_block_coverage * 100)}%`
                    : "—"}
                </div>
                <div className="text-lg text-gray-300 mb-2">Block Coverage</div>
                <div className="text-sm text-yellow-400">
                  Avg fraction of mined txids present in our snapshot
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center text-gray-400 mb-12">
              Analytics not available yet.
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
