"use client";

import { useState, useEffect, useCallback } from "react";
import { api, MempoolDiagramResponse } from "../../services/api";
import { Header } from "../../components/common/Header";
import { useNetwork } from "../../context/NetworkContext";
import MempoolDiagramChart from "../../components/mempool/MempoolDiagramChart";
import { Activity, Database, AlertCircle, RefreshCw, Layers, TrendingUp, Scale, Database as DbIcon } from "lucide-react";

export default function MempoolPage() {
  const { chain } = useNetwork();
  const [data, setData] = useState<MempoolDiagramResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [blocksToShow, setBlocksToShow] = useState<number | "all">(1);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await api.getMempoolDiagram(chain);
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch mempool diagram");
    } finally {
      setLoading(false);
    }
  }, [chain]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const rawData = data?.raw || [];
  const currentWindowKey = blocksToShow.toString();
  const currentPercentiles = data?.windows[currentWindowKey] || {};
  
  const totalWeight = data?.total_weight || 0;
  const totalFee = data?.total_fee || 0;

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] selection:bg-orange-500/30 font-sans">
      <Header />

      <main className="max-w-7xl mx-auto px-4 py-8 md:py-12">
        {/* Sleek Header Bar with Total Stats */}
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-8 gap-6">
          <div className="flex flex-wrap items-center gap-6 text-left">
            <div className="flex flex-col">
              <span className="text-[8px] uppercase font-black text-[var(--muted)] tracking-widest">Total Size</span>
              <span className="text-sm font-mono font-bold">{(totalWeight / 1000000).toFixed(2)} MWU</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[8px] uppercase font-black text-[var(--muted)] tracking-widest">Total Fees</span>
              <span className="text-sm font-mono font-bold">{totalFee.toFixed(4)} BTC</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[8px] uppercase font-black text-[var(--muted)] tracking-widest">Mempool Chunks</span>
              <span className="text-sm font-mono font-bold">{rawData.length || "---"}</span>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1 bg-[var(--card)] p-1 rounded-xl border border-[var(--card-border)] shadow-sm">
              {[1, 2, 3, "all"].map((b) => (
                <button
                  key={b}
                  onClick={() => setBlocksToShow(b as any)}
                  className={`px-4 py-1.5 rounded-lg text-[10px] font-black transition-all ${
                    blocksToShow === b ? "bg-orange-500 text-white shadow-md shadow-orange-500/20" : "text-[var(--muted)] hover:text-[var(--foreground)]"
                  }`}
                >
                  {b === "all" ? "ALL" : `${b}B`}
                </button>
              ))}
            </div>

            <button 
              onClick={fetchData}
              disabled={loading}
              className="flex items-center gap-2 bg-[var(--card)] px-5 py-2.5 rounded-xl border border-[var(--card-border)] font-black text-xs transition-all disabled:opacity-50 hover:border-orange-500/50 active:scale-95 shadow-sm tracking-widest"
            >
              <RefreshCw className={`w-4 h-4 text-orange-500 ${loading ? 'animate-spin' : ''}`} />
              REFRESH
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-10 p-5 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center gap-4 text-red-500 text-sm font-bold">
            <AlertCircle className="w-6 h-6 flex-shrink-0" />
            <p>Error: {error}</p>
          </div>
        )}

        {/* Hero Section: Windowed Percentiles */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-10">
          {["5", "25", "50", "75", "95"].map((p) => (
            <div key={p} className="bg-[var(--card)] p-6 rounded-3xl border border-[var(--card-border)] shadow-sm text-left group hover:border-orange-500/30 transition-all">
              <h3 className="text-[var(--muted)] text-[9px] font-bold uppercase tracking-[0.2em] mb-2">{p}th Percentile</h3>
              <div className="flex items-baseline gap-1">
                <p className="text-2xl font-black font-mono tracking-tighter">
                  {currentPercentiles[p] ? currentPercentiles[p].toFixed(1) : "---"}
                </p>
                <span className="text-[10px] font-bold text-[var(--muted)]">sat/vB</span>
              </div>
            </div>
          ))}
        </div>

        {/* Main Diagram Area */}
        <div className="w-full bg-[var(--card)] p-10 rounded-3xl border border-[var(--card-border)] shadow-xl relative overflow-hidden flex flex-col text-left">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-10 gap-4">
            <div>
              <h2 className="text-xl font-bold text-[var(--foreground)] tracking-tight">
                Mempool Fee/Weight Diagram
              </h2>
              <p className="text-[10px] uppercase font-bold text-[var(--muted)] mt-1 tracking-widest">
                {blocksToShow === "all" ? "Full mempool accumulation" : `Accumulation across first ${blocksToShow} block window`}
              </p>
            </div>
            <div className="flex gap-4 text-[9px] font-black uppercase tracking-widest text-[var(--muted)] bg-[var(--background)] px-4 py-2 rounded-lg border border-[var(--card-border)]">
              <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 bg-orange-500 rounded-sm"></div> Cumulative Fee</div>
              <div className="flex items-center gap-1.5"><div className="w-2.5 h-0.5 border-t border-dashed border-[#666]"></div> Block Boundary</div>
            </div>
          </div>
          
          <div className="relative min-h-[500px] w-full flex items-center justify-center">
            {loading && rawData.length === 0 ? (
              <div className="flex flex-col items-center gap-4">
                <div className="w-10 h-10 border-2 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
                <p className="text-[var(--muted)] text-[10px] font-mono uppercase tracking-[0.3em] animate-pulse">Syncing mempool state...</p>
              </div>
            ) : data ? (
              <MempoolDiagramChart 
                data={data.raw} 
                percentiles={currentPercentiles}
                blocksToShow={blocksToShow}
                loading={loading} 
              />
            ) : (
              <div className="flex flex-col items-center gap-4 py-20 text-[var(--muted)]">
                <DbIcon className="w-12 h-12 opacity-20" />
                <p className="text-sm font-bold uppercase tracking-widest">Mempool analysis unavailable</p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
