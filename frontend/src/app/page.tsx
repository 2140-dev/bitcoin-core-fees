"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "../services/api";
import { AlertCircle, BarChart2, Activity, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { FeeEstimateResponse, MempoolHealthStats } from "../types/api";
import { Header } from "../components/common/Header";
import { useNetwork } from "../context/NetworkContext";
import { prefetchStats } from "../lib/statsCache";

type FeeMode = "economical" | "conservative";

const TARGETS = [
  { value: 2,   label: "Next Block" },
  { value: 7,   label: "7 Blocks"   },
  { value: 144, label: "1 Day"      },
] as const;

type FeeDataMap = Partial<Record<number, FeeEstimateResponse>>;

export default function LandingPage() {
  const { chain } = useNetwork();
  const [mode, setMode] = useState<FeeMode>("economical");
  const [feeData, setFeeData] = useState<FeeDataMap>({});
  const [healthStats, setHealthStats] = useState<MempoolHealthStats[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchAll = useCallback(async (feeMode: FeeMode, silent = false) => {
    if (!chain) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      if (!silent) setInitialLoading(true);
      else setIsUpdating(true);
      setError(null);

      const [health, ...estimates] = await Promise.all([
        api.getMempoolHealth(chain),
        ...TARGETS.map(({ value }) => api.getFeeEstimate(value, feeMode, 2, chain)),
      ]);

      if (controller.signal.aborted) return;

      const map: FeeDataMap = {};
      TARGETS.forEach(({ value }, i) => { map[value] = estimates[i] as FeeEstimateResponse; });
      setFeeData(map);
      setHealthStats(health as MempoolHealthStats[]);
    } catch (err) {
      if (!controller.signal.aborted) {
        setError(err instanceof Error ? err.message : "Failed to fetch fee data");
      }
    } finally {
      if (!controller.signal.aborted) {
        setInitialLoading(false);
        setIsUpdating(false);
      }
    }
  }, [chain]);

  useEffect(() => {
    fetchAll(mode, true);
    const interval = setInterval(() => fetchAll(mode, true), 30_000);
    return () => {
      clearInterval(interval);
      abortRef.current?.abort();
    };
  }, [fetchAll, mode]);

  // Fire-and-forget prefetch for stats page when chain resolves.
  useEffect(() => {
    if (chain) prefetchStats(chain);
  }, [chain]);

  const toggleMode = () => {
    setMode(prev => prev === "economical" ? "conservative" : "economical");
  };

  const scroll = (direction: "left" | "right") => {
    if (scrollRef.current) {
      const { scrollLeft, clientWidth } = scrollRef.current;
      scrollRef.current.scrollTo({
        left: direction === "left" ? scrollLeft - clientWidth : scrollLeft + clientWidth,
        behavior: "smooth",
      });
    }
  };

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] selection:bg-orange-500/30 font-sans">
      <Header />

      <main className="relative overflow-hidden pt-12 pb-24">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-4xl h-[400px] bg-orange-500/5 blur-[100px] rounded-full pointer-events-none" />

        <div className="max-w-7xl mx-auto px-4 relative z-10">

          {/* Mode toggle */}
          <div className="flex justify-center mb-10">
            <button
              onClick={toggleMode}
              disabled={isUpdating}
              className="flex items-center gap-2 bg-[var(--card)] px-4 py-2 rounded-xl border border-[var(--card-border)] text-[10px] font-bold hover:border-orange-500/50 transition-all active:scale-95 disabled:opacity-50 shadow-sm uppercase tracking-widest"
            >
              {isUpdating
                ? <Loader2 className="w-3 h-3 animate-spin text-orange-500" />
                : <Activity className="w-3 h-3 text-orange-500" />}
              {mode}
            </button>
          </div>

          {error && (
            <div className="mb-8 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center gap-3 text-red-500 text-sm font-bold max-w-lg mx-auto">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              {error}
            </div>
          )}

          {/* Fee estimate cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-16">
            {TARGETS.map(({ value, label }) => (
              <FeeCard
                key={value}
                label={label}
                target={value}
                data={feeData[value]}
                loading={initialLoading}
                updating={isUpdating}
              />
            ))}
          </div>

          {/* Mempool health */}
          <div className="w-full text-left">
            <div className="flex items-center justify-between mb-6 px-1">
              <div className="flex items-center gap-2 text-[var(--muted)] font-mono">
                <BarChart2 className="w-4 h-4 text-orange-500" />
                <span className="text-[10px] font-bold uppercase tracking-widest">Mempool Health</span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => scroll("left")}
                  className="w-8 h-8 rounded-full border border-[var(--card-border)] flex items-center justify-center hover:bg-[var(--card)] transition-colors active:scale-90"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => scroll("right")}
                  className="w-8 h-8 rounded-full border border-[var(--card-border)] flex items-center justify-center hover:bg-[var(--card)] transition-colors active:scale-90"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div
              ref={scrollRef}
              className="flex overflow-x-auto gap-4 pb-8 snap-x snap-proximity no-scrollbar"
            >
              {initialLoading ? (
                Array(4).fill(0).map((_, i) => (
                  <div key={i} className="min-w-[300px] h-36 bg-[var(--card)] rounded-2xl animate-pulse border border-[var(--card-border)]" />
                ))
              ) : healthStats.length > 0 ? (
                healthStats.map((stat, i) => <HealthBlock key={i} stat={stat} />)
              ) : (
                <div className="w-full py-16 text-center text-[var(--muted)] text-sm bg-[var(--card)] rounded-2xl border border-[var(--card-border)]">
                  Mempool metrics unavailable for this node.
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      <footer className="py-12 border-t border-[var(--card-border)] opacity-50">
        <div className="max-w-7xl mx-auto px-4 text-center text-[var(--muted)] text-[10px] font-mono uppercase tracking-[0.3em]">
          Powered by Bitcoin Core RPC
        </div>
      </footer>
    </div>
  );
}

