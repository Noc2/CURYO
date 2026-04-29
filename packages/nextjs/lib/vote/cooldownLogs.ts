"use client";

import { VOTE_COOLDOWN_SECONDS } from "./cooldown";

export interface VoteCooldownLogLike {
  args?: {
    contentId?: bigint | string | number;
  };
  blockHash?: `0x${string}` | null;
  blockNumber?: bigint | null;
  logIndex?: number | null;
}

interface VoteCooldownLogItem {
  contentId: string;
  latestCommittedAt: string;
  cooldownEndsAt: string;
}

function normalizeContentId(contentId: bigint | string | number | undefined) {
  if (contentId === undefined) return null;

  try {
    const value = BigInt(contentId);
    return value >= 0n ? value.toString() : null;
  } catch {
    return null;
  }
}

function isNewerLog(left: VoteCooldownLogLike, right: VoteCooldownLogLike) {
  const leftBlock = left.blockNumber ?? -1n;
  const rightBlock = right.blockNumber ?? -1n;
  if (leftBlock !== rightBlock) return leftBlock > rightBlock;
  return (left.logIndex ?? -1) > (right.logIndex ?? -1);
}

export async function buildVoteCooldownItemsFromLogs<TLog extends VoteCooldownLogLike>(
  logs: readonly TLog[],
  getCommittedTimestampSeconds: (log: TLog) => Promise<number | null>,
): Promise<VoteCooldownLogItem[]> {
  const latestLogByContentId = new Map<string, TLog>();

  for (const log of logs) {
    const contentId = normalizeContentId(log.args?.contentId);
    if (!contentId) continue;

    const previous = latestLogByContentId.get(contentId);
    if (!previous || isNewerLog(log, previous)) {
      latestLogByContentId.set(contentId, log);
    }
  }

  const items: VoteCooldownLogItem[] = [];
  for (const [contentId, log] of latestLogByContentId) {
    const committedAt = await getCommittedTimestampSeconds(log);
    if (committedAt === null || !Number.isFinite(committedAt) || committedAt <= 0) continue;

    const committedSeconds = Math.floor(committedAt);
    items.push({
      contentId,
      latestCommittedAt: committedSeconds.toString(),
      cooldownEndsAt: (committedSeconds + VOTE_COOLDOWN_SECONDS).toString(),
    });
  }

  return items;
}
