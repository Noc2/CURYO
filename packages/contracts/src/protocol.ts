export const BPS_SCALE = 10_000 as const;

export const ROUND_STATE = {
  Open: 0,
  Settled: 1,
  Cancelled: 2,
  Tied: 3,
  RevealFailed: 4,
} as const;

export type RoundState = (typeof ROUND_STATE)[keyof typeof ROUND_STATE];

export const ROUND_STATE_LABEL: Record<RoundState, string> = {
  [ROUND_STATE.Open]: "Open",
  [ROUND_STATE.Settled]: "Settled",
  [ROUND_STATE.Cancelled]: "Cancelled",
  [ROUND_STATE.Tied]: "Tied",
  [ROUND_STATE.RevealFailed]: "RevealFailed",
};

export const DEFAULT_ROUND_CONFIG = {
  epochDurationSeconds: 20 * 60,
  maxDurationSeconds: 7 * 24 * 60 * 60,
  minVoters: 3,
  maxVoters: 1000,
} as const;

export const DEFAULT_REVEAL_GRACE_PERIOD_SECONDS = 60 * 60;

export const EPOCH_WEIGHT_BPS = {
  blind: BPS_SCALE,
  informed: 2_500,
} as const;

export const REWARD_SPLIT_BPS = {
  revealedLoserRefund: 500,
  voter: 8_200,
  submitter: 1_000,
  platform: 200,
  treasury: 100,
  consensus: 500,
} as const;

export const PLATFORM_REWARD_SPLIT_BPS = {
  frontend: REWARD_SPLIT_BPS.platform / 2,
  category: REWARD_SPLIT_BPS.platform / 2,
} as const;

export function isTerminalRoundState(state: number): state is Exclude<RoundState, typeof ROUND_STATE.Open> {
  return (
    state === ROUND_STATE.Settled
    || state === ROUND_STATE.Cancelled
    || state === ROUND_STATE.Tied
    || state === ROUND_STATE.RevealFailed
  );
}
