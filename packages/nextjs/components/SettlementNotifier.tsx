"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import { buildRateContentHref } from "~~/constants/routes";
import { getClaimableRoundKey } from "~~/hooks/claimableRewards";
import { useScaffoldWatchContractEvent } from "~~/hooks/scaffold-eth";
import { useAllClaimableRewards } from "~~/hooks/useAllClaimableRewards";
import { useDiscoverSignals } from "~~/hooks/useDiscoverSignals";
import { useFollowedProfiles } from "~~/hooks/useFollowedProfiles";
import { useNotificationPreferences } from "~~/hooks/useNotificationPreferences";
import { useRecentUserVotes } from "~~/hooks/useRecentUserVotes";
import { useWatchedContent } from "~~/hooks/useWatchedContent";
import { truncateContentTitle } from "~~/lib/contentTitle";
import {
  CLAIM_REWARD_NOTIFICATION_DELAY_MS,
  CLAIM_REWARD_NOTIFICATION_EXPIRY_MS,
  CLAIM_REWARD_NOTIFICATION_RECHECK_MS,
  type PendingClaimRewardNotification,
  pickClaimRewardNotification,
  readLastClaimRewardNotificationAt,
  writeLastClaimRewardNotificationAt,
} from "~~/lib/notifications/claimRewards";
import {
  FOLLOWED_CURATOR_TOAST_ID,
  getFollowedResolutionNotificationKey,
  getFollowedSubmissionNotificationKey,
  pickFollowedActivityNotification,
} from "~~/lib/notifications/followedActivity";
import { pickSettlingSoonNotification } from "~~/lib/notifications/settlingSoon";
import { notification } from "~~/utils/scaffold-eth";

const GOVERNANCE_REWARDS_HREF = "/governance";

type PendingClaimRoundNotification = PendingClaimRewardNotification & {
  contentId: string;
  expiresAtMs: number;
  roundId: string;
};

/**
 * Headless component that fires browser notifications + in-app toasts for
 * tracked round resolutions, settling-soon reminders, and followed-curator activity.
 */
