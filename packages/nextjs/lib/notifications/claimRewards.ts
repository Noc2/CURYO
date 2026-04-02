export const CLAIM_REWARD_NOTIFICATION_DELAY_MS = 15_000;
export const CLAIM_REWARD_NOTIFICATION_RECHECK_MS = 15_000;
const CLAIM_REWARD_NOTIFICATION_COOLDOWN_MS = 30 * 60 * 1000;
export const CLAIM_REWARD_NOTIFICATION_EXPIRY_MS = 10 * 60 * 1000;

const LAST_CLAIM_REWARD_NOTIFICATION_PREFIX = "curyo_last_claim_reward_notification";

export interface PendingClaimRewardNotification {
  key: string;
  readyAtMs: number;
}

function getClaimRewardNotificationStorageKey(address: string) {
  return `${LAST_CLAIM_REWARD_NOTIFICATION_PREFIX}:${address.toLowerCase()}`;
}

export function readLastClaimRewardNotificationAt(address: string, storage?: Pick<Storage, "getItem"> | null) {
  const storageRef = storage ?? (typeof window !== "undefined" ? window.localStorage : null);
  if (!storageRef) return null;

  const rawValue = storageRef.getItem(getClaimRewardNotificationStorageKey(address));
  if (!rawValue) return null;

  const parsed = Number(rawValue);
  return Number.isFinite(parsed) ? parsed : null;
}

export function writeLastClaimRewardNotificationAt(
  address: string,
  atMs: number,
  storage?: Pick<Storage, "setItem"> | null,
) {
  const storageRef = storage ?? (typeof window !== "undefined" ? window.localStorage : null);
  if (!storageRef) return;

  storageRef.setItem(getClaimRewardNotificationStorageKey(address), String(atMs));
}

export function pickClaimRewardNotification(options: {
  nowMs: number;
  pending: readonly PendingClaimRewardNotification[];
  claimableKeys: ReadonlySet<string>;
  lastNotifiedAtMs: number | null;
  cooldownMs?: number;
}) {
  const cooldownMs = options.cooldownMs ?? CLAIM_REWARD_NOTIFICATION_COOLDOWN_MS;
  if (options.lastNotifiedAtMs !== null && options.nowMs - options.lastNotifiedAtMs < cooldownMs) {
    return null;
  }

  return (
    [...options.pending]
      .sort((a, b) => (a.readyAtMs === b.readyAtMs ? a.key.localeCompare(b.key) : a.readyAtMs - b.readyAtMs))
      .find(item => options.nowMs >= item.readyAtMs && options.claimableKeys.has(item.key)) ?? null
  );
}

export function shouldNotifyAboutClaimableRewards(options: {
  nowMs: number;
  previousTotal: bigint;
  nextTotal: bigint;
  lastNotifiedAtMs: number | null;
  cooldownMs?: number;
}) {
  if (options.nextTotal <= options.previousTotal) {
    return false;
  }

  const cooldownMs = options.cooldownMs ?? CLAIM_REWARD_NOTIFICATION_COOLDOWN_MS;
  if (options.lastNotifiedAtMs !== null && options.nowMs - options.lastNotifiedAtMs < cooldownMs) {
    return false;
  }

  return true;
}
