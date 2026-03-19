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

export const PLATFORM_REWARD_SPLIT_BPS = {
  frontend: 300,
  category: 100,
} as const;

export const REWARD_SPLIT_BPS = {
  revealedLoserRefund: 500,
  voter: 8_000,
  submitter: 1_000,
  platform: PLATFORM_REWARD_SPLIT_BPS.frontend + PLATFORM_REWARD_SPLIT_BPS.category,
  treasury: 100,
  consensus: 500,
} as const;
