#!/usr/bin/env node
import { createPublicClient, http, isAddress } from "viem";
import { foundry } from "viem/chains";

const CATEGORY_REGISTRY_ABI = [
  {
    name: "getCategoryBySlug",
    type: "function",
    inputs: [{ name: "slug", type: "string" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "id", type: "uint256" },
          { name: "name", type: "string" },
          { name: "slug", type: "string" },
          { name: "subcategories", type: "string[]" },
          { name: "createdAt", type: "uint256" },
        ],
      },
    ],
    stateMutability: "view",
  },
];

const [, , registryAddress, slug, rpcUrl = "http://127.0.0.1:8545"] =
  process.argv;

if (!isAddress(registryAddress || "")) {
  console.error("ERROR: resolveCategoryId requires a CategoryRegistry address");
  process.exit(64);
}

if (!slug) {
  console.error("ERROR: resolveCategoryId requires a category slug");
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
    functionName: "getCategoryBySlug",
    args: [slug],
  });
  const categoryId = "id" in category ? category.id : category[0];
  if (categoryId === 0n) {
    throw new Error("resolved category id is zero");
  }
  process.stdout.write(categoryId.toString());
} catch (error) {
  console.error(
    `ERROR: Could not resolve category slug ${slug} from CategoryRegistry`,
  );
  if (error instanceof Error && error.shortMessage) {
    console.error(error.shortMessage);
  } else if (error instanceof Error && error.message) {
    console.error(error.message);
  }
  process.exit(1);
}
