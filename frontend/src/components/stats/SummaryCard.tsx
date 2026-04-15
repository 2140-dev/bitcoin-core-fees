import { ReactNode } from "react";

interface Props {
  title: string;
  value: number | undefined;
  percent: number | undefined;
  icon: ReactNode;
  colorClass: string;
  bgColorClass: string;
  total: number | undefined;
}

export default function SummaryCard({ title, value, percent, icon, colorClass, bgColorClass, total }: Props) {
  return (
    <div className="bg-[var(--card)] p-8 rounded-3xl border border-[var(--card-border)] shadow-sm group hover:shadow-md transition-all text-left">
      <div className="flex justify-between items-start mb-6">
        <div className={`p-3.5 ${bgColorClass} rounded-2xl shadow-inner`}>{icon}</div>
        <div className="text-right">
          <span className={`text-3xl font-black tabular-nums font-mono tracking-tight ${colorClass}`}>
            {percent !== undefined ? (percent * 100).toFixed(1) : "0"}%
          </span>
        </div>
      </div>
      <h3 className="text-[var(--muted)] text-[11px] font-semibold uppercase tracking-widest">{title}</h3>
      <p className="text-xl font-semibold mt-1 font-mono tabular-nums">
        {value || 0} <span className="text-[var(--muted)] font-normal">/ {total || 0}</span>
        <span className="text-xs font-normal text-[var(--muted)] ml-1">estimates</span>
      </p>
    </div>
  );
}
