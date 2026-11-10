import { ArrowRight, RefreshCw } from "lucide-react";

interface Props {
  startBlock: number | null;
  endBlock: number | null;
  onStartChange: (v: number) => void;
  onEndChange: (v: number) => void;
  onApply: () => void;
  onSyncLatest: () => void;
  loading: boolean;
}

/** Start/end block range editor + SYNC, shared by the History chart and the range summary. */
export default function RangeControls({ startBlock, endBlock, onStartChange, onEndChange, onApply, onSyncLatest, loading }: Props) {
  return (
    <div className="flex items-center gap-2 bg-[var(--card)] p-1.5 rounded-xl border border-[var(--card-border)] shadow-md">
      <div className="flex items-center gap-3 px-3">
        <div className="flex flex-col">
          <span className="text-[8px] uppercase font-black text-[var(--muted)] tracking-tighter">Start</span>
          <input
            type="number"
            value={startBlock ?? ""}
            onChange={(e) => onStartChange(Number(e.target.value))}
            className="bg-transparent border-none focus:ring-0 text-sm w-20 p-0 outline-none font-mono font-black"
          />
        </div>
        <ArrowRight className="w-3 h-3 text-[var(--muted)] opacity-30" />
        <div className="flex flex-col">
          <span className="text-[8px] uppercase font-black text-[var(--muted)] tracking-tighter">End</span>
          <input
            type="number"
            value={endBlock ?? ""}
            onChange={(e) => onEndChange(Number(e.target.value))}
            className="bg-transparent border-none focus:ring-0 text-sm w-20 p-0 outline-none font-mono font-black"
          />
        </div>
      </div>
      <button
        onClick={onApply}
        disabled={loading}
        className="bg-[var(--foreground)] text-[var(--background)] px-5 py-2.5 rounded-lg font-black text-[10px] transition-all disabled:opacity-50 hover:opacity-90 active:scale-95 tracking-[0.1em]"
      >
        {loading ? "..." : "SYNC"}
      </button>
      <button
        onClick={onSyncLatest}
        title="Sync to Latest Block"
        className="p-2 rounded-lg hover:bg-[var(--background)] transition-colors text-orange-500"
      >
        <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
      </button>
    </div>
  );
}
