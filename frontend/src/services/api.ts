import {
  AnalyticsSummary,
  BlockStatsMap,
  FeesStatsMap,
  BlockchainInfo,
  FeeEstimateResponse,
  NetworkInfo,
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
  private baseUrl: string;
  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl ?? API_BASE_PATH;
    console.debug(`[API Service] Using relative proxy path: ${this.baseUrl}`);
  }

  private async fetchJson<T>(path: string, options?: RequestInit): Promise<T> {
    const cleanPath = path.replace(/^\/+/, "").replace(/\/+$/, "");
    const base = this.baseUrl.replace(/\/+$/, "");
    const url = `${base}/${cleanPath}`;
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

  private chainParam(chain?: string, existingParams?: string): string {
    if (!chain) return existingParams ? `?${existingParams}` : "";
    const sep = existingParams ? "&" : "";
    return `?${existingParams || ""}${sep}chain=${chain}`;
  }

  async getNetworks(): Promise<NetworkInfo[]> {
    return this.fetchJson<NetworkInfo[]>("networks");
  }

  async getFeeEstimate(target: number = 2, mode: string = "economical", level: number = 2, chain?: string): Promise<FeeEstimateResponse> {
    const q = chain ? `?chain=${chain}` : "";
    return this.fetchJson<FeeEstimateResponse>(`fees/${target}/${mode}/${level}${q}`);
  }

  async getBlockCount(chain?: string): Promise<BlockchainInfo> {
    const q = chain ? `?chain=${chain}` : "";
    return this.fetchJson<BlockchainInfo>(`blockcount${q}`);
  }

  async getPerformanceData(startBlock: number, count: number = 100, target: number = 2, chain?: string): Promise<any> {
    const params = `target=${target}&count=${count}${chain ? `&chain=${chain}` : ""}`;
    return this.fetchJson<any>(`performance-data/${startBlock}/?${params}`);
  }

  async getFeesSum(startBlock: number, target: number = 2, chain?: string): Promise<AnalyticsSummary> {
    const params = `target=${target}${chain ? `&chain=${chain}` : ""}`;
    return this.fetchJson<AnalyticsSummary>(`fees-sum/${startBlock}?${params}`);
  }

  async getMempoolDiagram(chain?: string): Promise<MempoolDiagramResponse> {
    const q = chain ? `?chain=${chain}` : "";
    return this.fetchJson<MempoolDiagramResponse>(`mempool-diagram${q}`);
  }
}

export const api = new BitcoinCoreAPI();
