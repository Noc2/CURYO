export interface SettlingSoonCandidate {
  id: string;
  contentId: string;
  goal: string;
  estimatedSettlementTime: string | null;
}

export type SettlingSoonNotificationKind = "hour" | "day";

export interface SettlingSoonNotificationSummary {
  kind: SettlingSoonNotificationKind;
  contentId: string;
  href: string;
  title: string;
  body: string;
  itemIds: string[];
}

function truncateGoal(goal: string) {
  return goal.length > 72 ? `${goal.slice(0, 69)}...` : goal;
}

function formatSummaryBody(primaryGoal: string, additionalCount: number, suffix: string) {
  const shortGoal = truncateGoal(primaryGoal);

  if (additionalCount <= 0) {
    return `"${shortGoal}" ${suffix}`;
  }

  const roundsLabel = additionalCount === 1 ? "other tracked round" : "other tracked rounds";
  return `"${shortGoal}" and ${additionalCount} ${roundsLabel} ${suffix}`;
}

function sortByEstimatedSettlementTime(items: readonly SettlingSoonCandidate[]) {
  return [...items].sort((a, b) => {
    const aTime = a.estimatedSettlementTime ? Number(a.estimatedSettlementTime) : Number.POSITIVE_INFINITY;
    const bTime = b.estimatedSettlementTime ? Number(b.estimatedSettlementTime) : Number.POSITIVE_INFINITY;

    if (aTime === bTime) return a.id.localeCompare(b.id);
    return aTime - bTime;
  });
}

function buildSummary(
  kind: SettlingSoonNotificationKind,
  items: readonly SettlingSoonCandidate[],
): SettlingSoonNotificationSummary | null {
  if (items.length === 0) return null;

  const sorted = sortByEstimatedSettlementTime(items);
  const primary = sorted[0];
  const additionalCount = sorted.length - 1;
  const suffix = kind === "hour" ? "look likely to settle within the hour." : "look likely to settle today.";

  return {
    kind,
    contentId: primary.contentId,
    href: `/vote?content=${primary.contentId}`,
    title:
      kind === "hour"
        ? additionalCount > 0
          ? "Rounds settling soon"
          : "Round settling soon"
        : additionalCount > 0
          ? "Rounds settling today"
          : "Watched round settling today",
    body: formatSummaryBody(primary.goal, additionalCount, suffix),
    itemIds: sorted.map(item => item.id),
  };
}

export function pickSettlingSoonNotification(options: {
  nowSeconds: number;
  items: readonly SettlingSoonCandidate[];
  seenHourIds: ReadonlySet<string>;
  seenDayIds: ReadonlySet<string>;
  allowHour?: boolean;
  allowDay?: boolean;
}): SettlingSoonNotificationSummary | null {
  const unseenHourItems: SettlingSoonCandidate[] = [];
  const unseenDayItems: SettlingSoonCandidate[] = [];

  for (const item of options.items) {
    if (!item.estimatedSettlementTime) continue;

    const secondsUntil = Number(item.estimatedSettlementTime) - options.nowSeconds;
    if (secondsUntil <= 0) continue;

    if (secondsUntil <= 60 * 60) {
      if (!options.seenHourIds.has(item.id)) {
        unseenHourItems.push(item);
      }
      continue;
    }

    if (secondsUntil <= 24 * 60 * 60 && !options.seenDayIds.has(item.id)) {
      unseenDayItems.push(item);
    }
  }

  if (options.allowHour ?? true) {
    const hourSummary = buildSummary("hour", unseenHourItems);
    if (hourSummary) return hourSummary;
  }

  if (options.allowDay ?? true) {
    const daySummary = buildSummary("day", unseenDayItems);
    if (daySummary) return daySummary;
  }

  return null;
}
