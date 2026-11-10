"use client";

import { useState } from "react";
import { BarChart3, AlertCircle, Database } from "lucide-react";
import { usePerformance } from "../../hooks/usePerformance";
import { useNetwork } from "../../context/NetworkContext";
import FeeHistoryChart from "../../components/stats/FeeHistoryChart";
import TargetSelector from "../../components/stats/TargetSelector";
import RangeControls from "../../components/stats/RangeControls";

export default function HistoryPage() {
  const { chain } = useNetwork();
  const [target, setTarget] = useState(2);
  const [scaleType, setScaleType] = useState<"log" | "linear">("linear");
  const {
    blocks,
    estimates,
    blockPolicyEstimates,
    loading,
    error,
    startBlock,
    setStartBlock,
    endBlock,
    setEndBlock,
    latestBlock,
    handleApply,
    syncHeight,
  } = usePerformance(target, chain);

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
      setStartBlock(current - 100);
    }
  };

  const hasBlocks = blocks && blocks.length > 0;

  return (
    <main className="max-w-7xl mx-auto px-4 py-8 md:py-12">
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-10 gap-6">
        <div className="text-left">
          <p className="text-[var(--muted)] text-sm font-mono uppercase tracking-[0.2em]">
            Latest Block: <span className="font-bold text-[var(--foreground)]">{latestBlock || "---"}</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <button
            onClick={() => setScaleType((prev) => (prev === "log" ? "linear" : "log"))}
            className="px-4 py-2 rounded-xl bg-[var(--card)] border border-[var(--card-border)] text-[10px] font-black hover:border-orange-500/50 transition-all shadow-sm tracking-widest"
          >
            {scaleType.toUpperCase()} SCALE
          </button>
          <TargetSelector target={target} onChange={setTarget} />
          <RangeControls
            startBlock={startBlock}
            endBlock={endBlock}
            onStartChange={handleStartChange}
            onEndChange={handleEndChange}
            onApply={handleApply}
            onSyncLatest={handleSyncLatest}
            loading={loading}
          />
        </div>
      </div>

      {error && (
        <div className="mb-10 p-5 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center gap-4 text-red-500 text-sm font-bold">
          <AlertCircle className="w-6 h-6 flex-shrink-0" />
          <p>Error: {error}</p>
        </div>
      )}

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
            <div className="flex items-center gap-1.5"><div className="w-2.5 h-0.5 rounded-full" style={{ backgroundColor: "#d97706" }}></div> Block policy</div>
          </div>
        </div>

        <div className="relative min-h-[500px] w-full flex items-center justify-center">
          {loading ? (
            <div className="flex flex-col items-center gap-4">
              <div className="w-10 h-10 border-2 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
              <p className="text-[var(--muted)] text-[10px] font-mono uppercase tracking-[0.3em] animate-pulse">Syncing data...</p>
            </div>
          ) : hasBlocks ? (
            <FeeHistoryChart blocks={blocks} estimates={estimates} blockPolicyEstimates={blockPolicyEstimates} loading={loading} scaleType={scaleType} />
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
