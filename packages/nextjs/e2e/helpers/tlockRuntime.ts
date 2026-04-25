export function deriveAnchoredTlockRuntimeNowMs(params: {
  latestBlockTimestampSeconds: number;
  roundEpochDurationSeconds: number;
  tlockEpochDurationSeconds: number;
  drandPeriodSeconds?: number;
  roundStartTimeSeconds?: number | null;
}): number {
  // Commits land in the next block, so anchor against the soonest possible
  // mined timestamp rather than the latest confirmed block.
  const latestBlockTimestampSeconds = Math.max(0, Math.floor(params.latestBlockTimestampSeconds)) + 1;
  const roundEpochDurationSeconds = Math.max(1, Math.floor(params.roundEpochDurationSeconds));
  const tlockEpochDurationSeconds = Math.max(1, Math.floor(params.tlockEpochDurationSeconds));
  const roundStartTimeSeconds =
    params.roundStartTimeSeconds != null ? Math.floor(params.roundStartTimeSeconds) : null;

  let revealableAfterSeconds = latestBlockTimestampSeconds + roundEpochDurationSeconds;
  if (roundStartTimeSeconds != null && roundStartTimeSeconds > 0) {
    const elapsedSeconds = Math.max(0, latestBlockTimestampSeconds - roundStartTimeSeconds);
    const currentEpochIndex = Math.floor(elapsedSeconds / roundEpochDurationSeconds);
    revealableAfterSeconds = roundStartTimeSeconds + (currentEpochIndex + 1) * roundEpochDurationSeconds;
  }

  return (revealableAfterSeconds - tlockEpochDurationSeconds) * 1000;
}

export function deriveAcceptedTlockTargetRound(params: {
  latestBlockTimestampSeconds: number;
  roundEpochDurationSeconds: number;
  drandGenesisTimeSeconds: bigint | number;
  drandPeriodSeconds: bigint | number;
  roundStartTimeSeconds?: number | null;
  candidateTimestampOffsetsSeconds?: readonly number[];
}): bigint {
  const latestBlockTimestampSeconds = Math.max(0, Math.floor(params.latestBlockTimestampSeconds));
  const roundEpochDurationSeconds = BigInt(Math.max(1, Math.floor(params.roundEpochDurationSeconds)));
  const drandGenesisTimeSeconds = BigInt(params.drandGenesisTimeSeconds);
  const drandPeriodSeconds = BigInt(params.drandPeriodSeconds);
  const roundStartTimeSeconds =
    params.roundStartTimeSeconds != null ? BigInt(Math.floor(params.roundStartTimeSeconds)) : null;
  const candidateTimestampOffsetsSeconds = params.candidateTimestampOffsetsSeconds ?? [0, 1];

  if (drandPeriodSeconds <= 0n) {
    throw new Error("drandPeriodSeconds must be greater than zero");
  }

  let minAcceptedTargetRound = 0n;
  let maxAcceptedTargetRound = 0n;

  for (const offsetSeconds of candidateTimestampOffsetsSeconds) {
    const candidateTimestampSeconds = BigInt(latestBlockTimestampSeconds + Math.floor(offsetSeconds));
    const revealableAfterSeconds = deriveCommitRevealableAfterSeconds({
      candidateTimestampSeconds,
      roundStartTimeSeconds,
      roundEpochDurationSeconds,
    });

    if (revealableAfterSeconds < drandGenesisTimeSeconds) {
      throw new Error(
        `Revealable timestamp ${revealableAfterSeconds.toString()} is before drand genesis ${drandGenesisTimeSeconds.toString()}`,
      );
    }

    const minTargetRound = roundAtOrAfter(revealableAfterSeconds, drandGenesisTimeSeconds, drandPeriodSeconds);
    const maxTargetRound = roundAt(
      revealableAfterSeconds + roundEpochDurationSeconds,
      drandGenesisTimeSeconds,
      drandPeriodSeconds,
    );

    if (minTargetRound === 0n || maxTargetRound === 0n || minTargetRound > maxTargetRound) {
      throw new Error(
        `No valid drand target round for revealableAfter=${revealableAfterSeconds.toString()}, epochDuration=${roundEpochDurationSeconds.toString()}`,
      );
    }

    if (minTargetRound > minAcceptedTargetRound) {
      minAcceptedTargetRound = minTargetRound;
    }
    if (maxAcceptedTargetRound === 0n || maxTargetRound < maxAcceptedTargetRound) {
      maxAcceptedTargetRound = maxTargetRound;
    }
  }

  if (minAcceptedTargetRound === 0n || minAcceptedTargetRound > maxAcceptedTargetRound) {
    throw new Error(
      `No shared drand target round for commit windows, min=${minAcceptedTargetRound.toString()}, max=${maxAcceptedTargetRound.toString()}`,
    );
  }

  return minAcceptedTargetRound;
}

