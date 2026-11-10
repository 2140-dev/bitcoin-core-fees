"use client";

import { useState } from "react";
import { TrendingUp, AlertCircle, CheckCircle2 } from "lucide-react";
import { useSummary } from "../../hooks/useSummary";
import { useNetwork } from "../../context/NetworkContext";
import SummaryCard from "../../components/stats/SummaryCard";
import TargetSelector from "../../components/stats/TargetSelector";
import RangeControls from "../../components/stats/RangeControls";

function relativeTime(ts?: string): string {
  if (!ts) return "";
  // SQLite UTC timestamp ("YYYY-MM-DD HH:MM:SS") — mark as UTC for the parser.
  const then = new Date(ts.replace(" ", "T") + "Z").getTime();
  if (Number.isNaN(then)) return "";
  const mins = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  return `${Math.round(mins / 60)}h ago`;
}

export default function AccuracyPage() {
  const { chain } = useNetwork();
  const [target, setTarget] = useState(2);
  const {
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
  } = useSummary(target, chain);

  const handleStartChange = (val: number) => {
    setStartBlock(val);
    if (endBlock !== null && endBlock - val > 1000) setEndBlock(val + 1000);
  };
  const handleEndChange = (val: number) => {
    setEndBlock(val);
    if (startBlock !== null && val - startBlock > 1000) setStartBlock(val - 1000);
  };
  const handleSyncLatest = async () => {
    const current = await syncHeight();
    if (current) {
      setEndBlock(current);
      setStartBlock(current - 1000);
    }
  };

  // The all-time cache isn't populated yet when the server returns a live
  // (all_time:false) fallback while we asked for all-time.
  const allTimePending = mode === "all-time" && summary?.all_time === false;

  return (
    <main className="max-w-7xl mx-auto px-4 py-8 md:py-12">
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-10 gap-6">
        <div className="text-left">
          <h1 className="text-2xl font-black tracking-tight text-[var(--foreground)]">Estimate Accuracy</h1>
          <p className="text-[var(--muted)] text-[11px] font-mono uppercase tracking-[0.2em] mt-1">
            how often estimates land inside the block&apos;s p10–p90 range
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <TargetSelector target={target} onChange={setTarget} />
          <div className="flex items-center gap-1 bg-[var(--card)] p-1 rounded-xl border border-[var(--card-border)] shadow-sm">
            {(["all-time", "range"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                  mode === m ? "bg-[#F7931A] text-white shadow-md shadow-orange-500/20" : "text-[var(--muted)] hover:text-[var(--foreground)]"
                }`}
              >
                {m === "all-time" ? "All-time" : "Range"}
              </button>
            ))}
          </div>
          {mode === "range" && (
            <RangeControls
              startBlock={startBlock}
              endBlock={endBlock}
              onStartChange={handleStartChange}
              onEndChange={handleEndChange}
              onApply={handleApply}
              onSyncLatest={handleSyncLatest}
              loading={loading}
            />
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap mb-4">
        {/* Collected estimates use the node's default (unset) mode. */}
        <span className="text-[9px] font-bold uppercase tracking-widest text-[var(--muted)] bg-[var(--surface-2)] px-2 py-1 rounded-md border border-[var(--card-border)]">Default mode</span>
        {mode === "range" && startBlock !== null && (
          <span className="text-[9px] font-mono font-bold uppercase tracking-widest text-[var(--muted)]">
            blocks {startBlock}–{latestBlock ?? endBlock ?? "…"}
          </span>
        )}
        {mode === "all-time" &&
          (allTimePending ? (
            <span className="text-[9px] font-bold uppercase tracking-widest text-amber-500 bg-amber-500/10 px-2 py-1 rounded-md border border-amber-500/20 animate-pulse">computing…</span>
          ) : summary?.computed_at ? (
            <span className="text-[9px] font-medium tracking-wide text-[var(--muted)]">updated {relativeTime(summary.computed_at)}</span>
          ) : null)}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <SummaryCard
          title="Within Range"
          value={summary?.within_val}
          percent={summary?.within_perc}
          icon={<CheckCircle2 className="w-6 h-6 text-green-500" />}
          colorClass="text-green-500"
          bgColorClass="bg-green-500/10"
          total={summary?.total}
          loading={loading}
        />
        <SummaryCard
          title="Overpaid"
          value={summary?.overpayment_val}
          percent={summary?.overpayment_perc}
          icon={<TrendingUp className="w-6 h-6 text-red-500" />}
          colorClass="text-red-500"
          bgColorClass="bg-red-500/10"
          total={summary?.total}
          loading={loading}
        />
        <SummaryCard
          title="Underpaid"
          value={summary?.underpayment_val}
          percent={summary?.underpayment_perc}
          icon={<AlertCircle className="w-6 h-6 text-yellow-500" />}
          colorClass="text-yellow-500"
          bgColorClass="bg-yellow-500/10"
          total={summary?.total}
          loading={loading}
        />
      </div>
    </main>
  );
}
