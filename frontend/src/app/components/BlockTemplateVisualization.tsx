"use client";

import { useState, useEffect } from "react";
import { api, type BlockStats } from "@/lib/api";

interface BlockTemplateVisualizationProps {
  blockHeight: number;
}

export default function BlockTemplateVisualization({
  blockHeight,
}: BlockTemplateVisualizationProps) {
  const [blockStats, setBlockStats] = useState<BlockStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchBlockStats = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await api.getBlockStats(blockHeight);
        setBlockStats(data);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to fetch block stats"
        );
      } finally {
        setLoading(false);
      }
    };

    fetchBlockStats();
  }, [blockHeight]);

  const formatFeeRate = (feerate: number) => {
    return `${(feerate * 100000000).toFixed(2)} sat/vB`;
  };

  const formatBytes = (bytes: number) => {
    if (bytes >= 1000000) {
      return `${(bytes / 1000000).toFixed(1)} MB`;
    } else if (bytes >= 1000) {
      return `${(bytes / 1000).toFixed(1)} KB`;
    }
    return `${bytes} B`;
  };

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-lg border border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-600"></div>
          <span className="ml-3 text-gray-600 dark:text-gray-400">
            Loading block template...
          </span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-red-800 dark:text-red-200 mb-2">
          Error Loading Block Template
        </h3>
        <p className="text-red-600 dark:text-red-400">{error}</p>
      </div>
    );
  }

  if (!blockStats) return null;

  const percentiles = blockStats.feerate_percentiles;
  const [p10, p25, p50, p75, p90] = percentiles;

  return (
    <div className="space-y-6">
      {/* Block Header */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-lg border border-gray-200 dark:border-gray-700">
        <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
          Block Template Analysis
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-orange-600 dark:text-orange-400 transition-all duration-500 ease-out">
              #{blockStats.height}
            </div>
            <div
              className="text-sm text-gray-600 dark:text-gray-400"
              title="The current block number in the Bitcoin blockchain"
            >
              Block Height
            </div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400 transition-all duration-500 ease-out">
              {blockStats.txs}
            </div>
            <div
              className="text-sm text-gray-600 dark:text-gray-400"
              title="Number of transactions included in this block"
            >
              Transactions
            </div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600 dark:text-green-400 transition-all duration-500 ease-out">
              {formatBytes(blockStats.total_size)}
            </div>
            <div
              className="text-sm text-gray-600 dark:text-gray-400"
              title="Total size of all transactions in this block"
            >
              Total Size
            </div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-purple-600 dark:text-purple-400 transition-all duration-500 ease-out">
              {formatBytes(blockStats.total_weight)}
            </div>
            <div
              className="text-sm text-gray-600 dark:text-gray-400"
              title="Total weight units (WU) of all transactions in this block"
            >
              Total Weight
            </div>
          </div>
        </div>
      </div>

      {/* Fee Rate Distribution */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-lg border border-gray-200 dark:border-gray-700">
        <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
          Fee Rate Distribution (Percentiles)
        </h3>

        {/* Visual Distribution Bar */}
        <div className="mb-6">
          <div className="relative h-8 bg-gray-200 dark:bg-gray-700 rounded-lg overflow-hidden">
            {/* Percentile markers */}
            <div className="absolute inset-0 flex">
              <div className="flex-1 bg-gradient-to-r from-orange-300 to-orange-400"></div>
              <div className="flex-1 bg-gradient-to-r from-orange-400 to-amber-400"></div>
              <div className="flex-1 bg-gradient-to-r from-amber-400 to-yellow-500"></div>
              <div className="flex-1 bg-gradient-to-r from-yellow-500 to-yellow-600"></div>
              <div className="flex-1 bg-gradient-to-r from-yellow-600 to-orange-600"></div>
            </div>

            {/* Percentile lines */}
            <div className="absolute inset-0 flex">
              <div className="w-1/5 border-r border-white dark:border-gray-600"></div>
              <div className="w-1/5 border-r border-white dark:border-gray-600"></div>
              <div className="w-1/5 border-r border-white dark:border-gray-600"></div>
              <div className="w-1/5 border-r border-white dark:border-gray-600"></div>
            </div>

            {/* Labels */}
            <div className="absolute inset-0 flex text-xs font-semibold text-white">
              <div className="w-1/5 flex items-center justify-center">10th</div>
              <div className="w-1/5 flex items-center justify-center">25th</div>
              <div className="w-1/5 flex items-center justify-center">50th</div>
              <div className="w-1/5 flex items-center justify-center">75th</div>
              <div className="w-1/5 flex items-center justify-center">90th</div>
            </div>
          </div>
        </div>

        {/* Percentile Details */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="text-center p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg border border-orange-200 dark:border-orange-800">
            <div className="text-lg font-bold text-orange-600 dark:text-orange-400 transition-all duration-500 ease-out">
              {formatFeeRate(p10)}
            </div>
            <div
              className="text-sm text-orange-600 dark:text-orange-400"
              title="10% of transactions paid this fee rate or lower"
            >
              10th Percentile
            </div>
          </div>
          <div className="text-center p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
            <div className="text-lg font-bold text-amber-600 dark:text-amber-400 transition-all duration-500 ease-out">
              {formatFeeRate(p25)}
            </div>
            <div
              className="text-sm text-amber-600 dark:text-amber-400"
              title="25% of transactions paid this fee rate or lower"
            >
              25th Percentile
            </div>
          </div>
          <div className="text-center p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
            <div className="text-lg font-bold text-yellow-600 dark:text-yellow-400 transition-all duration-500 ease-out">
              {formatFeeRate(p50)}
            </div>
            <div
              className="text-sm text-yellow-600 dark:text-yellow-400"
              title="50% of transactions paid this fee rate or lower (median)"
            >
              50th Percentile
            </div>
            <div
              className="text-xs text-yellow-500 dark:text-yellow-300 font-semibold"
              title="Recommended fee rate for next block inclusion"
            >
              🎯 Target
            </div>
          </div>
          <div className="text-center p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg border border-orange-200 dark:border-orange-800">
            <div className="text-lg font-bold text-orange-600 dark:text-orange-400 transition-all duration-500 ease-out">
              {formatFeeRate(p75)}
            </div>
            <div
              className="text-sm text-orange-600 dark:text-orange-400"
              title="75% of transactions paid this fee rate or lower"
            >
              75th Percentile
            </div>
          </div>
          <div className="text-center p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
            <div className="text-lg font-bold text-amber-600 dark:text-amber-400 transition-all duration-500 ease-out">
              {formatFeeRate(p90)}
            </div>
            <div
              className="text-sm text-amber-600 dark:text-amber-400"
              title="90% of transactions paid this fee rate or lower"
            >
              90th Percentile
            </div>
          </div>
        </div>
      </div>

      {/* Block Statistics */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-lg border border-gray-200 dark:border-gray-700">
        <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
          Block Statistics
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
          <div>
            <h4 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-3">
              Fee Information
            </h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">
                  Min Fee Rate:
                </span>
                <span className="font-semibold">
                  {formatFeeRate(blockStats.minfeerate)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">
                  Avg Fee Rate:
                </span>
                <span className="font-semibold">
                  {formatFeeRate(blockStats.avgfeerate)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">
                  Max Fee Rate:
                </span>
                <span className="font-semibold">
                  {formatFeeRate(blockStats.maxfeerate)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">
                  Total Fees:
                </span>
                <span className="font-semibold">
                  {(blockStats.totalfee / 100000000).toFixed(8)} BTC
                </span>
              </div>
            </div>
          </div>

          <div>
            <h4 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-3">
              Transaction Info
            </h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">
                  Inputs:
                </span>
                <span className="font-semibold">
                  {blockStats.ins.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">
                  Outputs:
                </span>
                <span className="font-semibold">
                  {blockStats.outs.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">
                  SegWit TXs:
                </span>
                <span className="font-semibold">{blockStats.swtxs}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">
                  Avg TX Size:
                </span>
                <span className="font-semibold">
                  {formatBytes(blockStats.avgtxsize)}
                </span>
              </div>
            </div>
          </div>

          <div>
            <h4 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-3">
              Block Info
            </h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">
                  Block Time:
                </span>
                <span className="font-semibold">
                  {new Date(blockStats.time * 1000).toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">
                  Subsidy:
                </span>
                <span className="font-semibold">
                  {(blockStats.subsidy / 100000000).toFixed(8)} BTC
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">
                  Total Out:
                </span>
                <span className="font-semibold">
                  {(blockStats.total_out / 100000000).toFixed(8)} BTC
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">
                  Block Hash:
                </span>
                <span className="font-mono text-xs">
                  {blockStats.blockhash.slice(0, 16)}...
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Mempool-Based Estimation Explanation */}
      <div className="bg-gradient-to-r from-orange-50 to-green-50 dark:from-orange-900/20 dark:to-green-900/20 rounded-xl p-6 border border-orange-200 dark:border-orange-800">
        <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
          How Mempool-Based Estimation Works
        </h3>
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <h4 className="text-lg font-semibold text-orange-700 dark:text-orange-300 mb-2">
              🎯 Target Fee Rate: {formatFeeRate(p50)}
            </h4>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
              The 50th percentile fee rate from this block template represents
              the fee rate needed to be included in the next block. This is the
              core of mempool-based estimation.
            </p>
            <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-orange-200 dark:border-orange-700">
              <div className="text-sm text-orange-600 dark:text-orange-400">
                <strong>Why 50th percentile?</strong>
                <br />
                • 50% of transactions paid this rate or higher
                <br />
                • Provides good balance between cost and confirmation
                <br />• More accurate than historical averages
              </div>
            </div>
          </div>
          <div>
            <h4 className="text-lg font-semibold text-green-700 dark:text-green-300 mb-2">
              📊 Current vs. Mempool-Based
            </h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">
                  Current System:
                </span>
                <span className="text-red-600 font-semibold">
                  29.46% overpayment
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">
                  Mempool-Based:
                </span>
                <span className="text-green-600 font-semibold">
                  0.03% overpayment
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">
                  Accuracy:
                </span>
                <span className="text-green-600 font-semibold">
                  80.96% within range
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
