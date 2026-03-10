"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import { useScaffoldWatchContractEvent } from "~~/hooks/scaffold-eth";
import { useNotificationPreferences } from "~~/hooks/useNotificationPreferences";
import { usePonderQuery } from "~~/hooks/usePonderQuery";
import { useRadarFeed } from "~~/hooks/useRadarFeed";
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
  const radarInitializedRef = useRef(false);
  const seenSettlingDayKeysRef = useRef<Set<string>>(new Set());
  const seenSettlingHourKeysRef = useRef<Set<string>>(new Set());
  const seenFollowedSubmissionKeysRef = useRef<Set<string>>(new Set());
  const seenFollowedResolutionKeysRef = useRef<Set<string>>(new Set());
  const roundResolvedEnabledRef = useRef(true);
  const { watchedContentIds } = useWatchedContent(address);
  const { radar } = useRadarFeed(address);
  const { preferences } = useNotificationPreferences(address);

  useEffect(() => {
    roundResolvedEnabledRef.current = preferences.roundResolved;
  }, [preferences.roundResolved]);

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

  useEffect(() => {
    if (!address) {
      radarInitializedRef.current = false;
      seenSettlingDayKeysRef.current = new Set();
      seenSettlingHourKeysRef.current = new Set();
      seenFollowedSubmissionKeysRef.current = new Set();
      seenFollowedResolutionKeysRef.current = new Set();
      return;
    }

    const openBrowserNotification = (title: string, body: string, href: string) => {
      if (permissionRef.current !== "granted") return;

      try {
        const browserNotification = new Notification(title, {
          body,
          icon: "/logo.svg",
        });

        browserNotification.onclick = () => {
          window.focus();
          window.location.href = href;
          browserNotification.close();
        };
      } catch {
        // Browser may block notifications in some contexts
      }
    };

    const notifyWithLink = (kind: "info" | "success", title: string, body: string, href: string) => {
      const toastBody = (
        <Link href={href} className="font-medium underline">
          {body}
        </Link>
      );

      if (kind === "success") {
        notification.success(toastBody, { duration: 8000 });
      } else {
        notification.info(toastBody, { duration: 8000 });
      }

      openBrowserNotification(title, body, href);
    };

    const nowSeconds = Math.floor(Date.now() / 1000);
    const currentSettlingDayKeys = new Set<string>();
    const currentSettlingHourKeys = new Set<string>();
    const currentSubmissionKeys = new Set<string>();
    const currentResolutionKeys = new Set<string>();

    for (const item of radar.settlingSoon) {
      if (!item.estimatedSettlementTime) continue;

      const secondsUntil = Number(item.estimatedSettlementTime) - nowSeconds;
      const href = `/vote?content=${item.contentId}`;
      const shortGoal = item.goal.length > 72 ? `${item.goal.slice(0, 69)}...` : item.goal;

      if (secondsUntil > 0 && secondsUntil <= 24 * 60 * 60) {
        currentSettlingDayKeys.add(item.id);

        if (
          radarInitializedRef.current &&
          preferences.settlingSoonDay &&
          !seenSettlingDayKeysRef.current.has(item.id)
        ) {
          notifyWithLink("info", "Watched round settling today", `"${shortGoal}" looks likely to settle today.`, href);
        }
      }

      if (secondsUntil > 0 && secondsUntil <= 60 * 60) {
        currentSettlingHourKeys.add(item.id);

        if (
          radarInitializedRef.current &&
          preferences.settlingSoonHour &&
          !seenSettlingHourKeysRef.current.has(item.id)
        ) {
          notifyWithLink("info", "Round settling soon", `"${shortGoal}" looks likely to settle within the hour.`, href);
        }
      }
    }

    for (const item of radar.followedSubmissions) {
      const key = `${item.contentId}-${item.createdAt}`;
      currentSubmissionKeys.add(key);

      if (
        radarInitializedRef.current &&
        preferences.followedSubmission &&
        !seenFollowedSubmissionKeysRef.current.has(key)
      ) {
        const displayName = item.profileName || `${item.submitter.slice(0, 6)}...${item.submitter.slice(-4)}`;
        const shortGoal = item.goal.length > 72 ? `${item.goal.slice(0, 69)}...` : item.goal;
        notifyWithLink(
          "success",
          "Followed curator submitted",
          `${displayName} submitted "${shortGoal}".`,
          `/vote?content=${item.contentId}`,
        );
      }
    }

    for (const item of radar.followedResolutions) {
      const key = `${item.id}-${item.settledAt ?? ""}`;
      currentResolutionKeys.add(key);

      if (
        radarInitializedRef.current &&
        preferences.followedResolution &&
        !seenFollowedResolutionKeysRef.current.has(key)
      ) {
        const displayName = item.profileName || `${item.voter.slice(0, 6)}...${item.voter.slice(-4)}`;
        const shortGoal = item.goal.length > 72 ? `${item.goal.slice(0, 69)}...` : item.goal;
        const action = item.outcome === "won" ? "won" : item.outcome === "lost" ? "lost" : "resolved";

        notifyWithLink(
          "success",
          "Followed curator resolved",
          `${displayName} ${action} a call on "${shortGoal}".`,
          `/vote?content=${item.contentId}`,
        );
      }
    }

    if (!radarInitializedRef.current) {
      radarInitializedRef.current = true;
    }

    seenSettlingDayKeysRef.current = new Set([...seenSettlingDayKeysRef.current, ...currentSettlingDayKeys]);
    seenSettlingHourKeysRef.current = new Set([...seenSettlingHourKeysRef.current, ...currentSettlingHourKeys]);
    seenFollowedSubmissionKeysRef.current = new Set([
      ...seenFollowedSubmissionKeysRef.current,
      ...currentSubmissionKeys,
    ]);
    seenFollowedResolutionKeysRef.current = new Set([
      ...seenFollowedResolutionKeysRef.current,
      ...currentResolutionKeys,
    ]);
  }, [address, preferences, radar]);

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
        if (!roundResolvedEnabledRef.current) continue;

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
            const browserNotification = new Notification(title, {
              body,
              icon: "/logo.svg",
            });
            browserNotification.onclick = () => {
              window.focus();
              window.location.href = `/vote?content=${contentId}`;
              browserNotification.close();
            };
          } catch {
            // Browser may block notifications in some contexts
          }
        }
      }
    },
  } as any);

  return null;
}
