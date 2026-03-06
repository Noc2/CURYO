"use client";

import { useEffect, useRef, useState } from "react";
import { useAccount } from "wagmi";
import { useScaffoldWatchContractEvent } from "~~/hooks/scaffold-eth";
import { usePonderQuery } from "~~/hooks/usePonderQuery";
import { useWatchedContent } from "~~/hooks/useWatchedContent";
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
  const activeKeysRef = useRef<Set<string>>(new Set());
  const watchedContentIdsRef = useRef<Set<string>>(new Set());
  const seenSettlementKeysRef = useRef<Set<string>>(new Set());
  const { watchedContentIds } = useWatchedContent(address);

  // Request notification permission on mount (only if connected)
  useEffect(() => {
    if (!address) return;
    if (typeof window === "undefined" || !("Notification" in window)) return;

    permissionRef.current = Notification.permission;
    if (Notification.permission === "default") {
      Notification.requestPermission()
        .then(perm => {
          permissionRef.current = perm;
        })
        .catch(() => {
          // Browser blocked permission request
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

  useEffect(() => {
    activeKeysRef.current = activeKeys;
  }, [activeKeys]);

  useEffect(() => {
    watchedContentIdsRef.current = watchedContentIds;
  }, [watchedContentIds]);

  // Watch for RoundSettled events
  useScaffoldWatchContractEvent({
    contractName: "RoundVotingEngine" as any,
    eventName: "RoundSettled" as any,
    onLogs: (logs: any[]) => {
      for (const log of logs) {
        const args = log.args as { contentId?: bigint; roundId?: bigint };
        if (args.contentId === undefined || args.roundId === undefined) continue;

        const contentId = args.contentId.toString();
        const key = `${args.contentId.toString()}-${args.roundId.toString()}`;
        if (seenSettlementKeysRef.current.has(key)) continue;

        const votedRound = activeKeysRef.current.has(key);
        const watchedContent = watchedContentIdsRef.current.has(contentId);
        if (!votedRound && !watchedContent) continue;

        seenSettlementKeysRef.current.add(key);

        if (votedRound) {
          // Remove from set to avoid duplicate notifications for voted rounds
          setActiveKeys(prev => {
            const next = new Set(prev);
            next.delete(key);
            return next;
          });
        }

        const title = votedRound ? "Round Resolved!" : "Watched Content Resolved!";
        const body = votedRound
          ? `Content #${contentId} round resolved. Check your portfolio to claim rewards.`
          : `Content #${contentId} just resolved. Open Curyo to see the latest result.`;

        // In-app toast (always fires)
        notification.success(
          votedRound
            ? `Round resolved! Content #${contentId} round #${args.roundId.toString()}. Check your portfolio to claim rewards.`
            : `Watched content resolved! Content #${contentId} round #${args.roundId.toString()} is ready to review.`,
          { duration: 8000 },
        );

        // Browser notification (only if permitted)
        if (permissionRef.current === "granted") {
          try {
            new Notification(title, {
              body,
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
