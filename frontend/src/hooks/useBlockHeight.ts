import { useState, useCallback } from "react";
import { api } from "../services/api";

/** Shared current-block-height state + fetcher, used by the chart and summary hooks. */
export function useBlockHeight(chain?: string) {
  const [latestBlock, setLatestBlock] = useState<number | null>(null);

  const syncHeight = useCallback(async () => {
    try {
      const { blockcount } = await api.getBlockCount(chain);
      setLatestBlock(blockcount);
      return blockcount;
    } catch {
      return null;
    }
  }, [chain]);

  return { latestBlock, setLatestBlock, syncHeight };
}
