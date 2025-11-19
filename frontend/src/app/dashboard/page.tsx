"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { api } from "@/lib/api";

// Simple mempool data interface
interface MempoolData {
  feeRate: number; // s/vb
  mempoolSize: number;
  totalFees: number;
  blockHeight: number;
  lastUpdate: string;
  method: "mempool" | "historical" | "hybrid";
  warnings?: string[];
}

export default function DashboardPage() {
  const [data, setData] = useState<MempoolData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);

      try {
        // Use unified estimator (mempool, target=1, p50)
        const [unified, mempoolInfo, blockchainInfo] = await Promise.all([
          api.getUnifiedEstimate("mempool", 1, 50),
          api.getMempoolInfo(),
          api.getBlockchainInfo(),
        ]);

        setData({
          feeRate: unified.fee_rate_sat_per_vb ?? 0,
          mempoolSize: mempoolInfo.size,
          totalFees: mempoolInfo.total_fee,
          blockHeight: blockchainInfo.blocks,
          lastUpdate: new Date().toLocaleTimeString(),
          method: (unified.method as MempoolData["method"]) || "mempool",
          warnings: unified.warnings || [],
        });
      } catch (error) {
        console.error("Failed to fetch real data:", error);
        // Show error state instead of mock data
        setData(null);
      }

      setLoading(false);
    };

    fetchData();
    // Refresh every 30 seconds
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-800 relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-yellow-500/10 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-yellow-500/5 rounded-full blur-3xl animate-pulse delay-1000"></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-yellow-500/3 rounded-full blur-3xl animate-pulse delay-500"></div>
      </div>

      <header className="relative bg-black/80 backdrop-blur-md border-b border-gray-800 shadow-xl">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-gradient-to-br from-yellow-400 to-yellow-600 rounded-lg flex items-center justify-center shadow-lg">
                <span className="text-black font-bold text-sm">₿</span>
              </div>
              <Link
                href="/"
                className="text-xl font-bold bg-gradient-to-r from-yellow-400 to-yellow-600 bg-clip-text text-transparent"
              >
                Bitcoin Core Fees
              </Link>
            </div>
            <nav className="flex space-x-6">
              <Link
                href="/"
                className="text-gray-300 hover:text-yellow-400 transition-all duration-300 hover:scale-105 font-medium relative group"
              >
                Home
                <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-yellow-400 transition-all duration-300 group-hover:w-full"></span>
              </Link>
              <Link
                href="/stats"
                className="text-gray-300 hover:text-yellow-400 transition-all duration-300 hover:scale-105 font-medium relative group"
              >
                Analytics
                <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-yellow-400 transition-all duration-300 group-hover:w-full"></span>
              </Link>
            </nav>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative max-w-6xl mx-auto px-4 py-12">
        {loading ? (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-yellow-500"></div>
          </div>
        ) : (
          <div className="space-y-12">
            {/* Main Fee Forecast Block */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-8">
              <div className="space-y-4">
                <div className="text-center">
                  <h3 className="text-lg font-semibold text-gray-200 mb-1">
                    Live Fee Estimate
                  </h3>
                  <p className="text-xs text-gray-400 mb-3">
                    Recommended fee for next block inclusion (p50, target=1)
                  </p>
                </div>

                <div className="relative group">
                  <div className="absolute inset-0 bg-gradient-to-br from-yellow-400 to-yellow-600 rounded-xl transform translate-x-1 translate-y-1 opacity-20 group-hover:opacity-30 transition-opacity duration-300"></div>
                  <div className="relative bg-gradient-to-br from-yellow-500 to-yellow-600 rounded-xl p-6 text-black shadow-2xl group-hover:shadow-yellow-500/25 transition-all duration-300 group-hover:scale-105">
                    <div className="text-center space-y-4">
                      {/* Main fee rate */}
                      <div className="space-y-2">
                        <div className="text-4xl font-bold transition-all duration-500 ease-out animate-pulse">
                          {data?.feeRate.toFixed(1)}
                        </div>
                        <div className="text-lg font-semibold opacity-90">
                          sat/vB
                        </div>
                      </div>

                      {/* Additional context */}
                      <div className="bg-black/20 rounded-lg p-3 space-y-2">
                        <div className="text-sm font-medium">
                          Estimator:{" "}
                          {data?.method === "mempool"
                            ? "Mempool (p50)"
                            : data?.method}
                        </div>
                        {data?.warnings && data.warnings.length > 0 && (
                          <div className="text-xs text-yellow-200">
                            {data.warnings[0]}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="text-center">
                  <div className="text-xs text-gray-300 mb-1">
                    Minimum relay fee: 1 sat/vB
                  </div>
                  <div className="text-xs text-green-300 flex items-center justify-center space-x-1">
                    <span className="w-2 h-2 bg-green-400 rounded-full animate-ping"></span>
                    <span>Real-time mempool analysis</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Data Visualization */}
            <div className="bg-gradient-to-br from-gray-900/80 to-gray-800/80 backdrop-blur-sm rounded-2xl p-6 shadow-2xl border border-gray-700">
              <h3 className="text-2xl font-bold text-white mb-4 text-center">
                Understanding the Data
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="text-center">
                  <div className="w-4 h-4 bg-orange-500 rounded-full mx-auto mb-2"></div>
                  <h4 className="text-lg font-semibold text-white mb-1">
                    Current Block
                  </h4>
                  <p className="text-xs text-gray-300">
                    Shows the actual weight (KWU) of transactions currently in
                    the block being mined
                  </p>
                </div>
                <div className="text-center">
                  <div className="w-4 h-4 bg-amber-500 rounded-full mx-auto mb-2"></div>
                  <h4 className="text-lg font-semibold text-white mb-1">
                    Removed Transactions
                  </h4>
                  <p className="text-xs text-gray-300">
                    Weight of transactions that were removed from the mempool
                    when the previous block was mined
                  </p>
                </div>
                <div className="text-center">
                  <div className="w-4 h-4 bg-yellow-500 rounded-full mx-auto mb-2"></div>
                  <h4 className="text-lg font-semibold text-white mb-1">
                    Previous Block
                  </h4>
                  <p className="text-xs text-gray-300">
                    Historical data from the last completed block for comparison
                    and trend analysis
                  </p>
                </div>
              </div>
              <div className="mt-4 text-center">
                <p className="text-xs text-gray-400">
                  <strong className="text-gray-300">
                    KWU (Kilo Weight Units):
                  </strong>{" "}
                  A measure of transaction weight in Bitcoin. The progress bars
                  show how full each block is compared to the maximum capacity
                  (3.8 KWU).
                </p>
              </div>
            </div>

            {/* Additional Stats Row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="group relative bg-gradient-to-br from-gray-900/80 to-gray-800/80 backdrop-blur-sm rounded-2xl p-6 shadow-2xl border border-gray-700 hover:border-gray-600 transition-all duration-300 hover:scale-105">
                <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                <div className="relative z-10">
                  <div className="text-base text-gray-300 mb-2">
                    Mempool Size
                  </div>
                  <div className="text-3xl font-bold text-white mb-1 transition-all duration-500 ease-out">
                    {data?.mempoolSize.toLocaleString()}
                  </div>
                  <div className="text-xs text-gray-400">transactions</div>
                </div>
              </div>

              <div className="group relative bg-gradient-to-br from-gray-900/80 to-gray-800/80 backdrop-blur-sm rounded-2xl p-6 shadow-2xl border border-gray-700 hover:border-gray-600 transition-all duration-300 hover:scale-105">
                <div className="absolute inset-0 bg-gradient-to-br from-green-500/5 to-transparent rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                <div className="relative z-10">
                  <div className="text-base text-gray-300 mb-2">Total Fees</div>
                  <div className="text-3xl font-bold text-white mb-1 transition-all duration-500 ease-out">
                    {data?.totalFees.toFixed(4)} BTC
                  </div>
                  <div className="text-xs text-gray-400">in mempool</div>
                </div>
              </div>

              <div className="group relative bg-gradient-to-br from-gray-900/80 to-gray-800/80 backdrop-blur-sm rounded-2xl p-6 shadow-2xl border border-gray-700 hover:border-gray-600 transition-all duration-300 hover:scale-105">
                <div className="absolute inset-0 bg-gradient-to-br from-yellow-500/5 to-transparent rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                <div className="relative z-10">
                  <div className="text-base text-gray-300 mb-2">
                    Block Height
                  </div>
                  <div className="text-3xl font-bold text-white mb-1 transition-all duration-500 ease-out">
                    {data?.blockHeight.toLocaleString()}
                  </div>
                  <div className="text-xs text-gray-400">latest block</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Info Section */}
        <div className="mt-16 bg-gradient-to-br from-gray-900/80 to-gray-800/80 backdrop-blur-sm rounded-2xl p-8 shadow-2xl border border-gray-700">
          <h3 className="text-3xl font-bold text-white mb-6 text-center">
            How Mempool-Based Fee Estimation Works
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="group relative bg-gray-800/50 rounded-xl p-6 border border-red-500/20 hover:border-red-400/40 transition-all duration-300">
              <div className="flex items-center mb-4">
                <div className="w-3 h-3 bg-red-500 rounded-full mr-3"></div>
                <h4 className="text-xl font-semibold text-white">
                  Current Method (Bitcoin Core)
                </h4>
              </div>
              <p className="text-gray-300 leading-relaxed">
                Uses{" "}
                <span className="text-red-400 font-semibold">
                  historical data
                </span>{" "}
                from past blocks to estimate fees. Can be slow to adapt to
                changing conditions. Uses &quot;economical&quot; and
                &quot;conservative&quot; modes.
              </p>
            </div>
            <div className="group relative bg-gray-800/50 rounded-xl p-6 border border-yellow-500/20 hover:border-yellow-400/40 transition-all duration-300">
              <div className="flex items-center mb-4">
                <div className="w-3 h-3 bg-yellow-500 rounded-full mr-3 animate-pulse"></div>
                <h4 className="text-xl font-semibold text-yellow-400">
                  Mempool-Based Method
                </h4>
              </div>
              <p className="text-gray-300 leading-relaxed">
                Analyzes{" "}
                <span className="text-yellow-400 font-semibold">
                  current mempool state
                </span>{" "}
                in real-time to provide more accurate fee estimates for
                immediate use. Supports both &quot;economical&quot; and
                &quot;conservative&quot; modes.
              </p>
            </div>
          </div>
        </div>

        {/* Live indicator */}
        <div className="mt-8 flex items-center justify-center space-x-3 text-gray-300">
          <div className="w-3 h-3 bg-green-400 rounded-full animate-pulse"></div>
          <span className="font-medium">
            Live data • Last updated: {data?.lastUpdate}
          </span>
        </div>
      </main>
    </div>
  );
}
