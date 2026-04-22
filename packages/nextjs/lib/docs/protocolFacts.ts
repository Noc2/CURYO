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

function formatFactor(value: number, digits = 3): string {
  return value.toFixed(digits).replace(/\.?0+$/, "");
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
const ROUND_CONFIG_BOUNDS = {
  minEpochDurationSeconds: 5 * 60,
  maxEpochDurationSeconds: 60 * 60,
  minRoundDurationSeconds: 60 * 60,
  maxRoundDurationSeconds: 30 * 24 * 60 * 60,
  minSettlementVoters: 2,
  maxSettlementVoters: 100,
  minVoterCap: 2,
  maxVoterCap: 10_000,
} as const;

function effectiveRawSharePercent(bucketBps: number): number {
  return percentFromBps((remainingPoolBps * bucketBps) / BPS_SCALE);
}

export const protocolDocFacts = {
  governanceProposalThresholdLabel: "1,000 cREP",
  governanceQuorumLabel: "4% of circulating supply (min 100,000 cREP)",
  governanceMinimumQuorumLabel: "100,000 cREP",
  governanceTimelockDelayLabel: "2 days",
  blindPhaseDurationLabel: formatDurationLabel(DEFAULT_ROUND_CONFIG.epochDurationSeconds),
  revealGracePeriodLabel: formatDurationLabel(DEFAULT_REVEAL_GRACE_PERIOD_SECONDS),
  maxRoundDurationLabel: formatDurationLabel(DEFAULT_ROUND_CONFIG.maxDurationSeconds),
  minVotersLabel: String(DEFAULT_ROUND_CONFIG.minVoters),
  maxVotersLabel: DEFAULT_ROUND_CONFIG.maxVoters.toLocaleString(),
  minBlindPhaseDurationLabel: formatDurationLabel(ROUND_CONFIG_BOUNDS.minEpochDurationSeconds),
  maxBlindPhaseDurationLabel: formatDurationLabel(ROUND_CONFIG_BOUNDS.maxEpochDurationSeconds),
  minRoundDurationLabel: formatDurationLabel(ROUND_CONFIG_BOUNDS.minRoundDurationSeconds),
  maxAllowedRoundDurationLabel: formatDurationLabel(ROUND_CONFIG_BOUNDS.maxRoundDurationSeconds),
  minSettlementVotersLabel: String(ROUND_CONFIG_BOUNDS.minSettlementVoters),
  maxSettlementVotersLabel: String(ROUND_CONFIG_BOUNDS.maxSettlementVoters),
  minVoterCapLabel: String(ROUND_CONFIG_BOUNDS.minVoterCap),
  maxVoterCapLabel: ROUND_CONFIG_BOUNDS.maxVoterCap.toLocaleString(),
  roundConfigBoundsSummaryLabel: `${formatDurationLabel(
    ROUND_CONFIG_BOUNDS.minEpochDurationSeconds,
  )}-${formatDurationLabel(ROUND_CONFIG_BOUNDS.maxEpochDurationSeconds)} blind phase, ${formatDurationLabel(
    ROUND_CONFIG_BOUNDS.minRoundDurationSeconds,
  )}-${formatDurationLabel(ROUND_CONFIG_BOUNDS.maxRoundDurationSeconds)} max duration, ${
    ROUND_CONFIG_BOUNDS.minSettlementVoters
  }-${ROUND_CONFIG_BOUNDS.maxSettlementVoters} settlement voters, ${ROUND_CONFIG_BOUNDS.minVoterCap}-${ROUND_CONFIG_BOUNDS.maxVoterCap.toLocaleString()} voter cap`,
  revealedLoserRefundPercentLabel: formatPercent(percentFromBps(REWARD_SPLIT_BPS.revealedLoserRefund)),
  revealedLoserRefundLabel: `${formatPercent(percentFromBps(REWARD_SPLIT_BPS.revealedLoserRefund))} of raw losing stake`,
  revealedLoserRefundShortLabel: `${formatPercent(percentFromBps(REWARD_SPLIT_BPS.revealedLoserRefund))} of raw`,
  remainingPoolLabel: formatPercent(percentFromBps(remainingPoolBps)),
  voterPoolNetSharePercentLabel: formatPercent(percentFromBps(REWARD_SPLIT_BPS.voter)),
  submitterNetSharePercentLabel: "0%",
  consensusNetSharePercentLabel: formatPercent(percentFromBps(REWARD_SPLIT_BPS.consensus)),
  frontendNetSharePercentLabel: formatPercent(percentFromBps(PLATFORM_REWARD_SPLIT_BPS.frontend)),
  treasuryNetSharePercentLabel: formatPercent(percentFromBps(REWARD_SPLIT_BPS.treasury)),
  voterPoolShareLabel: `${formatPercent(percentFromBps(REWARD_SPLIT_BPS.voter))} of the remaining ${formatPercent(percentFromBps(remainingPoolBps))}`,
  submitterShareLabel: `0% of the remaining ${formatPercent(percentFromBps(remainingPoolBps))}`,
  consensusShareLabel: `${formatPercent(percentFromBps(REWARD_SPLIT_BPS.consensus))} of the remaining ${formatPercent(percentFromBps(remainingPoolBps))}`,
  frontendShareLabel: `${formatPercent(percentFromBps(PLATFORM_REWARD_SPLIT_BPS.frontend))} of the remaining ${formatPercent(percentFromBps(remainingPoolBps))}`,
  treasuryShareLabel: `${formatPercent(percentFromBps(REWARD_SPLIT_BPS.treasury))} of the remaining ${formatPercent(percentFromBps(remainingPoolBps))}`,
  voterPoolShortLabel: `${formatPercent(percentFromBps(REWARD_SPLIT_BPS.voter))} of remaining`,
  submitterShortLabel: "0% of remaining",
  consensusShortLabel: `${formatPercent(percentFromBps(REWARD_SPLIT_BPS.consensus))} of remaining`,
  frontendShortLabel: `${formatPercent(percentFromBps(PLATFORM_REWARD_SPLIT_BPS.frontend))} of remaining`,
  treasuryShortLabel: `${formatPercent(percentFromBps(REWARD_SPLIT_BPS.treasury))} of remaining`,
  voterPoolEffectiveRawPercentLabel: formatPercent(effectiveRawSharePercent(REWARD_SPLIT_BPS.voter)),
  voterPoolEffectiveRawFactorLabel: formatFactor(effectiveRawSharePercent(REWARD_SPLIT_BPS.voter) / 100),
  rewardSplitSummaryLabel: `${formatPercent(percentFromBps(REWARD_SPLIT_BPS.voter))} voters / ${formatPercent(percentFromBps(REWARD_SPLIT_BPS.consensus))} consensus / ${formatPercent(percentFromBps(PLATFORM_REWARD_SPLIT_BPS.frontend))} frontend / ${formatPercent(percentFromBps(REWARD_SPLIT_BPS.treasury))} treasury`,
  blindPhaseWeightLabel: formatPercent(percentFromBps(EPOCH_WEIGHT_BPS.blind)),
  openPhaseWeightLabel: formatPercent(percentFromBps(EPOCH_WEIGHT_BPS.informed)),
  earlyVoterAdvantageLabel: `${EPOCH_WEIGHT_BPS.blind / EPOCH_WEIGHT_BPS.informed}:1`,
} as const;

const rewardSplitTableRows: [string, string][] = [
  ["Revealed losing voters", protocolDocFacts.revealedLoserRefundLabel],
  ["Content-specific voter pool", protocolDocFacts.voterPoolShareLabel],
  ["Consensus subsidy reserve", protocolDocFacts.consensusShareLabel],
  ["Frontend operators", protocolDocFacts.frontendShareLabel],
  ["Treasury", protocolDocFacts.treasuryShareLabel],
];

export const rewardSplitChartSlices = [
  {
    label: "Revealed loser rebate",
    value: percentFromBps(REWARD_SPLIT_BPS.revealedLoserRefund),
    displayValue: protocolDocFacts.revealedLoserRefundShortLabel,
    color: "#7E8996",
  },
  {
    label: "Voter pool (content-specific)",
    value: effectiveRawSharePercent(REWARD_SPLIT_BPS.voter),
    displayValue: protocolDocFacts.voterPoolShortLabel,
    color: "#F26426",
  },
  {
    label: "Consensus subsidy reserve",
    value: effectiveRawSharePercent(REWARD_SPLIT_BPS.consensus),
    displayValue: protocolDocFacts.consensusShortLabel,
    color: "#B3341B",
  },
  {
    label: "Frontend operators",
    value: effectiveRawSharePercent(PLATFORM_REWARD_SPLIT_BPS.frontend),
    displayValue: protocolDocFacts.frontendShortLabel,
    color: "rgba(242, 100, 38, 0.6)",
  },
  {
    label: "Treasury",
    value: effectiveRawSharePercent(REWARD_SPLIT_BPS.treasury),
    displayValue: protocolDocFacts.treasuryShortLabel,
    color: "rgba(245, 240, 235, 0.55)",
  },
] as const;

export const whitepaperRewardSplitRows: string[][] = rewardSplitTableRows.map(([recipient, share]) => [
  recipient,
  share,
]);

export const whitepaperSettlementConfigRows: string[][] = [
  [
    "epochDuration",
    `${protocolDocFacts.blindPhaseDurationLabel} default`,
    "Creator-selected blind/reward-tier duration within governance bounds",
  ],
  [
    "minVoters",
    `${protocolDocFacts.minVotersLabel} default`,
    "Creator-selected minimum revealed votes required for settlement",
  ],
  [
    "maxDuration",
    `${protocolDocFacts.maxRoundDurationLabel} default`,
    "Creator-selected maximum round lifetime  -- below commit quorum rounds cancel; commit-quorum rounds can end as RevealFailed",
  ],
  [
    "maxVoters",
    `${protocolDocFacts.maxVotersLabel} default`,
    "Creator-selected cap on voters for the question and upper bound for bounty required-voter terms",
  ],
  [
    "revealGracePeriod",
    protocolDocFacts.revealGracePeriodLabel,
    "Time after each epoch during which all votes must be revealed before settlement",
  ],
];

export const whitepaperRoundConfigBoundsRows: string[][] = [
  ["blind phase", `${protocolDocFacts.minBlindPhaseDurationLabel} to ${protocolDocFacts.maxBlindPhaseDurationLabel}`],
  ["max duration", `${protocolDocFacts.minRoundDurationLabel} to ${protocolDocFacts.maxAllowedRoundDurationLabel}`],
  ["settlement voters", `${protocolDocFacts.minSettlementVotersLabel} to ${protocolDocFacts.maxSettlementVotersLabel}`],
  ["voter cap", `${protocolDocFacts.minVoterCapLabel} to ${protocolDocFacts.maxVoterCapLabel}`],
];
