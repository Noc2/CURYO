export const ParticipationPoolAbi = [
  {
    type: "function",
    name: "distributeReward",
    inputs: [
      { name: "voter", type: "address", internalType: "address" },
      { name: "amount", type: "uint256", internalType: "uint256" },
    ],
    outputs: [
      { name: "paidAmount", type: "uint256", internalType: "uint256" },
    ],
    stateMutability: "nonpayable",
  },
] as const;
