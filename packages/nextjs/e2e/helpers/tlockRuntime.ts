export function deriveAnchoredTlockRuntimeNowMs(params: {
  latestBlockTimestampSeconds: number;
  roundEpochDurationSeconds: number;
  tlockEpochDurationSeconds: number;
  drandPeriodSeconds: number;
}): number {
  const revealableAfterMs = (params.latestBlockTimestampSeconds + params.roundEpochDurationSeconds) * 1000;

  return revealableAfterMs - params.tlockEpochDurationSeconds * 1000;
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
