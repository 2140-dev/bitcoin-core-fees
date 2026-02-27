"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { api } from "../services/api";
import { AlertCircle, BarChart2, Activity, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { FeeEstimateResponse, MempoolHealthStats } from "../types/api";
import { Header } from "../components/common/Header";

type FeeMode = "economical" | "conservative";

export default function LandingPage() {
  const [target, setTarget] = useState(2);
  const [mode, setMode] = useState<FeeMode>("economical");
  const [feeData, setFeeData] = useState<any>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const fetchFee = useCallback(async (confTarget: number, feeMode: FeeMode, silent = false) => {
    try {
      if (!silent) setInitialLoading(true);
      else setIsUpdating(true);
      
      setError(null);
      // Backend automatically maps target <= 1 to 2
      const data = await api.getFeeEstimate(confTarget, feeMode, 2);
      setFeeData(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to fetch fee data";
      setError(msg);
    } finally {
      setInitialLoading(false);
      setIsUpdating(false);
    }
  }, []);

  useEffect(() => {
    fetchFee(target, mode, true);
  }, [fetchFee, target, mode]);

  const toggleMode = () => {
    setMode(prev => prev === "economical" ? "conservative" : "economical");
  };

  const scroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const { scrollLeft, clientWidth } = scrollRef.current;
      const scrollTo = direction === 'left' ? scrollLeft - clientWidth : scrollLeft + clientWidth;
      scrollRef.current.scrollTo({ left: scrollTo, behavior: 'smooth' });
    }
  };

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] selection:bg-orange-500/30 font-sans">
      <Header />
      
      <main className="relative overflow-hidden pt-12 pb-24">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-4xl h-[400px] bg-orange-500/5 blur-[100px] rounded-full pointer-events-none"></div>
        
        <div className="max-w-7xl mx-auto px-4 relative z-10 text-center">
          <div className="flex flex-col items-center mb-12">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[var(--card)] border border-[var(--card-border)] text-[var(--muted)] text-[10px] font-mono mb-6 uppercase tracking-widest shadow-sm">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
              NETWORK: MAINNET
            </div>
            
            <div className="flex items-center gap-2 bg-[var(--card)] p-1 rounded-xl border border-[var(--card-border)] shadow-sm">
              {[2, 7, 144].map((t) => (
                <button
                  key={t}
                  onClick={() => setTarget(t)}
                  className={`px-6 py-2 rounded-lg text-xs font-bold transition-all ${
                    target === t ? "bg-[#F7931A] text-white shadow-md shadow-orange-500/20" : "text-[var(--muted)] hover:text-[var(--foreground)]"
                  }`}
                >
                  {t === 144 ? "1 Day" : t === 7 ? "1 Hour" : "Next Block"}
                </button>
              ))}
            </div>
          </div>

          <div className="max-w-5xl mx-auto w-full space-y-16">
            {/* Fee Card Section */}
            <div className="relative max-w-md mx-auto">
              <div className="absolute -inset-4 bg-orange-500/5 blur-2xl rounded-full pointer-events-none"></div>
              
              <div 
                className="relative bg-[var(--card)] rounded-3xl border border-[var(--card-border)] p-10 shadow-2xl transition-all group overflow-hidden"
              >
                <div className="flex justify-between items-center mb-10">
                  <div className="flex flex-col items-start text-left">
                    <span className="text-[10px] font-mono text-orange-500 font-bold uppercase tracking-[0.2em] mb-1">
                      ESTIMATE MODE
                    </span>
                    <h3 className="text-sm font-bold uppercase tracking-wide transition-all duration-300">
                      {mode}
                    </h3>
                  </div>
                  <button 
                    onClick={toggleMode}
                    className="flex items-center gap-2 bg-[var(--background)] px-3 py-1.5 rounded-lg border border-[var(--card-border)] text-[10px] font-bold hover:border-orange-500/50 transition-all active:scale-95 disabled:opacity-50 shadow-sm"
                    disabled={isUpdating}
                  >
                    {isUpdating ? <Loader2 className="w-3 h-3 animate-spin text-orange-500" /> : <Activity className="w-3 h-3 text-orange-500" />}
                    CHANGE MODE
                  </button>
                </div>

                <div 
                  className="min-h-[140px] flex items-center justify-center cursor-pointer"
                  onClick={toggleMode}
                >
                  {initialLoading ? (
                    <LoadingSpinner />
                  ) : error ? (
                    <div className="text-red-400 flex flex-col items-center gap-2">
                      <AlertCircle className="w-6 h-6" />
                      <p className="text-xs">{error}</p>
                    </div>
                  ) : (
                    <div className={`space-y-2 text-center transition-all duration-500 ${isUpdating ? "opacity-40 scale-95 blur-[1px]" : "opacity-100 scale-100"}`}>
                      <div className="flex items-baseline justify-center gap-3">
                        <span className="text-8xl font-black tracking-tighter tabular-nums text-[var(--foreground)]">
                          {feeData?.feerate_sat_per_vb ? feeData.feerate_sat_per_vb.toFixed(1) : "---"}
                        </span>
                        <span className="text-2xl font-bold text-[var(--muted)]">sat/vB</span>
                      </div>
                      <p className="text-[10px] text-[var(--muted)] font-mono uppercase tracking-[0.2em]">
                        Confirmation within {target} blocks
                      </p>
                    </div>
                  )}
                </div>
              </div>
              
              {/* Mode Dots */}
              <div className="mt-4 flex justify-center gap-1.5">
                <div className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${mode === "economical" ? "bg-orange-500 w-4" : "bg-[var(--card-border)]"}`}></div>
                <div className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${mode === "conservative" ? "bg-orange-500 w-4" : "bg-[var(--card-border)]"}`}></div>
              </div>
            </div>

            {/* Horizontal Mempool Health */}
            <div className="w-full text-left">
              <div className="flex items-center justify-between mb-6 px-4">
                <div className="flex items-center gap-2 text-[var(--muted)] font-mono">
                  <BarChart2 className="w-4 h-4 text-orange-500" />
                  <span className="text-[10px] font-bold uppercase tracking-widest">Mempool Health</span>
                </div>
                <div className="flex gap-2">
                  <button 
                    onClick={() => scroll('left')}
                    className="w-8 h-8 rounded-full border border-[var(--card-border)] flex items-center justify-center hover:bg-[var(--card)] transition-colors active:scale-90"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={() => scroll('right')}
                    className="w-8 h-8 rounded-full border border-[var(--card-border)] flex items-center justify-center hover:bg-[var(--card)] transition-colors active:scale-90"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div 
                ref={scrollRef}
                className="flex overflow-x-auto gap-4 pb-8 px-4 snap-x snap-proximity no-scrollbar custom-scrollbar"
              >
                {initialLoading ? (
                  Array(4).fill(0).map((_, i) => (
                    <div key={i} className="min-w-[300px] h-36 bg-[var(--card)] rounded-2xl animate-pulse border border-[var(--card-border)]"></div>
                  ))
                ) : (
                  <>
                    {feeData?.mempool_health_statistics?.map((stat: any, i: number) => (
                      <HealthBlock key={i} stat={stat} />
                    ))}
                    {!feeData?.mempool_health_statistics?.length && (
                      <div className="w-full py-16 text-center text-[var(--muted)] text-sm bg-[var(--card)] rounded-2xl border border-[var(--card-border)]">
                        Mempool metrics unavailable for this node.
                      </div>
                    )}
                  </>
                )}
              </div>
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

