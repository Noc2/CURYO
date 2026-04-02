interface VoteProgressIconCountsInput {
  voteCount: number;
  minVoters: number;
  maxIcons?: number;
}

interface VoteProgressIconCounts {
  filled: number;
  empty: number;
}

const DEFAULT_MAX_PROGRESS_ICONS = 7;

export function computeVoteProgressIconCounts({
  voteCount,
  minVoters,
  maxIcons = DEFAULT_MAX_PROGRESS_ICONS,
}: VoteProgressIconCountsInput): VoteProgressIconCounts {
  const safeVoteCount = Math.max(0, voteCount);
  const safeMinVoters = Math.max(0, minVoters);
  const safeMaxIcons = Math.max(0, maxIcons);
  const filled = Math.min(safeVoteCount, safeMaxIcons);
  const empty = Math.min(Math.max(0, safeMinVoters - safeVoteCount), Math.max(0, safeMaxIcons - filled));

  return { filled, empty };
}
