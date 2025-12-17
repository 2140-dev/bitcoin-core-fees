"use client";

interface SummaryItem {
  count: number;
  percent: number;
}

interface SummaryBreakdownProps {
  summary: {
    overpaid: SummaryItem;
    underpaid: SummaryItem;
    within: SummaryItem;
  } | null; // allow null while loading
}

export function SummaryBreakdown({ summary }: SummaryBreakdownProps) {
  // Handle null summary safely
  const stats = [
    {
      label: "overpaid",
      value: summary?.overpaid?.count ?? 0,
      percentage: summary?.overpaid?.percent ?? 0,
      color: "bg-red-500",
      borderColor: "border-red-200",
      bgColor: "bg-red-50",
      textColor: "text-red-900",
    },
    {
      label: "underpaid",
      value: summary?.underpaid?.count ?? 0,
      percentage: summary?.underpaid?.percent ?? 0,
      color: "bg-amber-500",
      borderColor: "border-amber-200",
      bgColor: "bg-amber-50",
      textColor: "text-amber-900",
    },
    {
      label: "within range",
      value: summary?.within?.count ?? 0,
      percentage: summary?.within?.percent ?? 0,
      color: "bg-emerald-500",
      borderColor: "border-emerald-200",
      bgColor: "bg-emerald-50",
      textColor: "text-emerald-900",
    },
  ];

  const totalBlocks =
    stats[0].value + stats[1].value + stats[2].value;

  return (
    <div className="bg-linear-to-br from-gray-900/80 to-gray-800/80 backdrop-blur-sm rounded-2xl shadow-sm border border-slate-700 p-6">
      <h2 className="text-slate-200 mb-4">Summary Breakdown</h2>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className={`${stat.bgColor} border ${stat.borderColor} rounded-lg p-5`}
          >
            <div className="flex items-center gap-2 mb-2">
              <div className={`w-3 h-3 rounded-full ${stat.color}`} />
              <span className={`${stat.textColor} capitalize`}>
                {stat.label}
              </span>
            </div>

            <div className="mt-3">
              <div className={`${stat.textColor} text-lg font-semibold`}>
                {stat.value.toLocaleString()}
              </div>
              <div className={`${stat.textColor} opacity-70`}>
                ({stat.percentage}%)
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 pt-4 border-t border-slate-500">
        <div className="flex justify-between text-slate-200">
          <span>Total Blocks Analyzed:</span>
          <span className="font-semibold">{totalBlocks.toLocaleString()}</span>
        </div>
      </div>
    </div>
  );
}
