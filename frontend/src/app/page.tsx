"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "../services/api";
import { Activity, AlertCircle, BarChart2, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { FeeEstimateResponse, MempoolHealthStats } from "../types/api";
import { Header } from "../components/common/Header";
import { useNetwork } from "../context/NetworkContext";
import { prefetchStats } from "../lib/statsCache";
import FeeCard from "../components/home/FeeCard";
import HealthBlock from "../components/home/HealthBlock";

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

