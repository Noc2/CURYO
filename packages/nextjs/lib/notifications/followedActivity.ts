import type { PonderDiscoverSignalsSubmissionItem } from "~~/services/ponder/client";

export function getFollowedSubmissionNotificationKey(item: PonderDiscoverSignalsSubmissionItem): string {
  return `${item.contentId}-${item.createdAt}`;
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
