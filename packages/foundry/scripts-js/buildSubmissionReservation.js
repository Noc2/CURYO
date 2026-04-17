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

const MAX_SUBMISSION_IMAGE_URLS = 4;
const DIRECT_IMAGE_URL_PATTERN = /^https:\/\/\S+\.(?:avif|gif|jpe?g|png|webp)(?:[?#]\S*)?$/i;

function isSupportedYouTubeUrl(value) {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:") return false;

    if (parsed.hostname === "youtu.be") {
      return parsed.pathname.length > 1;
    }

    if (parsed.hostname === "www.youtube.com" && parsed.pathname.startsWith("/embed/")) {
      return parsed.pathname.length > "/embed/".length;
    }

    const isWatchHost =
      parsed.hostname === "youtube.com" ||
      parsed.hostname === "www.youtube.com" ||
      parsed.hostname === "m.youtube.com";
    return isWatchHost && parsed.pathname === "/watch" && parsed.searchParams.has("v");
  } catch {
    return false;
  }
}

function assertSupportedImageUrls(imageUrls) {
  if (imageUrls.length === 0) {
    console.error("At least one image URL is required when no YouTube URL is provided.");
    process.exit(1);
  }
  if (imageUrls.length > MAX_SUBMISSION_IMAGE_URLS) {
    console.error(`Expected at most ${MAX_SUBMISSION_IMAGE_URLS} image URLs.`);
    process.exit(1);
  }
  const unsupportedImageUrl = imageUrls.find(item => !DIRECT_IMAGE_URL_PATTERN.test(item));
  if (unsupportedImageUrl) {
    console.error(`Unsupported image URL: ${unsupportedImageUrl}`);
    process.exit(1);
  }
}

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
        assertSupportedImageUrls(parsed);
        return { imageUrls: parsed, videoUrl: "" };
      }
    } catch {
      // Fall through to the explicit error below.
    }

    console.error("Invalid image URL array JSON. Expected a non-empty JSON string array.");
    process.exit(1);
  }

  if (isSupportedYouTubeUrl(trimmed)) {
    return { imageUrls: [], videoUrl: trimmed };
  }

  assertSupportedImageUrls([trimmed]);
  return { imageUrls: [trimmed], videoUrl: "" };
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
