"use client";

import { VOTE_COOLDOWN_SECONDS, getVoteCooldownRemainingSeconds } from "./cooldown";

const LOCAL_VOTE_COOLDOWN_KEY = "curyo:voteCooldowns:v1";
const MAX_LOCAL_VOTE_COOLDOWNS = 500;

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

interface LocalVoteCooldownRecord {
  address?: string;
  chainId: number;
  committedAt: number;
  contentId: string;
  savedAt: number;
  voterIdTokenId?: string;
}

export interface VoteCooldownIdentity {
  address?: string | null;
  voterIdTokenId?: bigint | string | number | null;
}

export interface RecordLocalVoteCooldownParams extends VoteCooldownIdentity {
  chainId: number;
  committedAtSeconds?: number;
  contentId: bigint | string | number;
  nowSeconds?: number;
  storage?: StorageLike | null;
}

export interface GetLocalVoteCooldownsParams {
  chainId: number;
  contentIds?: readonly (bigint | string | number)[];
  identities: readonly VoteCooldownIdentity[];
  nowSeconds: number;
  storage?: StorageLike | null;
}

function getDefaultStorage(): StorageLike | null {
  if (typeof window === "undefined") return null;
  return window.localStorage;
}

function normalizeAddress(address?: string | null) {
  const trimmed = address?.trim();
  return trimmed ? trimmed.toLowerCase() : null;
}

function normalizeTokenId(tokenId?: bigint | string | number | null) {
  if (tokenId === null || tokenId === undefined) return null;

  try {
    const value = BigInt(tokenId);
    return value > 0n ? value.toString() : null;
  } catch {
    return null;
  }
}

function normalizeContentId(contentId: bigint | string | number) {
  try {
    const value = BigInt(contentId);
    return value >= 0n ? value.toString() : null;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is LocalVoteCooldownRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<LocalVoteCooldownRecord>;
  return (
    typeof record.chainId === "number" &&
    Number.isInteger(record.chainId) &&
    typeof record.contentId === "string" &&
    typeof record.committedAt === "number" &&
    Number.isFinite(record.committedAt) &&
    record.committedAt > 0 &&
    typeof record.savedAt === "number" &&
    Number.isFinite(record.savedAt) &&
    (record.address === undefined || typeof record.address === "string") &&
    (record.voterIdTokenId === undefined || typeof record.voterIdTokenId === "string")
  );
}

function readRecords(storage: StorageLike | null) {
  if (!storage) return [] as LocalVoteCooldownRecord[];

  try {
    const raw = storage.getItem(LOCAL_VOTE_COOLDOWN_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isRecord);
  } catch {
    return [];
  }
}

function writeRecords(storage: StorageLike | null, records: LocalVoteCooldownRecord[]) {
  if (!storage) return;

  try {
    storage.setItem(LOCAL_VOTE_COOLDOWN_KEY, JSON.stringify(records));
  } catch {
    // localStorage can be disabled, full, or unavailable in embedded contexts.
  }
}

function pruneRecords(records: LocalVoteCooldownRecord[], nowSeconds: number) {
  return records
    .filter(record => getVoteCooldownRemainingSeconds(record.committedAt, nowSeconds) > 0)
    .sort((left, right) => right.committedAt - left.committedAt)
    .slice(0, MAX_LOCAL_VOTE_COOLDOWNS);
}

function buildIdentitySets(identities: readonly VoteCooldownIdentity[]) {
  const addresses = new Set<string>();
  const tokenIds = new Set<string>();

  for (const identity of identities) {
    const address = normalizeAddress(identity.address);
    if (address) addresses.add(address);

    const tokenId = normalizeTokenId(identity.voterIdTokenId);
    if (tokenId) tokenIds.add(tokenId);
  }

  return { addresses, tokenIds };
}

function matchesIdentity(record: LocalVoteCooldownRecord, identities: ReturnType<typeof buildIdentitySets>) {
  return (
    (record.voterIdTokenId !== undefined && identities.tokenIds.has(record.voterIdTokenId)) ||
    (record.address !== undefined && identities.addresses.has(record.address))
  );
}

export function recordLocalVoteCooldown({
  address,
  chainId,
  committedAtSeconds,
  contentId,
  nowSeconds = Math.floor(Date.now() / 1000),
  storage = getDefaultStorage(),
  voterIdTokenId,
}: RecordLocalVoteCooldownParams) {
  const normalizedContentId = normalizeContentId(contentId);
  const normalizedAddress = normalizeAddress(address);
  const normalizedTokenId = normalizeTokenId(voterIdTokenId);
  if (!normalizedContentId || (!normalizedAddress && !normalizedTokenId)) return;

  const committedAt = Math.floor(committedAtSeconds ?? nowSeconds);
  if (!Number.isFinite(committedAt) || committedAt <= 0) return;

  const nextRecord: LocalVoteCooldownRecord = {
    chainId,
    committedAt,
    contentId: normalizedContentId,
    savedAt: nowSeconds,
    ...(normalizedAddress ? { address: normalizedAddress } : {}),
    ...(normalizedTokenId ? { voterIdTokenId: normalizedTokenId } : {}),
  };
  const records = pruneRecords(readRecords(storage), nowSeconds).filter(record => {
    if (record.chainId !== chainId || record.contentId !== normalizedContentId) return true;
    if (normalizedTokenId && record.voterIdTokenId === normalizedTokenId) return false;
    if (normalizedAddress && record.address === normalizedAddress) return false;
    return true;
  });

  records.unshift(nextRecord);
  writeRecords(storage, pruneRecords(records, nowSeconds));
}

export function getLocalVoteCooldownsByContentId({
  chainId,
  contentIds,
  identities,
  nowSeconds,
  storage = getDefaultStorage(),
}: GetLocalVoteCooldownsParams) {
  const normalizedContentIds = contentIds
    ? new Set(contentIds.map(normalizeContentId).filter((value): value is string => value !== null))
    : null;
  const identitySets = buildIdentitySets(identities);
  const cooldowns = new Map<string, number>();
  const records = pruneRecords(readRecords(storage), nowSeconds);

  for (const record of records) {
    if (record.chainId !== chainId) continue;
    if (normalizedContentIds && !normalizedContentIds.has(record.contentId)) continue;
    if (!matchesIdentity(record, identitySets)) continue;

    const remainingSeconds = Math.min(
      VOTE_COOLDOWN_SECONDS,
      getVoteCooldownRemainingSeconds(record.committedAt, nowSeconds),
    );
    if (remainingSeconds <= 0) continue;

    const previous = cooldowns.get(record.contentId) ?? 0;
    if (remainingSeconds > previous) {
      cooldowns.set(record.contentId, remainingSeconds);
    }
  }

  if (records.length !== readRecords(storage).length) {
    writeRecords(storage, records);
  }

  return cooldowns;
}
