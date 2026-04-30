export interface AnalyticsSummary {
  total: number;
  overpayment_val: number;
  overpayment_perc: number;
  underpayment_val: number;
  underpayment_perc: number;
  within_val: number;
  within_perc: number;
}

export interface BlockchainInfo {
  blockcount: number;
  chain?: string;        // "main" | "test" | "signet" | "regtest"
  chain_display?: string; // "MAINNET" | "TESTNET" | "SIGNET" | "REGTEST"
}

export interface MempoolHealthStats {
  block_height: number;
  block_weight: number;
  mempool_txs_weight: number;
  ratio: number;
}

export interface FeeEstimateResponse {
  /** Raw feerate in BTC/kvB as returned by Bitcoin Core. */
  feerate: number;
  /** Feerate converted to sat/vB (feerate × 100,000). */
  feerate_sat_per_vb: number;
  /** Actual confirmation target used by the node (may differ from requested). */
  blocks: number;
  errors?: string[];
  /** Chain name ("main" | "test" | "testnet4" | "signet" | "regtest"). */
  chain: string;
  /** The estimator used (only present when block_policy_only=false). */
  estimator?: string;
}

export interface NetworkInfo {
  chain: string;
  chain_display: string;
}

export interface MempoolDiagramPoint {
  weight: number;
  fee: number;
}

export interface MempoolDiagramResponse {
  raw: MempoolDiagramPoint[];
  windows: Record<string, Record<string, number>>;
  total_weight: number;
  total_fee: number;
}

export interface PerformanceDataBlock {
  height: number;
  low: number;
  high: number;
}

export interface PerformanceDataEstimate {
  height: number;
  rate: number;
}

export interface PerformanceData {
  blocks: PerformanceDataBlock[];
  estimates: PerformanceDataEstimate[];
}
