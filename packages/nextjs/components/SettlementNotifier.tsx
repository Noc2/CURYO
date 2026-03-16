"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import { useScaffoldWatchContractEvent } from "~~/hooks/scaffold-eth";
import { useDiscoverSignals } from "~~/hooks/useDiscoverSignals";
import { useFollowedProfiles } from "~~/hooks/useFollowedProfiles";
import { useNotificationPreferences } from "~~/hooks/useNotificationPreferences";
import { useRecentUserVotes } from "~~/hooks/useRecentUserVotes";
import { useWatchedContent } from "~~/hooks/useWatchedContent";
import { pickSettlingSoonNotification } from "~~/lib/notifications/settlingSoon";
import { notification } from "~~/utils/scaffold-eth";

const GOVERNANCE_REWARDS_HREF = "/governance";

/**
 * Headless component that fires browser notifications + in-app toasts for
 * tracked round resolutions, settling-soon reminders, and followed-curator activity.
 */
export function SettlementNotifier() {
  const { address } = useAccount();
  const [activeKeys, setActiveKeys] = useState<Set<string>>(new Set());
  const permissionRef = useRef<NotificationPermission>("default");
  const activeKeysRef = useRef<Set<string>>(new Set());
  const watchedContentIdsRef = useRef<Set<string>>(new Set());
  const seenSettlementKeysRef = useRef<Set<string>>(new Set());
  const discoverSignalsInitializedRef = useRef(false);
  const seenSettlingDayKeysRef = useRef<Set<string>>(new Set());
  const seenSettlingHourKeysRef = useRef<Set<string>>(new Set());
  const seenFollowedSubmissionKeysRef = useRef<Set<string>>(new Set());
  const seenFollowedResolutionKeysRef = useRef<Set<string>>(new Set());
  const roundResolvedEnabledRef = useRef(true);
  const { watchedItems, watchedContentIds } = useWatchedContent(address, { autoRead: false });
  const { followedItems } = useFollowedProfiles(address, { autoRead: false });
  const { discoverSignals } = useDiscoverSignals(address, { watchedItems, followedItems });
  const { preferences } = useNotificationPreferences(address, { autoRead: false });

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

  const { openVotes } = useRecentUserVotes(address);

  // Rebuild the active keys set when votes data changes
  useEffect(() => {
    const keys = new Set(openVotes.map(vote => `${vote.contentId}-${vote.roundId}`));
    setActiveKeys(keys);
  }, [openVotes]);

  useEffect(() => {
    activeKeysRef.current = activeKeys;
  }, [activeKeys]);

  useEffect(() => {
    watchedContentIdsRef.current = watchedContentIds;
  }, [watchedContentIds]);

  useEffect(() => {
    if (!address) {
      discoverSignalsInitializedRef.current = false;
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
          icon: "/favicon.png",
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

    for (const item of discoverSignals.settlingSoon) {
      if (!item.estimatedSettlementTime) continue;

      const secondsUntil = Number(item.estimatedSettlementTime) - nowSeconds;

      if (secondsUntil > 60 * 60 && secondsUntil <= 24 * 60 * 60) {
        currentSettlingDayKeys.add(item.id);
      }

      if (secondsUntil > 0 && secondsUntil <= 60 * 60) {
        currentSettlingHourKeys.add(item.id);
      }
    }

    const settlingSoonNotification = discoverSignalsInitializedRef.current
      ? pickSettlingSoonNotification({
          nowSeconds,
          items: discoverSignals.settlingSoon,
          seenHourIds: seenSettlingHourKeysRef.current,
          seenDayIds: seenSettlingDayKeysRef.current,
          allowHour: preferences.settlingSoonHour,
          allowDay: preferences.settlingSoonDay,
        })
      : null;

    if (settlingSoonNotification) {
      notifyWithLink(
        "info",
        settlingSoonNotification.title,
        settlingSoonNotification.body,
        settlingSoonNotification.href,
      );
      if (settlingSoonNotification.kind === "hour") {
        seenSettlingHourKeysRef.current = new Set([
          ...seenSettlingHourKeysRef.current,
          ...settlingSoonNotification.itemIds,
        ]);
      } else {
        seenSettlingDayKeysRef.current = new Set([
          ...seenSettlingDayKeysRef.current,
          ...settlingSoonNotification.itemIds,
        ]);
      }
    }

    for (const item of discoverSignals.followedSubmissions) {
      const key = `${item.contentId}-${item.createdAt}`;
      currentSubmissionKeys.add(key);

      if (
        discoverSignalsInitializedRef.current &&
        preferences.followedSubmission &&
        !seenFollowedSubmissionKeysRef.current.has(key)
      ) {
        const displayName = item.profileName || `${item.submitter.slice(0, 6)}...${item.submitter.slice(-4)}`;
        const shortTitle = item.title.length > 72 ? `${item.title.slice(0, 69)}...` : item.title;
        notifyWithLink(
          "success",
          "Followed curator submitted",
          `${displayName} submitted "${shortTitle}".`,
          `/vote?content=${item.contentId}`,
        );
      }
    }

    for (const item of discoverSignals.followedResolutions) {
      const key = `${item.id}-${item.settledAt ?? ""}`;
      currentResolutionKeys.add(key);

      if (
        discoverSignalsInitializedRef.current &&
        preferences.followedResolution &&
        !seenFollowedResolutionKeysRef.current.has(key)
      ) {
        const displayName = item.profileName || `${item.voter.slice(0, 6)}...${item.voter.slice(-4)}`;
        const shortTitle = item.title.length > 72 ? `${item.title.slice(0, 69)}...` : item.title;
        const action = item.outcome === "won" ? "won" : item.outcome === "lost" ? "lost" : "resolved";

        notifyWithLink(
          "success",
          "Followed curator resolved",
          `${displayName} ${action} a call on "${shortTitle}".`,
          `/vote?content=${item.contentId}`,
        );
      }
    }

    if (!discoverSignalsInitializedRef.current) {
      discoverSignalsInitializedRef.current = true;
      seenSettlingDayKeysRef.current = new Set([...seenSettlingDayKeysRef.current, ...currentSettlingDayKeys]);
      seenSettlingHourKeysRef.current = new Set([...seenSettlingHourKeysRef.current, ...currentSettlingHourKeys]);
    }

    seenFollowedSubmissionKeysRef.current = new Set([
      ...seenFollowedSubmissionKeysRef.current,
      ...currentSubmissionKeys,
    ]);
    seenFollowedResolutionKeysRef.current = new Set([
      ...seenFollowedResolutionKeysRef.current,
      ...currentResolutionKeys,
    ]);
  }, [address, discoverSignals, preferences]);

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

        const href = votedRound ? GOVERNANCE_REWARDS_HREF : `/vote?content=${contentId}`;
        const title = votedRound ? "Round Resolved!" : "Watched Content Resolved!";
        const body = votedRound
          ? `Content #${contentId} round resolved. Open Governance to claim rewards.`
          : `Content #${contentId} just resolved. Open Curyo to see the latest result.`;
        const toastBody = votedRound ? (
          <Link href={href} className="font-medium underline">
            {`Round resolved! Content #${contentId} round #${args.roundId.toString()}. Open Governance to claim rewards.`}
          </Link>
        ) : (
          <Link href={href} className="font-medium underline">
            {`Watched content resolved! Content #${contentId} round #${args.roundId.toString()} is ready to review.`}
          </Link>
        );

        // In-app toast (always fires)
        notification.success(toastBody, { duration: 8000 });

        // Browser notification (only if permitted)
        if (permissionRef.current === "granted") {
          try {
            const browserNotification = new Notification(title, {
              body,
              icon: "/favicon.png",
            });
            browserNotification.onclick = () => {
              window.focus();
              window.location.href = href;
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
