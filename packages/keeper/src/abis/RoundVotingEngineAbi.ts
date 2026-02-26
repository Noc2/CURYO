/**
 * ABI for RoundVotingEngine — only the functions used by the keeper.
 * Extracted from packages/foundry/out/RoundVotingEngine.sol/RoundVotingEngine.json
 */
export const RoundVotingEngineAbi = [
  {
    type: "function",
    name: "config",
    inputs: [],
    outputs: [
      { name: "epochDuration", type: "uint256" },
      { name: "maxDuration", type: "uint256" },
      { name: "minVoters", type: "uint256" },
      { name: "maxVoters", type: "uint256" },
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
          { name: "state", type: "uint8" },
          { name: "voteCount", type: "uint256" },
          { name: "revealedCount", type: "uint256" },
          { name: "totalStake", type: "uint256" },
          { name: "upPool", type: "uint256" },
          { name: "downPool", type: "uint256" },
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
    name: "getRoundCommitCount",
    inputs: [
      { name: "contentId", type: "uint256" },
      { name: "roundId", type: "uint256" },
    ],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getRoundCommitHash",
    inputs: [
      { name: "contentId", type: "uint256" },
      { name: "roundId", type: "uint256" },
      { name: "index", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bytes32" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getCommit",
    inputs: [
      { name: "contentId", type: "uint256" },
      { name: "roundId", type: "uint256" },
      { name: "commitHash", type: "bytes32" },
    ],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "voter", type: "address" },
          { name: "stakeAmount", type: "uint256" },
          { name: "ciphertext", type: "bytes" },
          { name: "frontend", type: "address" },
          { name: "revealableAfter", type: "uint256" },
          { name: "revealed", type: "bool" },
          { name: "isUp", type: "bool" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "revealVote",
    inputs: [
      { name: "contentId", type: "uint256" },
      { name: "roundId", type: "uint256" },
      { name: "commitHash", type: "bytes32" },
      { name: "isUp", type: "bool" },
      { name: "salt", type: "bytes32" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "revealVoteByCommitKey",
    inputs: [
      { name: "contentId", type: "uint256" },
      { name: "roundId", type: "uint256" },
      { name: "commitKey", type: "bytes32" },
      { name: "isUp", type: "bool" },
      { name: "salt", type: "bytes32" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "settleRound",
    inputs: [
      { name: "contentId", type: "uint256" },
      { name: "roundId", type: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "processUnrevealedVotes",
    inputs: [
      { name: "contentId", type: "uint256" },
      { name: "roundId", type: "uint256" },
      { name: "startIndex", type: "uint256" },
      { name: "count", type: "uint256" },
    ],
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
