import { MempoolHealthStats } from "../../types/api";

interface Props {
  stat: MempoolHealthStats;
}

export default function HealthBlock({ stat }: Props) {
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
