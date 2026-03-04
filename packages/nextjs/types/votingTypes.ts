/** Fields from RoundVotingEngine.getRound() — matches RoundLib.Round struct */
export interface RoundData {
  startTime: bigint;
  state: number;
  voteCount: bigint;
  revealedCount: bigint;
  totalStake: bigint;
  upPool: bigint;
  downPool: bigint;
  upCount: bigint;
  downCount: bigint;
  upWins: boolean;
  settledAt: bigint;
  thresholdReachedAt: bigint;
  weightedUpPool: bigint;
  weightedDownPool: bigint;
}

/** Fields from RoundVotingEngine.getCommit() */
export interface CommitData {
  voter: string;
  stakeAmount: bigint;
  epochIndex: number;
  revealed: boolean;
  isUp: boolean;
}
