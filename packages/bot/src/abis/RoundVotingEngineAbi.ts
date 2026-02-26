/**
 * ABI for RoundVotingEngine — only the functions used by the bot.
 * Extracted from packages/foundry/out/RoundVotingEngine.sol/RoundVotingEngine.json
 */
export const RoundVotingEngineAbi = [
  {
    type: "function",
    name: "MAX_STAKE",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "MIN_STAKE",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "VOTE_COOLDOWN",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "commitVote",
    inputs: [
      { name: "contentId", type: "uint256" },
      { name: "commitHash", type: "bytes32" },
      { name: "ciphertext", type: "bytes" },
      { name: "stakeAmount", type: "uint256" },
      { name: "frontend", type: "address" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
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
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "hasCommitted",
    inputs: [
      { name: "", type: "uint256" },
      { name: "", type: "uint256" },
      { name: "", type: "address" },
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "lastVoteTimestamp",
    inputs: [
      { name: "", type: "uint256" },
      { name: "", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
] as const;
