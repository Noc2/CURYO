export type VoteCommittedLogLike = {
  blockHash?: `0x${string}` | null;
  blockNumber?: bigint | null;
  logIndex?: number | null;
};

export function pickLatestVoteCommittedLog<T extends VoteCommittedLogLike>(logs: readonly T[]): T | null {
  let latest: T | null = null;

  for (const log of logs) {
    if (log.blockNumber == null) continue;
    if (latest == null) {
      latest = log;
      continue;
    }

    const latestBlockNumber = latest.blockNumber ?? -1n;
    if (log.blockNumber > latestBlockNumber) {
      latest = log;
      continue;
    }

    if (log.blockNumber === latestBlockNumber && (log.logIndex ?? -1) > (latest.logIndex ?? -1)) {
      latest = log;
    }
  }

  return latest;
}
