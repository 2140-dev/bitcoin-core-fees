"use client";

import { useState, useRef, useEffect } from "react";
import { useNetwork } from "../../context/NetworkContext";
import { ChevronDown } from "lucide-react";

const CHAIN_STYLES: Record<string, { bg: string; text: string; dot: string; border: string }> = {
  main:     { bg: "bg-orange-500/10", text: "text-orange-500", dot: "bg-orange-500", border: "border-orange-500/30" },
  test:     { bg: "bg-green-500/10",  text: "text-green-500",  dot: "bg-green-500",  border: "border-green-500/30" },
  testnet4: { bg: "bg-teal-500/10",   text: "text-teal-500",   dot: "bg-teal-500",   border: "border-teal-500/30" },
  signet:   { bg: "bg-purple-500/10", text: "text-purple-500", dot: "bg-purple-500", border: "border-purple-500/30" },
  regtest:  { bg: "bg-blue-500/10",   text: "text-blue-500",   dot: "bg-blue-500",   border: "border-blue-500/30" },
};

const DEFAULT_STYLE = { bg: "bg-gray-500/10", text: "text-gray-400", dot: "bg-gray-400", border: "border-gray-500/30" };

function getStyle(chain: string) {
  return CHAIN_STYLES[chain] ?? DEFAULT_STYLE;
}

interface NetworkSwitcherProps {
  className?: string;
}

export function NetworkBadge({ className = "" }: NetworkSwitcherProps) {
  const { chain, chainDisplay, networks, setChain, loading } = useNetwork();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (loading || networks.length === 0) {
    return (
      <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--card)] border border-[var(--card-border)] text-[var(--muted)] text-xs font-bold ${className}`.trim()}>
        <div className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse" />
        Connecting...
      </div>
    );
  }

  const style = getStyle(chain ?? "main");
  const label = chainDisplay.charAt(0) + chainDisplay.slice(1).toLowerCase();
  const hasMultiple = networks.length > 1;

  return (
    <div ref={ref} className={`relative ${className}`.trim()}>
      <button
        onClick={() => hasMultiple && setOpen((prev) => !prev)}
        className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg ${style.bg} border ${style.border} ${style.text} text-xs font-bold transition-all ${hasMultiple ? "cursor-pointer hover:opacity-80" : "cursor-default"}`}
      >
        <div className={`w-2 h-2 rounded-full ${style.dot} animate-pulse`} />
        {label}
        {hasMultiple && (
          <ChevronDown className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`} />
        )}
      </button>

      {open && hasMultiple && (
        <div className="absolute right-0 top-full mt-2 min-w-[160px] bg-[var(--card)] border border-[var(--card-border)] rounded-xl shadow-xl overflow-hidden z-50">
          {networks.map((n) => {
            const s = getStyle(n.chain);
            const isActive = n.chain === chain;
            const name = n.chain_display.charAt(0) + n.chain_display.slice(1).toLowerCase();
            return (
              <button
                key={n.chain}
                onClick={() => { setChain(n.chain); setOpen(false); }}
                className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-left text-sm font-bold transition-colors ${
                  isActive
                    ? `${s.bg} ${s.text}`
                    : "text-[var(--muted)] hover:bg-[var(--background)] hover:text-[var(--foreground)]"
                }`}
              >
                <div className={`w-2 h-2 rounded-full ${s.dot}`} />
                {name}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
