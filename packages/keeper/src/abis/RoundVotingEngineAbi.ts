/**
 * ABI for RoundVotingEngine — only the functions used by the keeper.
 * Regenerated from packages/ponder/abis/RoundVotingEngineAbi.ts
 */
export const RoundVotingEngineAbi = [
  {
    type: "function",
    name: "config",
    inputs: [],
    outputs: [
      { name: "minEpochBlocks", type: "uint64" },
      { name: "maxEpochBlocks", type: "uint64" },
      { name: "maxDuration", type: "uint256" },
      { name: "minVoters", type: "uint256" },
      { name: "maxVoters", type: "uint256" },
      { name: "baseRateBps", type: "uint16" },
      { name: "growthRateBps", type: "uint16" },
      { name: "maxProbBps", type: "uint16" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getActiveRoundId",
    inputs: [{ name: "contentId", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getRound",
    inputs: [
      { name: "contentId", type: "uint256" },
      { name: "roundId", type: "uint256" },
    ],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "startTime", type: "uint256" },
          { name: "startBlock", type: "uint64" },
          { name: "state", type: "uint8" },
          { name: "voteCount", type: "uint256" },
          { name: "totalStake", type: "uint256" },
          { name: "totalUpStake", type: "uint256" },
          { name: "totalDownStake", type: "uint256" },
          { name: "totalUpShares", type: "uint256" },
          { name: "totalDownShares", type: "uint256" },
          { name: "upCount", type: "uint256" },
          { name: "downCount", type: "uint256" },
          { name: "upWins", type: "bool" },
          { name: "settledAt", type: "uint256" },
          { name: "thresholdReachedAt", type: "uint256" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "trySettle",
    inputs: [{ name: "contentId", type: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "cancelExpiredRound",
    inputs: [
      { name: "contentId", type: "uint256" },
      { name: "roundId", type: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;
