#!/usr/bin/env node
import { createPublicClient, http, isAddress } from "viem";
import { foundry } from "viem/chains";

const CATEGORY_REGISTRY_ABI = [
  {
    name: "getCategoryByDomain",
    type: "function",
    inputs: [{ name: "domain", type: "string" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "id", type: "uint256" },
          { name: "name", type: "string" },
          { name: "domain", type: "string" },
          { name: "subcategories", type: "string[]" },
          { name: "submitter", type: "address" },
          { name: "stakeAmount", type: "uint256" },
          { name: "status", type: "uint8" },
          { name: "proposalId", type: "uint256" },
          { name: "createdAt", type: "uint256" },
        ],
      },
    ],
    stateMutability: "view",
  },
];

const [, , registryAddress, domain, rpcUrl = "http://127.0.0.1:8545"] = process.argv;

if (!isAddress(registryAddress || "")) {
  console.error("ERROR: resolveCategoryId requires a CategoryRegistry address");
  process.exit(64);
}

if (!domain) {
  console.error("ERROR: resolveCategoryId requires a category domain");
  process.exit(64);
}

const publicClient = createPublicClient({
  chain: foundry,
  transport: http(rpcUrl),
});

try {
  const category = await publicClient.readContract({
    address: registryAddress,
    abi: CATEGORY_REGISTRY_ABI,
    functionName: "getCategoryByDomain",
    args: [domain],
  });
  const categoryId = "id" in category ? category.id : category[0];
  if (categoryId === 0n) {
    throw new Error("resolved category id is zero");
  }
  process.stdout.write(categoryId.toString());
} catch (error) {
  console.error(`ERROR: Could not resolve category domain ${domain} from CategoryRegistry`);
  if (error instanceof Error && error.shortMessage) {
    console.error(error.shortMessage);
  } else if (error instanceof Error && error.message) {
    console.error(error.message);
  }
  process.exit(1);
}
