export interface AnalyticsSummary {
  total: number;
  overpayment_val: number;
  overpayment_perc: number;
  underpayment_val: number;
  underpayment_perc: number;
  within_val: number;
  within_perc: number;
}

export interface BlockStats {
  height: number;
  min: number | null;
  max: number | null;
  estimated: number | null;
  actual: number | null;
}

export type BlockStatsMap = Record<string, [number, number]>;
export type FeesStatsMap = Record<string, number[]>;

export interface BlockchainInfo {
  blockcount: number;
}

export interface MempoolHealthStats {
  block_height: number;
  block_weight: number;
  mempool_txs_weight: number;
  ratio: number;
}

export interface FeeEstimateResponse {
  feerate: number;
  blocks: number;
  errors?: string[];
  mempool_health_statistics?: MempoolHealthStats[];
}
