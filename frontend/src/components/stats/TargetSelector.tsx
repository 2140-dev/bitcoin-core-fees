const TARGETS = [2, 7, 144] as const;
const LABEL: Record<number, string> = { 2: "NextB", 7: "7B", 144: "1 Day" };

interface Props {
  target: number;
  onChange: (t: number) => void;
}

/** Confirmation-target selector (2 / 7 / 144), shared by the History and Accuracy pages. */
export default function TargetSelector({ target, onChange }: Props) {
  return (
    <div className="flex items-center gap-1 bg-[var(--card)] p-1 rounded-xl border border-[var(--card-border)] shadow-sm">
      {TARGETS.map((t) => (
        <button
          key={t}
          onClick={() => onChange(t)}
          className={`px-5 py-2 rounded-lg text-xs font-bold transition-all ${
            target === t ? "bg-[#F7931A] text-white shadow-md shadow-orange-500/20" : "text-[var(--muted)] hover:text-[var(--foreground)]"
          }`}
        >
          {LABEL[t]}
        </button>
      ))}
    </div>
  );
}