function FeeCard({ label, target, data, loading, updating }: {
  label: string;
  target: number;
  data: FeeEstimateResponse | undefined;
  loading: boolean;
  updating: boolean;
}) {
  return (
    <div className="bg-[var(--card)] rounded-3xl border border-[var(--card-border)] p-8 shadow-sm hover:shadow-md transition-all text-center">
      <div className="text-[10px] font-mono text-orange-500 font-bold uppercase tracking-[0.2em] mb-6">
        {label}
      </div>
      <div className="min-h-[100px] flex items-center justify-center">
        {loading ? (
          <LoadingSpinner />
        ) : (
          <div className={`transition-all duration-300 ${updating ? "opacity-40 scale-95 blur-[1px]" : ""}`}>
            <div className="flex items-baseline justify-center gap-2">
              <span className="text-6xl font-black tracking-tighter tabular-nums font-mono">
                {data?.feerate_sat_per_vb ? data.feerate_sat_per_vb.toFixed(1) : "---"}
              </span>
              <span className="text-base font-medium text-[var(--muted)]">sat/vB</span>
            </div>
            <p className="text-[10px] text-[var(--text-secondary)] font-mono mt-2 tracking-wide">
              {target === 2 ? "1–2 blocks" : `within ${target} blocks`}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function HealthBlock({ stat }: { stat: MempoolHealthStats }) {
  const ratio = stat.ratio;
  const color = ratio > 0.95 ? "bg-green-500" : ratio > 0.7 ? "bg-orange-500" : "bg-red-500";

  return (
    <div className="min-w-[300px] p-6 bg-[var(--card)] rounded-2xl border border-[var(--card-border)] snap-start hover:border-orange-500/30 transition-all shadow-sm">
      <div className="flex justify-between items-center mb-5 text-left">
        <span className="text-[11px] font-mono text-[var(--muted)] font-bold uppercase">Block {stat.block_height}</span>
        <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${color} text-white shadow-sm`}>
          {(ratio * 100).toFixed(1)}%
        </span>
      </div>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <div className="flex justify-between text-[10px] uppercase font-bold text-[var(--muted)]">
            <span>Block</span>
            <span className="text-[var(--foreground)]">{(stat.block_weight / 1000).toFixed(0)} kWU</span>
          </div>
          <div className="w-full bg-[var(--background)] h-2 rounded-full overflow-hidden border border-[var(--card-border)]">
            <div className="bg-[var(--muted)] opacity-20 h-full" style={{ width: `${Math.min(100, (stat.block_weight / 4_000_000) * 100)}%` }} />
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex justify-between text-[10px] uppercase font-bold text-[var(--muted)]">
            <span>Mempool</span>
            <span className="text-[var(--foreground)]">{(stat.mempool_txs_weight / 1000).toFixed(0)} kWU</span>
          </div>
          <div className="w-full bg-[var(--background)] h-2 rounded-full overflow-hidden border border-[var(--card-border)]">
            <div className={`${color} h-full`} style={{ width: `${Math.min(100, (stat.mempool_txs_weight / 4_000_000) * 100)}%` }} />
          </div>
        </div>
      </div>
    </div>
  );
}

function LoadingSpinner() {
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="w-8 h-8 border-2 border-[var(--card-border)] border-t-orange-500 rounded-full animate-spin" />
      <span className="text-[10px] font-mono uppercase text-[var(--muted)] animate-pulse tracking-widest">Estimating...</span>
    </div>
  );
}
