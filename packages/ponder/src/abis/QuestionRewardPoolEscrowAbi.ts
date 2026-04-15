export const QuestionRewardPoolEscrowAbi = [
  {
    type: "event",
    name: "RewardPoolCreated",
    inputs: [
      { name: "rewardPoolId", type: "uint256", indexed: true },
      { name: "contentId", type: "uint256", indexed: true },
      { name: "funder", type: "address", indexed: true },
      { name: "funderVoterId", type: "uint256", indexed: false },
      { name: "amount", type: "uint256", indexed: false },
      { name: "requiredVoters", type: "uint256", indexed: false },
      { name: "requiredSettledRounds", type: "uint256", indexed: false },
      { name: "startRoundId", type: "uint256", indexed: false },
      { name: "expiresAt", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "RewardPoolRoundQualified",
    inputs: [
      { name: "rewardPoolId", type: "uint256", indexed: true },
      { name: "contentId", type: "uint256", indexed: true },
      { name: "roundId", type: "uint256", indexed: true },
      { name: "allocation", type: "uint256", indexed: false },
      { name: "eligibleVoters", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "QuestionRewardClaimed",
    inputs: [
      { name: "rewardPoolId", type: "uint256", indexed: true },
      { name: "contentId", type: "uint256", indexed: true },
      { name: "roundId", type: "uint256", indexed: true },
      { name: "claimant", type: "address", indexed: false },
      { name: "voterId", type: "uint256", indexed: false },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "RewardPoolRefunded",
    inputs: [
      { name: "rewardPoolId", type: "uint256", indexed: true },
      { name: "funder", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
] as const;
