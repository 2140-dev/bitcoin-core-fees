"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NetworkBadge } from "./NetworkBadge";

export function Header() {
  const pathname = usePathname();

  return (
    <nav className="border-b border-[var(--card-border)] bg-[var(--card)]/50 backdrop-blur-md sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 h-20 flex justify-between items-center">
        <Link href="/" className="flex flex-col group">
          <span className="font-black text-xl md:text-2xl tracking-tight leading-tight">
            Bitcoin Core <span className="text-[#F7931A]">FeeRate</span>
          </span>
          <span className="text-[10px] font-mono text-[var(--muted)] uppercase tracking-[0.3em] font-bold">
            Estimator
          </span>
        </Link>
        
        <div className="flex items-center gap-4">
          <div className="flex gap-2 bg-[var(--background)] p-1.5 rounded-xl border border-[var(--card-border)] shadow-sm">
            <Link 
              href="/" 
              className={`px-4 py-1.5 rounded-lg text-xs font-black transition-all ${
                pathname === "/" ? "bg-[#F7931A] text-white shadow-md shadow-orange-500/20" : "text-[var(--muted)] hover:text-[var(--foreground)]"
              }`}
            >
              Dashboard
            </Link>
            <Link 
              href="/stats" 
              className={`px-4 py-1.5 rounded-lg text-xs font-black transition-all ${
                pathname === "/stats" ? "bg-[#F7931A] text-white shadow-md shadow-orange-500/20" : "text-[var(--muted)] hover:text-[var(--foreground)]"
              }`}
            >
              Analytics
            </Link>
            <Link 
              href="/mempool" 
              className={`px-4 py-1.5 rounded-lg text-xs font-black transition-all ${
                pathname === "/mempool" ? "bg-[#F7931A] text-white shadow-md shadow-orange-500/20" : "text-[var(--muted)] hover:text-[var(--foreground)]"
              }`}
            >
              Mempool
            </Link>
          </div>
          <NetworkBadge />
        </div>
      </div>
    </nav>
  );
}
