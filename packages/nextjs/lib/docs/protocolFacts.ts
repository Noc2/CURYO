import {
  BPS_SCALE,
  DEFAULT_REVEAL_GRACE_PERIOD_SECONDS,
  DEFAULT_ROUND_CONFIG,
  EPOCH_WEIGHT_BPS,
  PLATFORM_REWARD_SPLIT_BPS,
  REWARD_SPLIT_BPS,
} from "@curyo/contracts/protocol";

function formatPercent(value: number): string {
  return `${value.toFixed(2).replace(/\.?0+$/, "")}%`;
}

function percentFromBps(bps: number): number {
  return (bps / BPS_SCALE) * 100;
}

function formatDurationLabel(seconds: number): string {
  if (seconds % (24 * 60 * 60) === 0) {
    const days = seconds / (24 * 60 * 60);
    return `${days} day${days === 1 ? "" : "s"}`;
  }

  if (seconds % (60 * 60) === 0) {
    const hours = seconds / (60 * 60);
    return `${hours} hour${hours === 1 ? "" : "s"}`;
  }

  if (seconds % 60 === 0) {
    const minutes = seconds / 60;
    return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  }

  return `${seconds} seconds`;
}

const remainingPoolBps = BPS_SCALE - REWARD_SPLIT_BPS.revealedLoserRefund;

function effectiveRawSharePercent(bucketBps: number): number {
  return percentFromBps((remainingPoolBps * bucketBps) / BPS_SCALE);
}

export const protocolDocFacts = {
  blindPhaseDurationLabel: formatDurationLabel(DEFAULT_ROUND_CONFIG.epochDurationSeconds),
  revealGracePeriodLabel: formatDurationLabel(DEFAULT_REVEAL_GRACE_PERIOD_SECONDS),
  maxRoundDurationLabel: formatDurationLabel(DEFAULT_ROUND_CONFIG.maxDurationSeconds),
  minVotersLabel: String(DEFAULT_ROUND_CONFIG.minVoters),
  maxVotersLabel: DEFAULT_ROUND_CONFIG.maxVoters.toLocaleString(),
  revealedLoserRefundPercentLabel: formatPercent(percentFromBps(REWARD_SPLIT_BPS.revealedLoserRefund)),
  revealedLoserRefundLabel: `${formatPercent(percentFromBps(REWARD_SPLIT_BPS.revealedLoserRefund))} of raw losing stake`,
  remainingPoolLabel: formatPercent(percentFromBps(remainingPoolBps)),
  voterPoolShareLabel: `${formatPercent(percentFromBps(REWARD_SPLIT_BPS.voter))} of the remaining ${formatPercent(percentFromBps(remainingPoolBps))}`,
  submitterShareLabel: `${formatPercent(percentFromBps(REWARD_SPLIT_BPS.submitter))} of the remaining ${formatPercent(percentFromBps(remainingPoolBps))}`,
  consensusShareLabel: `${formatPercent(percentFromBps(REWARD_SPLIT_BPS.consensus))} of the remaining ${formatPercent(percentFromBps(remainingPoolBps))}`,
  frontendShareLabel: `${formatPercent(percentFromBps(PLATFORM_REWARD_SPLIT_BPS.frontend))} of the remaining ${formatPercent(percentFromBps(remainingPoolBps))}`,
  categoryShareLabel: `${formatPercent(percentFromBps(PLATFORM_REWARD_SPLIT_BPS.category))} of the remaining ${formatPercent(percentFromBps(remainingPoolBps))}`,
  treasuryShareLabel: `${formatPercent(percentFromBps(REWARD_SPLIT_BPS.treasury))} of the remaining ${formatPercent(percentFromBps(remainingPoolBps))}`,
  blindPhaseWeightLabel: formatPercent(percentFromBps(EPOCH_WEIGHT_BPS.blind)),
  openPhaseWeightLabel: formatPercent(percentFromBps(EPOCH_WEIGHT_BPS.informed)),
  earlyVoterAdvantageLabel: `${EPOCH_WEIGHT_BPS.blind / EPOCH_WEIGHT_BPS.informed}:1`,
} as const;

export const rewardSplitTableRows: [string, string][] = [
  ["Revealed losing voters", protocolDocFacts.revealedLoserRefundLabel],
  ["Content-specific voter pool", protocolDocFacts.voterPoolShareLabel],
  ["Content submitter", protocolDocFacts.submitterShareLabel],
  ["Consensus subsidy reserve", protocolDocFacts.consensusShareLabel],
  ["Frontend operators", protocolDocFacts.frontendShareLabel],
  ["Category submitter", protocolDocFacts.categoryShareLabel],
  ["Treasury", protocolDocFacts.treasuryShareLabel],
];

export const rewardSplitChartSlices = [
  { label: "Revealed loser rebate", value: percentFromBps(REWARD_SPLIT_BPS.revealedLoserRefund), color: "#8B5E34" },
  { label: "Voter pool (content-specific)", value: effectiveRawSharePercent(REWARD_SPLIT_BPS.voter), color: "#359EEE" },
  { label: "Consensus subsidy reserve", value: effectiveRawSharePercent(REWARD_SPLIT_BPS.consensus), color: "#F97316" },
  { label: "Content submitter", value: effectiveRawSharePercent(REWARD_SPLIT_BPS.submitter), color: "#FFC43D" },
  {
    label: "Frontend operators",
    value: effectiveRawSharePercent(PLATFORM_REWARD_SPLIT_BPS.frontend),
    color: "#EF476F",
  },
  {
    label: "Category submitters",
    value: effectiveRawSharePercent(PLATFORM_REWARD_SPLIT_BPS.category),
    color: "#2B7FCC",
  },
  { label: "Treasury", value: effectiveRawSharePercent(REWARD_SPLIT_BPS.treasury), color: "#029B7B" },
] as const;

export const whitepaperRewardSplitRows: string[][] = rewardSplitTableRows.map(([recipient, share]) => [
  recipient,
  share,
]);

export const whitepaperSettlementConfigRows: string[][] = [
  ["epochDuration", protocolDocFacts.blindPhaseDurationLabel, "Duration of each reward tier"],
  ["minVoters", protocolDocFacts.minVotersLabel, "Minimum revealed votes required for settlement"],
  [
    "maxDuration",
    protocolDocFacts.maxRoundDurationLabel,
    "Maximum round lifetime  -- below commit quorum rounds cancel; commit-quorum rounds can end as RevealFailed",
  ],
  [
    "revealGracePeriod",
    protocolDocFacts.revealGracePeriodLabel,
    "Time after each epoch during which all votes must be revealed before settlement",
  ],
];
