import { createPublicClient, encodeAbiParameters, http, keccak256, parseAbi } from "viem";

const args = process.argv.slice(2);
if (args.length !== 9) {
  console.error(
    "Usage: node buildSubmissionReservation.js <rpcUrl> <registry> <submitter> <url> <title> <description> <tags> <categoryId> <salt>",
  );
  process.exit(1);
}

const [rpcUrl, registry, submitter, url, title, description, tags, categoryId, salt] = args;
const publicClient = createPublicClient({
  transport: http(rpcUrl),
});

const [, submissionKey] = await publicClient.readContract({
  address: registry,
  abi: parseAbi([
    "function previewQuestionSubmissionKey(string url, string title, string description, string tags, uint256 categoryId) view returns (uint256 resolvedCategoryId, bytes32 submissionKey)",
  ]),
  functionName: "previewQuestionSubmissionKey",
  args: [url, title, description, tags, BigInt(categoryId)],
});

const revealCommitment = keccak256(
  encodeAbiParameters(
    [
      { type: "bytes32" },
      { type: "string" },
      { type: "string" },
      { type: "string" },
      { type: "uint256" },
      { type: "bytes32" },
      { type: "address" },
    ],
    [submissionKey, title, description, tags, BigInt(categoryId), salt, submitter],
  ),
);

console.log(revealCommitment);
