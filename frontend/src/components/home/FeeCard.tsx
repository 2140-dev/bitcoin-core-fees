import { FeeEstimateResponse } from "../../types/api";
import LoadingSpinner from "./LoadingSpinner";

interface Props {
  label: string;
  target: number;
  data: FeeEstimateResponse | undefined;
  loading: boolean;
  updating: boolean;
}

export default function FeeCard({ label, target, data, loading, updating }: Props) {
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
            {data?.estimator && (
              <p className="text-[10px] text-orange-500/70 font-mono mt-1 tracking-widest uppercase">
                {data.estimator}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