export function SettlementNotifier() {
  const { address } = useAccount();
  const [activeKeys, setActiveKeys] = useState<Set<string>>(new Set());
  const [pendingClaimCount, setPendingClaimCount] = useState(0);
  const [claimRecheckTick, setClaimRecheckTick] = useState(0);
  const permissionRef = useRef<NotificationPermission>("default");
  const activeKeysRef = useRef<Set<string>>(new Set());
  const pendingClaimNotificationsRef = useRef<Map<string, PendingClaimRoundNotification>>(new Map());
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
  const { claimableItems, refetch: refetchClaimable } = useAllClaimableRewards();

  const claimableRoundKeys = useMemo(
    () => new Set(claimableItems.map(item => getClaimableRoundKey(item)).filter((key): key is string => key !== null)),
    [claimableItems],
  );

  useEffect(() => {
    roundResolvedEnabledRef.current = preferences.roundResolved;
  }, [preferences.roundResolved]);

  const openBrowserNotification = useCallback((title: string, body: string, href: string) => {
    if (typeof window === "undefined" || permissionRef.current !== "granted") return;

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
  }, []);

  const notifyWithLink = useCallback(
    (kind: "info" | "success", title: string, body: string, href: string, toastId?: string) => {
      const toastBody = (
        <Link href={href} className="font-medium underline">
          {body}
        </Link>
      );

      if (kind === "success") {
        notification.success(toastBody, { duration: 8000, id: toastId });
      } else {
        notification.info(toastBody, { duration: 8000, id: toastId });
      }

      openBrowserNotification(title, body, href);
    },
    [openBrowserNotification],
  );

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

  const followedSinceByAddress = useMemo(
    () => new Map(followedItems.map(item => [item.walletAddress.toLowerCase(), item.createdAt])),
    [followedItems],
  );

  useEffect(() => {
    if (!address) {
      discoverSignalsInitializedRef.current = false;
      pendingClaimNotificationsRef.current = new Map();
      setPendingClaimCount(0);
      setClaimRecheckTick(0);
      seenSettlingDayKeysRef.current = new Set();
      seenSettlingHourKeysRef.current = new Set();
      seenFollowedSubmissionKeysRef.current = new Set();
      seenFollowedResolutionKeysRef.current = new Set();
      return;
    }

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
      currentSubmissionKeys.add(getFollowedSubmissionNotificationKey(item));
    }

    const followedActivityNotification = discoverSignalsInitializedRef.current
      ? pickFollowedActivityNotification({
          submissions: preferences.followedSubmission ? discoverSignals.followedSubmissions : [],
          resolutions: preferences.followedResolution ? discoverSignals.followedResolutions : [],
          seenSubmissionKeys: seenFollowedSubmissionKeysRef.current,
          seenResolutionKeys: seenFollowedResolutionKeysRef.current,
          followedSinceByAddress,
        })
      : null;

    if (followedActivityNotification?.kind === "submission") {
      const item = followedActivityNotification.item;
      const displayName = item.profileName || `${item.submitter.slice(0, 6)}...${item.submitter.slice(-4)}`;
      const shortTitle = truncateContentTitle(item.title);
      notifyWithLink(
        "success",
        "Followed curator asked",
        `${displayName} asked "${shortTitle}".`,
        buildRateContentHref(item.contentId),
        FOLLOWED_CURATOR_TOAST_ID,
      );
    }

    for (const item of discoverSignals.followedResolutions) {
      const key = getFollowedResolutionNotificationKey(item);
      currentResolutionKeys.add(key);
    }

    if (followedActivityNotification?.kind === "resolution") {
      const item = followedActivityNotification.item;
      const displayName = item.profileName || `${item.voter.slice(0, 6)}...${item.voter.slice(-4)}`;
      const shortTitle = truncateContentTitle(item.title);
      const action = item.outcome === "won" ? "won" : item.outcome === "lost" ? "lost" : "resolved";

      notifyWithLink(
        "success",
        "Followed curator resolved",
        `${displayName} ${action} a call on "${shortTitle}".`,
        buildRateContentHref(item.contentId),
        FOLLOWED_CURATOR_TOAST_ID,
      );
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
  }, [address, discoverSignals, followedSinceByAddress, notifyWithLink, preferences]);

  useEffect(() => {
    if (!address || pendingClaimCount === 0) return;

    const timerId = window.setInterval(() => {
      void refetchClaimable();
      setClaimRecheckTick(tick => tick + 1);
    }, CLAIM_REWARD_NOTIFICATION_RECHECK_MS);

    return () => {
      window.clearInterval(timerId);
    };
  }, [address, pendingClaimCount, refetchClaimable]);

  useEffect(() => {
    if (!address || pendingClaimCount === 0) return;

    const pending = [...pendingClaimNotificationsRef.current.values()];
    const nowMs = Date.now();

    const expiredKeys = pending.filter(item => nowMs >= item.expiresAtMs).map(item => item.key);
    if (expiredKeys.length > 0) {
      for (const key of expiredKeys) {
        pendingClaimNotificationsRef.current.delete(key);
      }
      setPendingClaimCount(pendingClaimNotificationsRef.current.size);
      if (pendingClaimNotificationsRef.current.size === 0) return;
    }

    const nextNotification = pickClaimRewardNotification({
      nowMs,
      pending: [...pendingClaimNotificationsRef.current.values()],
      claimableKeys: claimableRoundKeys,
      lastNotifiedAtMs: readLastClaimRewardNotificationAt(address),
    });
    if (!nextNotification) return;

    const pendingRound = pendingClaimNotificationsRef.current.get(nextNotification.key);
    if (!pendingRound) return;

    pendingClaimNotificationsRef.current.delete(nextNotification.key);
    setPendingClaimCount(pendingClaimNotificationsRef.current.size);

    writeLastClaimRewardNotificationAt(address, nowMs);
    notifyWithLink(
      "success",
      "Reward Ready to Claim",
      `Round resolved! Content #${pendingRound.contentId} round #${pendingRound.roundId} is ready to claim.`,
      GOVERNANCE_REWARDS_HREF,
    );
  }, [address, claimableRoundKeys, claimRecheckTick, notifyWithLink, pendingClaimCount]);

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
          pendingClaimNotificationsRef.current.set(key, {
            key,
            contentId,
            expiresAtMs: Date.now() + CLAIM_REWARD_NOTIFICATION_EXPIRY_MS,
            roundId: args.roundId.toString(),
            readyAtMs: Date.now() + CLAIM_REWARD_NOTIFICATION_DELAY_MS,
          });
          setPendingClaimCount(pendingClaimNotificationsRef.current.size);
          continue;
        }

        notifyWithLink(
          "success",
          "Watched Content Resolved!",
          `Watched content resolved! Content #${contentId} round #${args.roundId.toString()} is ready to review.`,
          buildRateContentHref(contentId),
        );
      }
    },
  } as any);

  return null;
}
