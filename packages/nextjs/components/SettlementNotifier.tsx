"use client";

import { useEffect, useRef, useState } from "react";
import { useAccount } from "wagmi";
import { useScaffoldWatchContractEvent } from "~~/hooks/scaffold-eth";
import { usePonderQuery } from "~~/hooks/usePonderQuery";
import { ponderApi } from "~~/services/ponder/client";
import { notification } from "~~/utils/scaffold-eth";

/**
 * Headless component that fires browser notifications + in-app toasts
 * when a round the connected user voted on gets settled.
 */
export function SettlementNotifier() {
  const { address } = useAccount();
  const [activeKeys, setActiveKeys] = useState<Set<string>>(new Set());
  const permissionRef = useRef<NotificationPermission>("default");

  // Request notification permission on mount (only if connected)
  useEffect(() => {
    if (!address) return;
    if (typeof window === "undefined" || !("Notification" in window)) return;

    permissionRef.current = Notification.permission;
    if (Notification.permission === "default") {
      Notification.requestPermission().then(perm => {
        permissionRef.current = perm;
      });
    }
  }, [address]);

  // Fetch the user's active votes to build the watch set
  const { data: ponderResult } = usePonderQuery({
    queryKey: ["settlementNotifierVotes", address],
    ponderFn: async () => {
      if (!address) return { items: [] };
      return ponderApi.getVotes({ voter: address, state: "0", limit: "200" });
    },
    rpcFn: async () => ({ items: [] }),
    enabled: !!address,
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  // Rebuild the active keys set when votes data changes
  useEffect(() => {
    const items = ponderResult?.data?.items ?? [];
    const keys = new Set(items.map(v => `${v.contentId}-${v.roundId}`));
    setActiveKeys(keys);
  }, [ponderResult]);

  // Watch for RoundSettled events
  useScaffoldWatchContractEvent({
    contractName: "RoundVotingEngine" as any,
    eventName: "RoundSettled" as any,
    onLogs: (logs: any[]) => {
      for (const log of logs) {
        const args = log.args as { contentId?: bigint; roundId?: bigint };
        if (args.contentId === undefined || args.roundId === undefined) continue;

        const key = `${args.contentId.toString()}-${args.roundId.toString()}`;
        if (!activeKeys.has(key)) continue;

        // Remove from set to avoid duplicate notifications
        setActiveKeys(prev => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });

        // In-app toast (always fires)
        notification.success(
          `Round settled! Content #${args.contentId.toString()} round #${args.roundId.toString()}. Check your portfolio to claim rewards.`,
          { duration: 8000 },
        );

        // Browser notification (only if permitted)
        if (permissionRef.current === "granted") {
          try {
            new Notification("Round Settled!", {
              body: `Content #${args.contentId.toString()} round settled. Check your portfolio to claim rewards.`,
              icon: "/logo.svg",
            });
          } catch {
            // Browser may block notifications in some contexts
          }
        }
      }
    },
  } as any);

  return null;
}
