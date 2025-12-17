"use client";

import { useState, useEffect } from "react";
import BlockStatsChart from "@/app/components/BlockStatsChart"
import { SummaryBreakdown } from "@/app/components/SummaryBreakdown";
import { BlockHeightSelector } from "@/app/components/BlockHeightSelector";

interface BlockData {
  height: number;
  p25: number;
  p75: number;
  avgFee: number;
  status: "overpaid" | "underpaid" | "within_range";
}

interface SummaryItem {
  count: number;
  percent: number;
}

interface StatsData {
  start_height: number;
  end_height: number;
  latest_block_height: number;
  blocks: BlockData[];
  summary: {
    overpaid: SummaryItem;
    underpaid: SummaryItem;
    within: SummaryItem;
  };
}

// API intergration
async function fetchBlockStats(startHeight: number): Promise<StatsData> {
  const res = await fetch(
    `http://localhost:8000/stats?start_height=${startHeight}`,
    { cache: "no-store" }
  );

  if (!res.ok) {
    throw new Error("Failed to fetch block stats");
  }

  return res.json();
}

export default function AnalyticsPage() {
  const [statsData, setStatsData] = useState<StatsData | null>(null);
  const [startHeight, setStartHeight] = useState(849000);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);

    fetchBlockStats(startHeight)
      .then((data) =>setStatsData(data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [startHeight]);

  return (
    <div className="min-h-screen bg-linear-to-br from-gray-900 via-black to-gray-800 p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        
        <div className="bg-linear-to-br from-gray-900/80 to-gray-800/80 backdrop-blur-sm rounded-2xl shadow-sm border border-gray-700 p-6 mt-16">
          <h1 className="bg-linear-to-r from-yellow-400 to-yellow-600 bg-clip-text text-transparent text-2xl font-semibold mb-2">
            Block Statistics Dashboard
          </h1>
          <p className="text-gray-200">
            Analyzing block fee rates and statistics over a 1000-block interval
          </p>
        </div>

        {/* Block selector */}
        <BlockHeightSelector
          startHeight={startHeight}
          latestHeight={statsData?.latest_block_height ?? startHeight}
          onHeightChange={setStartHeight}
          disabled={loading}
        />
        {/*Error Message */}
        {error && (
          <div className="bg-red-100 text-red-900 rounded-lg p-4">
            Error: {error}
          </div>
        )}
        {/* Content */}
        {loading ? (
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-12 text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900"></div>
            <p className="mt-4 text-slate-600">
              Loading block statistics…
            </p>
          </div>
        ) : statsData ? (
          <>
            <SummaryBreakdown summary={statsData.summary} />

            <BlockStatsChart
              blocks={statsData.blocks}
              startHeight={statsData.start_height}
              endHeight={statsData.end_height}
            />
          </>
        ) : null}
      </div>
    </div>
  );
}

