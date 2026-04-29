const DEFAULT_NEW_ROUND_TARGET_BUFFER_SECONDS = 60;

function clampNewRoundTargetBufferSeconds(epochDurationSeconds: number, bufferSeconds: number) {
  const safeEpochDurationSeconds = Math.max(1, Math.floor(epochDurationSeconds));
  if (safeEpochDurationSeconds <= 1) {
    return 0;
  }

  return Math.min(Math.max(1, Math.floor(bufferSeconds)), safeEpochDurationSeconds - 1);
}

export function deriveCommitVoteTargetTimeSeconds(params: {
  latestBlockTimestampSeconds: number;
  epochDurationSeconds: number;
  roundStartTimeSeconds?: number | null;
  newRoundTargetBufferSeconds?: number;
}) {
  const commitTimestampSeconds = Math.max(0, Math.floor(params.latestBlockTimestampSeconds)) + 1;
  const epochDurationSeconds = Math.max(1, Math.floor(params.epochDurationSeconds));
  const roundStartTimeSeconds = params.roundStartTimeSeconds != null ? Math.floor(params.roundStartTimeSeconds) : null;

  if (roundStartTimeSeconds != null && roundStartTimeSeconds > 0) {
    const elapsedSeconds = Math.max(0, commitTimestampSeconds - roundStartTimeSeconds);
    const currentEpochIndex = Math.floor(elapsedSeconds / epochDurationSeconds);
    const nextEpochBoundarySeconds = roundStartTimeSeconds + (currentEpochIndex + 1) * epochDurationSeconds;

    return nextEpochBoundarySeconds + 1;
  }

  const newRoundTargetBufferSeconds = clampNewRoundTargetBufferSeconds(
    epochDurationSeconds,
    params.newRoundTargetBufferSeconds ?? DEFAULT_NEW_ROUND_TARGET_BUFFER_SECONDS,
  );

  return commitTimestampSeconds + epochDurationSeconds + newRoundTargetBufferSeconds;
}

export function deriveCommitVoteRuntimeNowMs(params: {
  latestBlockTimestampSeconds: number;
  epochDurationSeconds: number;
  roundStartTimeSeconds?: number | null;
  newRoundTargetBufferSeconds?: number;
}) {
  const targetTimeSeconds = deriveCommitVoteTargetTimeSeconds(params);
  return (targetTimeSeconds - Math.max(1, Math.floor(params.epochDurationSeconds))) * 1000;
}
