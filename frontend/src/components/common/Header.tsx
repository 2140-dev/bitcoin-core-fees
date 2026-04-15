"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NetworkBadge } from "./NetworkBadge";
import { useNetwork } from "../../context/NetworkContext";

const NAV_STYLES: Record<string, string> = {
  main:     "bg-orange-500 shadow-orange-500/20",
  test:     "bg-green-500 shadow-green-500/20",
  testnet4: "bg-teal-500 shadow-teal-500/20",
  signet:   "bg-purple-500 shadow-purple-500/20",
  regtest:  "bg-blue-500 shadow-blue-500/20",
};

export function Header() {
  const pathname = usePathname();
  const { chain } = useNetwork();
  
  const activeStyle = (chain && NAV_STYLES[chain]) || "bg-[#F7931A] shadow-orange-500/20";

  return (
    <nav className="border-b border-[var(--card-border)] bg-[var(--card)]/50 backdrop-blur-md sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 min-h-16 py-3 flex flex-wrap justify-between items-center gap-x-4 gap-y-2">
        <Link href="/" className="flex flex-col group">
          <span className="font-black text-xl md:text-2xl tracking-tight leading-tight">
            Bitcoin Core <span className="text-[#F7931A]">FeeRate</span>
          </span>
          <span className="text-[10px] font-mono text-[var(--muted)] uppercase tracking-[0.3em] font-bold">
            Estimator
          </span>
        </Link>

        <div className="flex items-center gap-2 md:gap-4">
          <div className="flex gap-1 md:gap-2 bg-[var(--background)] p-1 rounded-xl border border-[var(--card-border)] shadow-sm">
            <Link
              href="/"
              className={`px-2.5 md:px-4 py-1.5 rounded-lg text-[10px] md:text-xs font-black transition-all ${
                pathname === "/" ? `${activeStyle} text-white shadow-md` : "text-[var(--muted)] hover:text-[var(--foreground)]"
              }`}
            >
              Dashboard
            </Link>
            <Link
              href="/stats"
              className={`px-2.5 md:px-4 py-1.5 rounded-lg text-[10px] md:text-xs font-black transition-all ${
                pathname === "/stats" ? `${activeStyle} text-white shadow-md` : "text-[var(--muted)] hover:text-[var(--foreground)]"
              }`}
            >
              Analytics
            </Link>
            <Link
              href="/mempool"
              className={`px-2.5 md:px-4 py-1.5 rounded-lg text-[10px] md:text-xs font-black transition-all ${
                pathname === "/mempool" ? `${activeStyle} text-white shadow-md` : "text-[var(--muted)] hover:text-[var(--foreground)]"
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
