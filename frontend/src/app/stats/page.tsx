"use client";

import { useState } from "react";
import { BarChart3, TrendingUp, AlertCircle, CheckCircle2, Database, ArrowRight, RefreshCw } from "lucide-react";
import { useStats } from "../../hooks/useStats";
import { useNetwork } from "../../context/NetworkContext";
import FeeHistoryChart from "../../components/stats/FeeHistoryChart";
import SummaryCard from "../../components/stats/SummaryCard";

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

export default function StatsPage() {
  const { chain } = useNetwork();
  const [target, setTarget] = useState(2);
  const [scaleType, setScaleType] = useState<"log" | "linear">("linear");
  const {
    blocks,
    estimates,
    blockPolicyEstimates,
    summary,
    summaryMode,
    setSummaryMode,
    chartLoading,
    summaryLoading,
    error,
    startBlock,
    setStartBlock,
    endBlock,
    setEndBlock,
    latestBlock,
    handleApply,
    syncHeight
  } = useStats(target, chain);

  // The all-time cache isn't populated yet when the server returns a live
  // (all_time:false) fallback while we asked for all-time.
  const allTimePending = summaryMode === "all-time" && summary?.all_time === false;

  const handleStartChange = (val: number) => {
    setStartBlock(val);
    if (endBlock !== null && (endBlock - val) > 1000) setEndBlock(val + 1000);
  };

  const handleEndChange = (val: number) => {
    setEndBlock(val);
    if (startBlock !== null && (val - startBlock) > 1000) setStartBlock(val - 1000);
  };

  const handleSyncLatest = async () => {
    const current = await syncHeight();
    if (current) {
      setEndBlock(current);
      setStartBlock(current - 100);
    }
  };

  const hasBlocks = blocks && blocks.length > 0;

  return (
      <main className="max-w-7xl mx-auto px-4 py-8 md:py-12">
        {/* Sleek Control Bar */}
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-10 gap-6">
          <div className="text-left">
            <p className="text-[var(--muted)] text-sm font-mono uppercase tracking-[0.2em]">
              Latest Block: <span className="font-bold text-[var(--foreground)]">{latestBlock || "---"}</span>
            </p>
          </div>
          
          <div className="flex flex-wrap items-center gap-4">
            <button
              onClick={() => setScaleType(prev => prev === "log" ? "linear" : "log")}
              className="px-4 py-2 rounded-xl bg-[var(--card)] border border-[var(--card-border)] text-[10px] font-black hover:border-orange-500/50 transition-all shadow-sm tracking-widest"
            >
              {scaleType.toUpperCase()} SCALE
            </button>

            <div className="flex items-center gap-1 bg-[var(--card)] p-1 rounded-xl border border-[var(--card-border)] shadow-sm">
              {[2, 7, 144].map((t) => (
                <button
                  key={t}
                  onClick={() => setTarget(t)}
                  className={`px-5 py-2 rounded-lg text-xs font-bold transition-all ${
                    target === t ? "bg-[#F7931A] text-white shadow-md shadow-orange-500/20" : "text-[var(--muted)] hover:text-[var(--foreground)]"
                  }`}
                >
                  {t === 144 ? "1 Day" : t === 7 ? "7B" : "NextB"}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 bg-[var(--card)] p-1.5 rounded-xl border border-[var(--card-border)] shadow-md">
              <div className="flex items-center gap-3 px-3">
                <div className="flex flex-col">
                  <span className="text-[8px] uppercase font-black text-[var(--muted)] tracking-tighter">Start</span>
                  <input 
                    type="number" 
                    value={startBlock || ""} 
                    onChange={(e) => handleStartChange(Number(e.target.value))}
                    className="bg-transparent border-none focus:ring-0 text-sm w-20 p-0 outline-none font-mono font-black"
                  />
                </div>
                <ArrowRight className="w-3 h-3 text-[var(--muted)] opacity-30" />
                <div className="flex flex-col">
                  <span className="text-[8px] uppercase font-black text-[var(--muted)] tracking-tighter">End</span>
                  <input 
                    type="number" 
                    value={endBlock || ""} 
                    onChange={(e) => handleEndChange(Number(e.target.value))}
                    className="bg-transparent border-none focus:ring-0 text-sm w-20 p-0 outline-none font-mono font-black"
                  />
                </div>
              </div>
              <button 
                onClick={handleApply}
                disabled={chartLoading}
                className="bg-[var(--foreground)] text-[var(--background)] px-5 py-2.5 rounded-lg font-black text-[10px] transition-all disabled:opacity-50 hover:opacity-90 active:scale-95 tracking-[0.1em]"
              >
                {chartLoading ? "..." : "SYNC"}
              </button>
              <button 
                onClick={handleSyncLatest}
                title="Sync to Latest Block"
                className="p-2 rounded-lg hover:bg-[var(--background)] transition-colors text-orange-500"
              >
                <RefreshCw className={`w-4 h-4 ${chartLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-10 p-5 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center gap-4 text-red-500 text-sm font-bold">
            <AlertCircle className="w-6 h-6 flex-shrink-0" />
            <p>Error: {error}</p>
          </div>
        )}

        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-sm font-black uppercase tracking-widest text-[var(--foreground)]">Estimate Accuracy</h2>
            {/* Historical estimates are collected in the node's default (unset) mode. */}
            <span className="text-[9px] font-bold uppercase tracking-widest text-[var(--muted)] bg-[var(--surface-2)] px-2 py-1 rounded-md border border-[var(--card-border)]">Default mode</span>
            {summaryMode === "range" && startBlock !== null && (
              <span className="text-[9px] font-mono font-bold uppercase tracking-widest text-[var(--muted)]">
                blocks {startBlock}–{latestBlock ?? endBlock ?? "…"}
              </span>
            )}
            {summaryMode === "all-time" && (
              allTimePending ? (
                <span className="text-[9px] font-bold uppercase tracking-widest text-amber-500 bg-amber-500/10 px-2 py-1 rounded-md border border-amber-500/20 animate-pulse">computing…</span>
              ) : summary?.computed_at ? (
                <span className="text-[9px] font-medium tracking-wide text-[var(--muted)]">updated {relativeTime(summary.computed_at)}</span>
              ) : null
            )}
          </div>
          {/* Summary scope toggle — the chart below stays range-only. */}
          <div className="flex items-center gap-1 bg-[var(--card)] p-1 rounded-xl border border-[var(--card-border)] shadow-sm self-start">
            {(["all-time", "range"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setSummaryMode(m)}
                className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                  summaryMode === m ? "bg-[#F7931A] text-white shadow-md shadow-orange-500/20" : "text-[var(--muted)] hover:text-[var(--foreground)]"
                }`}
              >
                {m === "all-time" ? "All-time" : "Range"}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          <SummaryCard
            title="Within Range"
            value={summary?.within_val}
            percent={summary?.within_perc}
            icon={<CheckCircle2 className="w-6 h-6 text-green-500" />}
            colorClass="text-green-500"
            bgColorClass="bg-green-500/10"
            total={summary?.total}
            loading={summaryLoading}
          />
          <SummaryCard 
            title="Overpaid"
            value={summary?.overpayment_val}
            percent={summary?.overpayment_perc}
            icon={<TrendingUp className="w-6 h-6 text-red-500" />}
            colorClass="text-red-500"
            bgColorClass="bg-red-500/10"
            total={summary?.total}
            loading={summaryLoading}
          />
          <SummaryCard 
            title="Underpaid"
            value={summary?.underpayment_val}
            percent={summary?.underpayment_perc}
            icon={<AlertCircle className="w-6 h-6 text-yellow-500" />}
            colorClass="text-yellow-500"
            bgColorClass="bg-yellow-500/10"
            total={summary?.total}
            loading={summaryLoading}
          />
        </div>

        <div className="w-full bg-[var(--card)] p-8 rounded-3xl border border-[var(--card-border)] shadow-xl relative overflow-hidden flex flex-col text-left">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-10 gap-4">
            <div>
              <h2 className="text-xl font-bold flex items-center gap-3 text-[var(--foreground)]">
                <BarChart3 className="w-6 h-6 text-orange-500" />
                Inclusion History
              </h2>
              <p className="text-[10px] uppercase font-bold text-[var(--muted)] mt-1 tracking-widest">p10 to p90 block fee distribution</p>
            </div>
            <div className="flex gap-4 text-[9px] font-medium uppercase tracking-wider text-[var(--muted)] bg-[var(--surface-2)] px-4 py-2 rounded-lg border border-[var(--card-border)]">
              <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 bg-[var(--muted)] opacity-40 rounded-sm"></div> p10–p90 range</div>
              <div className="flex items-center gap-1.5"><div className="w-2.5 h-0.5 bg-[var(--data-blue)] rounded-full"></div> Fee estimate</div>
              <div className="flex items-center gap-1.5"><div className="w-2.5 h-0.5 rounded-full" style={{backgroundColor: "#d97706"}}></div> Block policy</div>
            </div>
          </div>
          
          <div className="relative min-h-[500px] w-full flex items-center justify-center">
            {chartLoading ? (
              <div className="flex flex-col items-center gap-4">
                <div className="w-10 h-10 border-2 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
                <p className="text-[var(--muted)] text-[10px] font-mono uppercase tracking-[0.3em] animate-pulse">Syncing data...</p>
              </div>
            ) : hasBlocks ? (
              <FeeHistoryChart blocks={blocks} estimates={estimates} blockPolicyEstimates={blockPolicyEstimates} loading={chartLoading} scaleType={scaleType} />
            ) : (
              <div className="flex flex-col items-center gap-4 py-20 text-[var(--muted)]">
                <Database className="w-12 h-12 opacity-20" />
                <div className="text-center">
                  <p className="text-sm font-bold uppercase tracking-widest">No range data available</p>
                  <p className="text-xs opacity-60 mt-1">Try refreshing or syncing to the latest block height.</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
  );
}
