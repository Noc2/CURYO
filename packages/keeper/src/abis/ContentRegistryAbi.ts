/**
 * ABI for ContentRegistry — only the functions used by the keeper.
 * Extracted from packages/foundry/out/ContentRegistry.sol/ContentRegistry.json
 */
export const ContentRegistryAbi = [
  {
    type: "function",
    name: "nextContentId",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getContent",
    inputs: [{ name: "contentId", type: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "id", type: "uint256" },
          { name: "contentHash", type: "bytes32" },
          { name: "submitter", type: "address" },
          { name: "submitterStake", type: "uint256" },
          { name: "createdAt", type: "uint256" },
          { name: "lastActivityAt", type: "uint256" },
          { name: "status", type: "uint8" },
          { name: "dormantCount", type: "uint8" },
          { name: "reviver", type: "address" },
          { name: "submitterStakeReturned", type: "bool" },
          { name: "rating", type: "uint256" },
          { name: "categoryId", type: "uint256" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "markDormant",
    inputs: [{ name: "contentId", type: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;
