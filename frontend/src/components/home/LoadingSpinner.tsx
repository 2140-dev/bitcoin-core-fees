export default function LoadingSpinner() {
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="w-8 h-8 border-2 border-[var(--card-border)] border-t-orange-500 rounded-full animate-spin" />
      <span className="text-[10px] font-mono uppercase text-[var(--muted)] animate-pulse tracking-widest">Estimating...</span>
    </div>
  );
}