function deriveCommitRevealableAfterSeconds(params: {
  candidateTimestampSeconds: bigint;
  roundStartTimeSeconds: bigint | null;
  roundEpochDurationSeconds: bigint;
}): bigint {
  const roundStartTimeSeconds = params.roundStartTimeSeconds ?? params.candidateTimestampSeconds;
  const elapsedSeconds =
    params.candidateTimestampSeconds > roundStartTimeSeconds
      ? params.candidateTimestampSeconds - roundStartTimeSeconds
      : 0n;
  const epochIndex = elapsedSeconds / params.roundEpochDurationSeconds;

  return roundStartTimeSeconds + (epochIndex + 1n) * params.roundEpochDurationSeconds;
}

function roundAt(timestampSeconds: bigint, genesisTimeSeconds: bigint, periodSeconds: bigint): bigint {
  if (periodSeconds <= 0n || timestampSeconds < genesisTimeSeconds) {
    return 0n;
  }

  return (timestampSeconds - genesisTimeSeconds) / periodSeconds + 1n;
}

function roundAtOrAfter(timestampSeconds: bigint, genesisTimeSeconds: bigint, periodSeconds: bigint): bigint {
  if (periodSeconds <= 0n || timestampSeconds < genesisTimeSeconds) {
    return 0n;
  }

  const elapsedSeconds = timestampSeconds - genesisTimeSeconds;
  return (elapsedSeconds + periodSeconds - 1n) / periodSeconds + 1n;
}

export function deriveDrandRoundRevealableAtSeconds(params: {
  targetRound: bigint | number;
  drandGenesisTimeSeconds: bigint | number;
  drandPeriodSeconds: bigint | number;
}): bigint {
  const targetRound = BigInt(params.targetRound);
  const drandGenesisTimeSeconds = BigInt(params.drandGenesisTimeSeconds);
  const drandPeriodSeconds = BigInt(params.drandPeriodSeconds);

  if (targetRound <= 0n || drandPeriodSeconds <= 0n) {
    return 0n;
  }

  return drandGenesisTimeSeconds + (targetRound - 1n) * drandPeriodSeconds;
}

export function deriveKeeperDecryptableAtSeconds(params: {
  revealableAfterSeconds: bigint | number;
  targetRound: bigint | number;
  drandGenesisTimeSeconds: bigint | number;
  drandPeriodSeconds: bigint | number;
}): bigint {
  const revealableAfterSeconds = BigInt(params.revealableAfterSeconds);
  const drandRoundRevealableAtSeconds = deriveDrandRoundRevealableAtSeconds({
    targetRound: params.targetRound,
    drandGenesisTimeSeconds: params.drandGenesisTimeSeconds,
    drandPeriodSeconds: params.drandPeriodSeconds,
  });

  return revealableAfterSeconds > drandRoundRevealableAtSeconds
    ? revealableAfterSeconds
    : drandRoundRevealableAtSeconds;
}

export function deriveKeeperDecryptWaitMs(params: {
  wallClockNowSeconds: number;
  revealableAfterSeconds: bigint | number;
  targetRound: bigint | number;
  drandGenesisTimeSeconds: bigint | number;
  drandPeriodSeconds: bigint | number;
  keeperIntervalMs?: number;
  extraBufferMs?: number;
}): number {
  const decryptableAtSeconds = deriveKeeperDecryptableAtSeconds({
    revealableAfterSeconds: params.revealableAfterSeconds,
    targetRound: params.targetRound,
    drandGenesisTimeSeconds: params.drandGenesisTimeSeconds,
    drandPeriodSeconds: params.drandPeriodSeconds,
  });
  const waitUntilDecryptableMs =
    Number(
      decryptableAtSeconds - BigInt(params.wallClockNowSeconds) > 0n
        ? decryptableAtSeconds - BigInt(params.wallClockNowSeconds)
        : 0n,
    ) * 1000;

  return waitUntilDecryptableMs + (params.keeperIntervalMs ?? 0) + (params.extraBufferMs ?? 0);
}
