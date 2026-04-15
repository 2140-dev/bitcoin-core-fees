import { api } from "../services/api";
import { PerformanceData, AnalyticsSummary } from "../types/api";

export interface StatsSnapshot {
  performanceData: PerformanceData;
  summary: AnalyticsSummary | null;
  startBlock: number;
  endBlock: number;
}

const TARGETS = [2, 7, 144];
const _cache = new Map<string, StatsSnapshot>();
// 3 targets × at most 10 chains — evict oldest entry if exceeded.
const MAX_CACHE_SIZE = 30;

function cacheKey(chain: string, target: number): string {
  return `${chain}:${target}`;
}

export const statsCache = {
  get(chain: string, target: number): StatsSnapshot | null {
    return _cache.get(cacheKey(chain, target)) ?? null;
  },
  set(chain: string, target: number, data: StatsSnapshot): void {
    if (_cache.size >= MAX_CACHE_SIZE) {
      const oldest = _cache.keys().next().value;
      if (oldest !== undefined) _cache.delete(oldest);
    }
    _cache.set(cacheKey(chain, target), data);
  },
};

/**
 * Fetch all three targets in parallel for the given chain and populate
 * the cache. Fire-and-forget safe — errors are swallowed per target.
 */
export async function prefetchStats(chain: string): Promise<void> {
  try {
    const { blockcount } = await api.getBlockCount(chain);
    const startBlock = blockcount - 1000;
    const endBlock = blockcount;

    await Promise.all(
      TARGETS.map(async (target) => {
        try {
          const [pData, fSum] = await Promise.all([
            api.getPerformanceData(startBlock, 1000, target, chain),
            api.getFeesSum(startBlock, target, chain),
          ]);
          statsCache.set(chain, target, {
            performanceData: pData,
            summary: fSum,
            startBlock,
            endBlock,
          });
        } catch {
          // per-target failure doesn't block the others
        }
      })
    );
  } catch {
    // ignore if block count fails
  }
}
