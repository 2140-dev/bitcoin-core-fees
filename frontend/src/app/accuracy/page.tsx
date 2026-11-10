"use client";

import { useState } from "react";
import { TrendingUp, AlertCircle, CheckCircle2 } from "lucide-react";
import { useSummary, FeeMode, Estimator } from "../../hooks/useSummary";
import { useNetwork } from "../../context/NetworkContext";
import SummaryCard from "../../components/stats/SummaryCard";
import TargetSelector from "../../components/stats/TargetSelector";
import RangeControls from "../../components/stats/RangeControls";

function relativeTime(ts?: string): string {
  if (!ts) return "";
  const then = new Date(ts.replace(" ", "T") + "Z").getTime();
  if (Number.isNaN(then)) return "";
  const mins = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  return `${Math.round(mins / 60)}h ago`;
}

/** Small segmented control used for the mode and estimator pickers. */
function Segmented<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="flex items-center gap-1 bg-[var(--card)] p-1 rounded-xl border border-[var(--card-border)] shadow-sm">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
            value === o.value ? "bg-[#F7931A] text-white shadow-md shadow-orange-500/20" : "text-[var(--muted)] hover:text-[var(--foreground)]"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export default function AccuracyPage() {
  const { chain } = useNetwork();
  const [target, setTarget] = useState(2);
  const {
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

  const isAllTime = scope === "all-time";
  const shownStart = isAllTime ? summary?.first_height ?? null : startBlock;
  const shownEnd = isAllTime ? latestBlock : endBlock;
  const allTimePending = isAllTime && summary?.all_time === false;

  return (
    <main className="max-w-7xl mx-auto px-4 py-8 md:py-12">
      {/* Header: title + target + scope */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-5 mb-5">
        <div className="text-left">
          <h1 className="text-2xl font-black tracking-tight text-[var(--foreground)]">Estimate Accuracy</h1>
          <p className="text-[var(--muted)] text-[11px] font-mono uppercase tracking-[0.2em] mt-1">
            fee estimates vs. the p10–p90 fee range of the blocks they targeted
          </p>
        </div>
        <div className="flex items-center gap-3">
          <TargetSelector target={target} onChange={setTarget} />
          <Segmented
            value={scope}
            onChange={setScope}
            options={[
              { value: "all-time", label: "All-time" },
              { value: "range", label: "Range" },
            ]}
          />
        </div>
      </div>

      {/* Series pickers: estimator + mode */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <Segmented<Estimator>
          value={estimator}
          onChange={setEstimator}
          options={[
            { value: "auto", label: "mempool_policy" },
            { value: "block_policy", label: "block_policy" },
          ]}
        />
        <Segmented<FeeMode>
          value={feeMode}
          onChange={setFeeMode}
          options={[
            { value: "economical", label: "economical" },
            { value: "conservative", label: "conservative" },
          ]}
        />
        {feeMode === "economical" && (
          <span className="text-[9px] font-medium uppercase tracking-widest text-[var(--muted)]">= node default (unset)</span>
        )}
      </div>

      {/* Window + freshness */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <RangeControls
          startBlock={shownStart}
          endBlock={shownEnd}
          onStartChange={handleStartChange}
          onEndChange={handleEndChange}
          onApply={handleApply}
          onSyncLatest={handleSyncLatest}
          loading={loading}
          disabled={isAllTime}
        />
        <div className="flex items-center gap-2 flex-wrap">
          {isAllTime ? (
            allTimePending ? (
              <span className="text-[9px] font-bold uppercase tracking-widest text-amber-500 bg-amber-500/10 px-2 py-1 rounded-md border border-amber-500/20 animate-pulse">computing…</span>
            ) : summary?.computed_at ? (
              <span className="text-[9px] font-medium tracking-wide text-[var(--muted)]">updated {relativeTime(summary.computed_at)}</span>
            ) : null
          ) : (
            shownStart !== null && (
              <span className="text-[9px] font-mono font-bold uppercase tracking-widest text-[var(--muted)]">
                blocks {shownStart}–{shownEnd ?? "…"}
              </span>
            )
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <SummaryCard
          title="Within range"
          value={summary?.within_val}
          percent={summary?.within_perc}
          icon={<CheckCircle2 className="w-6 h-6 text-green-500" />}
          colorClass="text-green-500"
          bgColorClass="bg-green-500/10"
          total={summary?.total}
          loading={loading}
        />
        <SummaryCard
          title="Above p90"
          value={summary?.overpayment_val}
          percent={summary?.overpayment_perc}
          icon={<TrendingUp className="w-6 h-6 text-red-500" />}
          colorClass="text-red-500"
          bgColorClass="bg-red-500/10"
          total={summary?.total}
          loading={loading}
        />
        <SummaryCard
          title="Below p10"
          value={summary?.underpayment_val}
          percent={summary?.underpayment_perc}
          icon={<AlertCircle className="w-6 h-6 text-yellow-500" />}
          colorClass="text-yellow-500"
          bgColorClass="bg-yellow-500/10"
          total={summary?.total}
          loading={loading}
        />
      </div>
      <p className="text-[11px] text-[var(--muted)] mt-4 leading-relaxed max-w-3xl">
        <span className="font-bold text-green-500">Within range</span>: the estimate fell inside p10–p90 of at least one block in the
        confirmation window. <span className="font-bold text-red-500">Above p90</span>: it exceeded p90 of every block (overpaid).
        <span className="font-bold text-yellow-500"> Below p10</span>: it stayed under p10 of every block (underpaid).
        {feeMode === "conservative" && (summary?.total ?? 0) === 0 && (
          <span className="block mt-1 text-amber-500">Conservative collection just started — history isn&apos;t available (no backfill), so this fills in over time.</span>
        )}
      </p>
    </main>
  );
}
