import {
  AnalyticsSummary,
  BlockStatsMap,
  FeesStatsMap,
  BlockchainInfo,
  FeeEstimateResponse,
} from "../types/api";

const API_BASE_PATH = "/api";

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

export class BitcoinCoreAPI {
  private baseUrl: string = API_BASE_PATH;

  constructor() {
    console.debug(`[API Service] Using relative proxy path: ${this.baseUrl}`);
  }

  private async fetchJson<T>(path: string, options?: RequestInit): Promise<T> {
    const cleanPath = path.replace(/^\/+/, "").replace(/\/+$/, "");
    const url = `${this.baseUrl}/${cleanPath}`;
    try {
      const response = await fetch(url, options);
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`API error: status=${response.status} message=${text}`);
      }
      return await response.json() as T;
    } catch (error) {
      console.error(`[API Service] Failed to fetch: ${url}`, error);
      throw error;
    }
  }

  async getFeeEstimate(target: number = 2, mode: string = "economical", level: number = 2): Promise<FeeEstimateResponse> {
    return this.fetchJson<FeeEstimateResponse>(`fees/${target}/${mode}/${level}`);
  }

  async getBlockCount(): Promise<BlockchainInfo> {
    return this.fetchJson<BlockchainInfo>(`blockcount`);
  }

  async getPerformanceData(startBlock: number, count: number = 100, target: number = 2): Promise<any> {
    return this.fetchJson<any>(`performance-data/${startBlock}/?target=${target}&count=${count}`);
  }

  async getFeesSum(startBlock: number, target: number = 2): Promise<AnalyticsSummary> {
    return this.fetchJson<AnalyticsSummary>(`fees-sum/${startBlock}?target=${target}`);
  }

  async getMempoolDiagram(): Promise<MempoolDiagramResponse> {
    return this.fetchJson<MempoolDiagramResponse>(`mempool-diagram`);
  }
}

export const api = new BitcoinCoreAPI();
