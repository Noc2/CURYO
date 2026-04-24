"use client";

import type { ContentItem } from "~~/hooks/useContentFeed";

export const DISCOVER_ALL_FILTER = "All";
export const DISCOVER_BROKEN_FILTER = "Broken";
export const DISCOVER_EXPIRED_BOUNTY_FILTER = "Expired";

function hasActiveBounty(item: ContentItem, nowSeconds: number) {
  const rewardSummary = item.rewardPoolSummary;
  if (rewardSummary?.hasActiveBounty || (rewardSummary?.activeRewardPoolCount ?? 0) > 0) {
    return true;
  }

  const bundle = item.bundle;
  if (!bundle || bundle.failed || bundle.refunded) return false;
  if (bundle.completedRoundSetCount >= bundle.requiredSettledRounds) return false;

  const remainingAmount = bundle.unallocatedAmount + bundle.allocatedAmount - bundle.claimedAmount;
  if (remainingAmount <= 0n) return false;

  const bountyClosesAt = bundle.bountyClosesAt ?? 0n;
  return bountyClosesAt === 0n || bountyClosesAt > BigInt(nowSeconds);
}

export function getActiveBountyClosesAt(item: ContentItem, nowSeconds = Math.floor(Date.now() / 1000)) {
  const rewardSummary = item.rewardPoolSummary;
  if (rewardSummary?.nextBountyClosesAt && rewardSummary.nextBountyClosesAt > BigInt(nowSeconds)) {
    return rewardSummary.nextBountyClosesAt;
  }

  const bundle = item.bundle;
  if (!bundle || bundle.failed || bundle.refunded) return null;
  if (bundle.completedRoundSetCount >= bundle.requiredSettledRounds) return null;

  const remainingAmount = bundle.unallocatedAmount + bundle.allocatedAmount - bundle.claimedAmount;
  if (remainingAmount <= 0n) return null;
  const bountyClosesAt = bundle.bountyClosesAt ?? 0n;
  if (bountyClosesAt <= 0n || bountyClosesAt <= BigInt(nowSeconds)) return null;

  return bountyClosesAt;
}

export function isExpiredBountyItem(item: ContentItem, nowSeconds = Math.floor(Date.now() / 1000)) {
  const rewardSummary = item.rewardPoolSummary;
  const hasExpiredRewardPool = (rewardSummary?.expiredRewardPoolCount ?? 0) > 0;
  const bundle = item.bundle;
  const hasExpiredBundle = Boolean(
    bundle &&
      !bundle.failed &&
      !bundle.refunded &&
      bundle.completedRoundSetCount < bundle.requiredSettledRounds &&
      bundle.unallocatedAmount + bundle.allocatedAmount - bundle.claimedAmount > 0n &&
      (bundle.bountyClosesAt ?? 0n) > 0n &&
      (bundle.bountyClosesAt ?? 0n) <= BigInt(nowSeconds),
  );

  return (hasExpiredRewardPool || hasExpiredBundle) && !hasActiveBounty(item, nowSeconds);
}

export function filterDiscoverCategoryItems(
  feed: ContentItem[],
  activeCategory: string,
  activeCategoryId?: bigint,
  nowSeconds = Math.floor(Date.now() / 1000),
): ContentItem[] {
  let items = [...feed];

  if (activeCategory === DISCOVER_BROKEN_FILTER) {
    items = items.filter(item => item.isValidUrl === false);
  } else if (activeCategory === DISCOVER_EXPIRED_BOUNTY_FILTER) {
    items = items.filter(item => item.isValidUrl !== false && isExpiredBountyItem(item, nowSeconds));
  } else {
    items = items.filter(item => item.isValidUrl !== false && !isExpiredBountyItem(item, nowSeconds));
  }

  if (
    activeCategory !== DISCOVER_ALL_FILTER &&
    activeCategory !== DISCOVER_BROKEN_FILTER &&
    activeCategory !== DISCOVER_EXPIRED_BOUNTY_FILTER &&
    activeCategoryId === undefined
  ) {
    items = items.filter(item => item.tags.includes(activeCategory));
  }

  return items;
}
