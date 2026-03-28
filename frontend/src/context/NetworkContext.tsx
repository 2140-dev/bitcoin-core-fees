"use client";

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { api } from "../services/api";
import { NetworkInfo } from "../types/api";

interface NetworkContextValue {
  chain: string | undefined;
  chainDisplay: string;
  networks: NetworkInfo[];
  setChain: (chain: string) => void;
  loading: boolean;
}

const NetworkContext = createContext<NetworkContextValue>({
  chain: undefined,
  chainDisplay: "MAINNET",
  networks: [],
  setChain: () => {},
  loading: true,
});

export function NetworkProvider({ children }: { children: ReactNode }) {
  const [networks, setNetworks] = useState<NetworkInfo[]>([]);
  const [chain, setChain] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getNetworks()
      .then((nets) => {
        setNetworks(nets);
        if (nets.length > 0 && !chain) {
          setChain(nets[0].chain);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const chainDisplay = networks.find((n) => n.chain === chain)?.chain_display ?? "MAINNET";

  return (
    <NetworkContext.Provider value={{ chain, chainDisplay, networks, setChain, loading }}>
      {children}
    </NetworkContext.Provider>
  );
}

export function useNetwork() {
  return useContext(NetworkContext);
}
