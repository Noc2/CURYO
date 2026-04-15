export const QuestionBountyEscrowAbi = [
  {
    type: "event",
    name: "BountyCreated",
    inputs: [
      { name: "bountyId", type: "uint256", indexed: true },
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
    name: "BountyRoundQualified",
    inputs: [
      { name: "bountyId", type: "uint256", indexed: true },
      { name: "contentId", type: "uint256", indexed: true },
      { name: "roundId", type: "uint256", indexed: true },
      { name: "allocation", type: "uint256", indexed: false },
      { name: "eligibleVoters", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "BountyRewardClaimed",
    inputs: [
      { name: "bountyId", type: "uint256", indexed: true },
      { name: "contentId", type: "uint256", indexed: true },
      { name: "roundId", type: "uint256", indexed: true },
      { name: "claimant", type: "address", indexed: false },
      { name: "voterId", type: "uint256", indexed: false },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "BountyRefunded",
    inputs: [
      { name: "bountyId", type: "uint256", indexed: true },
      { name: "funder", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
] as const;
