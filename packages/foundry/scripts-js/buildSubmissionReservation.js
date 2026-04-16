import { createPublicClient, encodeAbiParameters, http, keccak256, parseAbi } from "viem";

const args = process.argv.slice(2);
if (args.length !== 9) {
  console.error(
    "Usage: node buildSubmissionReservation.js <rpcUrl> <registry> <submitter> <mediaUrlOrImageArrayJson> <title> <description> <tags> <categoryId> <salt>",
  );
  process.exit(1);
}

const [rpcUrl, registry, submitter, url, title, description, tags, categoryId, salt] = args;
const publicClient = createPublicClient({
  transport: http(rpcUrl),
});

function toSubmissionMedia(value) {
  const trimmed = value.trim();
  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (
        Array.isArray(parsed) &&
        parsed.length > 0 &&
        parsed.every(item => typeof item === "string" && item.trim().length > 0)
      ) {
        return { imageUrls: parsed, videoUrl: "" };
      }
    } catch {
      // Fall through to the explicit error below.
    }

    console.error("Invalid image URL array JSON. Expected a non-empty JSON string array.");
    process.exit(1);
  }

  try {
    const parsed = new URL(value);
    const hostname = parsed.hostname.toLowerCase();
    const isYouTube = hostname === "youtu.be" || hostname === "youtube.com" || hostname.endsWith(".youtube.com");
    return isYouTube ? { imageUrls: [], videoUrl: value } : { imageUrls: [value], videoUrl: "" };
  } catch {
    return { imageUrls: [value], videoUrl: "" };
  }
}

const media = toSubmissionMedia(url);
const [, submissionKey] = await publicClient.readContract({
  address: registry,
  abi: parseAbi([
    "function previewQuestionMediaSubmissionKey(string[] imageUrls, string videoUrl, string title, string description, string tags, uint256 categoryId) view returns (uint256 resolvedCategoryId, bytes32 submissionKey)",
  ]),
  functionName: "previewQuestionMediaSubmissionKey",
  args: [media.imageUrls, media.videoUrl, title, description, tags, BigInt(categoryId)],
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