function HealthBlock({ stat }: { stat: MempoolHealthStats }) {
  const ratioPerc = (stat.ratio * 100).toFixed(1);
  const color = stat.ratio > 0.95 ? "bg-green-500" : stat.ratio > 0.7 ? "bg-orange-500" : "bg-red-500";
  
  return (
    <div className="min-w-[300px] p-6 bg-[var(--card)] rounded-2xl border border-[var(--card-border)] snap-start hover:border-orange-500/30 transition-all shadow-sm">
      <div className="flex justify-between items-center mb-5 text-left">
        <span className="text-[11px] font-mono text-[var(--muted)] font-bold uppercase">Block {stat.block_height}</span>
        <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${color} text-white shadow-sm`}>
          {ratioPerc}%
        </span>
      </div>
      
      <div className="space-y-4">
        <div className="space-y-1.5">
          <div className="flex justify-between text-[10px] uppercase font-bold text-[var(--muted)]">
            <span>Block</span>
            <span className="text-[var(--foreground)]">{(stat.block_weight / 1000).toFixed(0)} kWU</span>
          </div>
          <div className="w-full bg-[var(--background)] h-2 rounded-full overflow-hidden border border-[var(--card-border)]">
            <div className="bg-[var(--muted)] opacity-20 h-full" style={{ width: `${Math.min(100, (stat.block_weight / 4000000) * 100)}%` }}></div>
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex justify-between text-[10px] uppercase font-bold text-[var(--muted)]">
            <span>Mempool</span>
            <span className="text-[var(--foreground)]">{(stat.mempool_txs_weight / 1000).toFixed(0)} kWU</span>
          </div>
          <div className="w-full bg-[var(--background)] h-2 rounded-full overflow-hidden border border-[var(--card-border)]">
            <div className={`${color} h-full`} style={{ width: `${Math.min(100, (stat.mempool_txs_weight / 4000000) * 100)}%` }}></div>
          </div>
        </div>
      </div>
    </div>
  );
}

function LoadingSpinner() {
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="w-10 h-10 border-2 border-[var(--card-border)] border-t-orange-500 rounded-full animate-spin"></div>
      <span className="text-[10px] font-mono uppercase text-[var(--muted)] animate-pulse tracking-widest">Estimating...</span>
    </div>
  );
}

function RateDetail({ label, value }: any) {
  return (
    <div className="text-center p-3 bg-[var(--background)] rounded-xl border border-[var(--card-border)] shadow-sm">
      <div className="text-[9px] text-[var(--muted)] mb-1 uppercase font-bold tracking-widest">{label}</div>
      <div className="text-sm font-bold">{value}</div>
    </div>
  );
}
