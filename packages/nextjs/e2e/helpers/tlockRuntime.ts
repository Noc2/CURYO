export function deriveAnchoredTlockRuntimeNowMs(params: {
  latestBlockTimestampSeconds: number;
  roundEpochDurationSeconds: number;
  tlockEpochDurationSeconds: number;
  drandPeriodSeconds?: number;
  roundStartTimeSeconds?: number | null;
}): number {
  const latestBlockTimestampSeconds = Math.max(0, Math.floor(params.latestBlockTimestampSeconds));
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
