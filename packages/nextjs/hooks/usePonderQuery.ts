"use client";

import { useQuery } from "@tanstack/react-query";
import { invalidatePonderCache, isPonderAvailable } from "~~/services/ponder/client";

interface UsePonderQueryOptions<TPonder, TRpc> {
  queryKey: readonly unknown[];
  /** Fetch data from Ponder API */
  ponderFn: () => Promise<TPonder>;
  /** Fetch data from RPC as fallback */
  rpcFn: () => Promise<TRpc>;
  /** Whether the RPC fallback is allowed */
  rpcEnabled?: boolean;
  /** Whether the query is enabled */
  enabled?: boolean;
  /** How long data stays fresh (ms) */
  staleTime?: number;
  /** Auto-refetch interval (ms). Set to false to disable. */
  refetchInterval?: number | false;
}

export interface PonderQueryResult<T> {
  data: T;
  source: "ponder" | "rpc";
}

/**
 * Hook that tries Ponder API first, falling back to RPC if unavailable.
 *
 * Usage:
 * ```ts
 * const { data } = usePonderQuery({
 *   queryKey: ["contentFeed"],
 *   ponderFn: () => ponderApi.getContent(),
 *   rpcFn: () => fetchContentFromRpc(),
 * });
 * // data.data = the actual data
 * // data.source = "ponder" | "rpc"
 * ```
 */
export function usePonderQuery<TPonder, TRpc>({
  queryKey,
  ponderFn,
  rpcFn,
  rpcEnabled = true,
  enabled = true,
  staleTime = 10_000,
  refetchInterval = false,
}: UsePonderQueryOptions<TPonder, TRpc>) {
  return useQuery({
    queryKey: ["ponder-fallback", ...queryKey],
    queryFn: async (): Promise<PonderQueryResult<TPonder | TRpc>> => {
      const available = await isPonderAvailable();

      if (available) {
        try {
          const data = await ponderFn();
          return { data, source: "ponder" };
        } catch (e) {
          if (process.env.NODE_ENV !== "production") {
            console.warn("[Ponder] Query failed, falling back to RPC:", e);
          }
          // Invalidate cache so next query re-checks availability
          invalidatePonderCache();
        }
      }

      if (!rpcEnabled) {
        throw new Error("Ponder is unavailable and RPC fallback is disabled.");
      }

      const data = await rpcFn();
      return { data, source: "rpc" };
    },
    enabled,
    staleTime,
    refetchInterval,
  });
}
