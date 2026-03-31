export function resolveTlockTargetBufferSeconds(
  tlockEpochDurationSeconds: number,
  drandPeriodSeconds: number,
): number {
  if (tlockEpochDurationSeconds <= 1) {
    return 0;
  }

  const safeDrandPeriodSeconds = drandPeriodSeconds > 0 ? drandPeriodSeconds : 1;
  return Math.min(safeDrandPeriodSeconds, Math.max(1, Math.floor(tlockEpochDurationSeconds / 2)));
}

export function deriveAnchoredTlockRuntimeNowMs(params: {
  latestBlockTimestampSeconds: number;
  roundEpochDurationSeconds: number;
  tlockEpochDurationSeconds: number;
  drandPeriodSeconds: number;
}): number {
  const targetBufferSeconds = resolveTlockTargetBufferSeconds(
    params.tlockEpochDurationSeconds,
    params.drandPeriodSeconds,
  );
  const revealableAfterMs = (params.latestBlockTimestampSeconds + params.roundEpochDurationSeconds) * 1000;

  return revealableAfterMs + targetBufferSeconds * 1000 - params.tlockEpochDurationSeconds * 1000;
}
