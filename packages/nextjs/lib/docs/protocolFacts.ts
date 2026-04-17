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

function effectiveRawSharePercent(bucketBps: number): number {
  return percentFromBps((remainingPoolBps * bucketBps) / BPS_SCALE);
}

export const protocolDocFacts = {
  governanceProposalThresholdLabel: "10,000 cREP",
  governanceQuorumLabel: "4% of circulating supply (min 100,000 cREP)",
  governanceMinimumQuorumLabel: "100,000 cREP",
  governanceTimelockDelayLabel: "2 days",
  blindPhaseDurationLabel: formatDurationLabel(DEFAULT_ROUND_CONFIG.epochDurationSeconds),
  revealGracePeriodLabel: formatDurationLabel(DEFAULT_REVEAL_GRACE_PERIOD_SECONDS),
  maxRoundDurationLabel: formatDurationLabel(DEFAULT_ROUND_CONFIG.maxDurationSeconds),
  minVotersLabel: String(DEFAULT_ROUND_CONFIG.minVoters),
  maxVotersLabel: DEFAULT_ROUND_CONFIG.maxVoters.toLocaleString(),
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
  submitterShareLabel: "0% of the remaining 85%",
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
