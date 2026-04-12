import type {
  PonderDiscoverSignalsResolutionItem,
  PonderDiscoverSignalsSubmissionItem,
} from "~~/services/ponder/client";

export const FOLLOWED_CURATOR_TOAST_ID = "followed-curator-feedback";

export type FollowedActivityNotification =
  | { kind: "submission"; item: PonderDiscoverSignalsSubmissionItem }
  | { kind: "resolution"; item: PonderDiscoverSignalsResolutionItem };

export function getFollowedSubmissionNotificationKey(item: PonderDiscoverSignalsSubmissionItem): string {
  return `${item.contentId}-${item.createdAt}`;
}

export function getFollowedResolutionNotificationKey(item: PonderDiscoverSignalsResolutionItem): string {
  return `${item.id}-${item.settledAt ?? ""}`;
}

function parseNotificationTime(value: string | null | undefined): number | null {
  if (!value) return null;

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function isAfterFollow(
  activityAddress: string,
  activityAt: string | null | undefined,
  followedSinceByAddress?: ReadonlyMap<string, string>,
) {
  const followedAt = followedSinceByAddress?.get(activityAddress.toLowerCase());
  if (!followedAt) return true;

  const followedAtMs = parseNotificationTime(followedAt);
  const activityAtMs = parseNotificationTime(activityAt);
  if (followedAtMs === null || activityAtMs === null) return true;

  return activityAtMs > followedAtMs;
}

export function pickFollowedSubmissionNotifications(
  items: PonderDiscoverSignalsSubmissionItem[],
  seenKeys: Set<string>,
): PonderDiscoverSignalsSubmissionItem[] {
  const notifiedSubmitters = new Set<string>();
  const picked: PonderDiscoverSignalsSubmissionItem[] = [];

  for (const item of items) {
    const key = getFollowedSubmissionNotificationKey(item);
    const submitter = item.submitter.toLowerCase();

    if (seenKeys.has(key) || notifiedSubmitters.has(submitter)) {
      continue;
    }

    notifiedSubmitters.add(submitter);
    picked.push(item);
  }

  return picked;
}

export function pickFollowedActivityNotification({
  submissions,
  resolutions,
  seenSubmissionKeys,
  seenResolutionKeys,
  followedSinceByAddress,
}: {
  submissions: PonderDiscoverSignalsSubmissionItem[];
  resolutions: PonderDiscoverSignalsResolutionItem[];
  seenSubmissionKeys: Set<string>;
  seenResolutionKeys: Set<string>;
  followedSinceByAddress?: ReadonlyMap<string, string>;
}): FollowedActivityNotification | null {
  const candidates: { item: FollowedActivityNotification; occurredAtMs: number }[] = [];

  for (const item of submissions) {
    const key = getFollowedSubmissionNotificationKey(item);
    if (seenSubmissionKeys.has(key) || !isAfterFollow(item.submitter, item.createdAt, followedSinceByAddress)) {
      continue;
    }

    candidates.push({
      item: { kind: "submission", item },
      occurredAtMs: parseNotificationTime(item.createdAt) ?? 0,
    });
  }

  for (const item of resolutions) {
    const key = getFollowedResolutionNotificationKey(item);
    if (seenResolutionKeys.has(key) || !isAfterFollow(item.voter, item.settledAt, followedSinceByAddress)) {
      continue;
    }

    candidates.push({
      item: { kind: "resolution", item },
      occurredAtMs: parseNotificationTime(item.settledAt) ?? 0,
    });
  }

  candidates.sort((a, b) => b.occurredAtMs - a.occurredAtMs);
  return candidates[0]?.item ?? null;
}
