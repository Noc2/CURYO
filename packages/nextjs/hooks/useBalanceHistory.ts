"use client";

import { usePonderQuery } from "~~/hooks/usePonderQuery";
import { PonderTokenTransfer, ponderApi } from "~~/services/ponder/client";

const EMPTY: PonderTokenTransfer[] = [];

/**
 * Hook that returns cREP transfer history for a given address.
 * Uses Ponder API (no RPC fallback — on-chain Transfer event scanning is too expensive).
 */
export function useBalanceHistory(address?: string) {
  const { data: result, ...rest } = usePonderQuery({
    queryKey: ["balanceHistory", address],
    ponderFn: async () => {
      if (!address) return EMPTY;
      const data = await ponderApi.getBalanceHistory(address);
      return data.transfers;
    },
    rpcFn: async () => EMPTY,
    enabled: !!address,
    staleTime: 30_000,
  });

  return { transfers: result?.data ?? EMPTY, source: result?.source, ...rest };
}
