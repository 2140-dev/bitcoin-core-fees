// Shared metadata for the fee-estimate series plotted on the History chart and
// listed in its legend. Keys match the backend's performance-data `series`.
export interface FeeSeriesMeta {
  key: string;
  label: string;
  color: string;
}

export const FEE_SERIES: FeeSeriesMeta[] = [
  { key: "mempool_policy_economical", label: "mempool · econ", color: "#3b82f6" },
  { key: "block_policy_economical", label: "block_policy · econ", color: "#d97706" },
  { key: "mempool_policy_conservative", label: "mempool · cons", color: "#22c55e" },
  { key: "block_policy_conservative", label: "block_policy · cons", color: "#a855f7" },
];

export const FEE_SERIES_BY_KEY: Record<string, FeeSeriesMeta> = Object.fromEntries(
  FEE_SERIES.map((s) => [s.key, s]),
);
