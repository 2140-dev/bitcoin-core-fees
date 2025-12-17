"use client";

import {
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ComposedChart,
} from "recharts";

interface BlockData {
  height: number;
  p25: number;
  p75: number;
  avgFee: number;
  status?: "overpaid" | "underpaid" | "within_range";
}

interface BlockStatsChartProps {
  blocks: BlockData[];
  startHeight: number;
  endHeight: number;
}

export default function BlockStatsChart({
  blocks,
  startHeight,
  endHeight,
}: BlockStatsChartProps) {
  // Precompute range thickness for fill-between
  const chartData = blocks.map((b) => ({
    ...b,
    range: b.p75 - b.p25,
  }));

  return (
    <div className="bg-linear-to-br from-gray-900/80 to-gray-800/80 backdrop-blur-sm rounded-2xl border border-slate-700 p-6">
      <h2 className="text-slate-200 text-lg mb-2">
        Block Statistics & Fee Rates
      </h2>

      <p className="text-slate-400 mb-6">
        Interval: {startHeight.toLocaleString()} -
        {endHeight.toLocaleString()}
      </p>

      <div className="h-96 bg-gray-200 rounded-md">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            
            {/*Block height */}
            <XAxis
              dataKey="height"
              stroke="#64748b"
              tickFormatter={(v) => v.toLocaleString()}
              interval="preserveStartEnd"
              minTickGap={50}
            />

            {/* Left Y axis: block stat range */}
            <YAxis
              yAxisId="left"
              stroke="#64748b"
              label={{
                value: "Block Stat Range (p25-p75)",
                angle: -90,
                position: "insideLeft",
              }}
            />

            {/* Right Y axis: fee rate */}
            <YAxis
              yAxisId="right"
              orientation="right"
              stroke="#64748b"
              label={{
                value: "Average Fee Rate",
                angle: -90,
                position: "insideRight",
              }}
            />

            <Tooltip />
            <Legend />

            {/* Invisible base (p25) */}
            <Area
              yAxisId="left"
              type="monotone"
              dataKey="p25"
              stackId="range"
              stroke="none"
              fill="transparent"
              isAnimationActive={false}
            />

            {/* Filled range: p75 - p25 */}
            <Area
              yAxisId="left"
              type="monotone"
              dataKey="range"
              stackId="range"
              stroke="none"
              fill="#3b82f6"
              fillOpacity={0.3}
              name="Block Stat Range (p25-p75)"
              isAnimationActive={false}
            />

            {/* Fee rate line */}
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="avgFee"
              stroke="#10b981"
              strokeWidth={2}
              dot={false}
              name="Average Fee Rate"
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
