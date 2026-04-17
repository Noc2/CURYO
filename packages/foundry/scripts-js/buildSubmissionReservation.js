import { createPublicClient, encodeAbiParameters, http, keccak256, parseAbi } from "viem";

const args = process.argv.slice(2);
if (![9, 11, 13].includes(args.length)) {
  console.error(
    "Usage: node buildSubmissionReservation.js <rpcUrl> <registry> <submitter> <contextUrl> <imageUrlsJson> <videoUrl> <title> <description> <tags> <categoryId> <salt> [rewardAsset] [rewardAmount]",
  );
  process.exit(1);
}

const DEFAULT_REWARD_ASSET = 0n;
const DEFAULT_REWARD_AMOUNT = 1_000_000n;

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

function assertHttpsUrl(value, label) {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" || /\s/.test(value)) throw new Error("invalid");
  } catch {
    console.error(`${label} must be a valid HTTPS URL.`);
    process.exit(1);
  }
}

function assertSupportedImageUrls(imageUrls, { allowEmpty = false } = {}) {
  if (!allowEmpty && imageUrls.length === 0) {
    console.error("At least one image URL is required.");
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

function parseImageUrls(value, { allowEmpty = false } = {}) {
  const trimmed = value.trim();
  if (!trimmed) {
    if (allowEmpty) return [];
    console.error("Image URL array is required.");
    process.exit(1);
  }
  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (
        Array.isArray(parsed) &&
        parsed.every(item => typeof item === "string" && item.trim().length > 0)
      ) {
        assertSupportedImageUrls(parsed, { allowEmpty });
        return parsed;
      }
    } catch {
      // Fall through to the explicit error below.
    }

    console.error("Invalid image URL array JSON. Expected a JSON string array.");
    process.exit(1);
  }

  assertSupportedImageUrls([trimmed], { allowEmpty });
  return [trimmed];
}

function toSubmissionMedia(value) {
  const trimmed = value.trim();
  if (trimmed.startsWith("[")) {
    return { imageUrls: parseImageUrls(trimmed), videoUrl: "" };
  }

  if (isSupportedYouTubeUrl(trimmed)) {
    return { imageUrls: [], videoUrl: trimmed };
  }

  return { imageUrls: parseImageUrls(trimmed), videoUrl: "" };
}

function parseArgs(rawArgs) {
  if (rawArgs.length === 9) {
    const [rpcUrl, registry, submitter, mediaUrlOrImageArrayJson, title, description, tags, categoryId, salt] = rawArgs;
    const media = toSubmissionMedia(mediaUrlOrImageArrayJson);
    return {
      rpcUrl,
      registry,
      submitter,
      contextUrl: media.videoUrl || media.imageUrls[0],
      media,
      title,
      description,
      tags,
      categoryId,
      salt,
      rewardAsset: DEFAULT_REWARD_ASSET,
      rewardAmount: DEFAULT_REWARD_AMOUNT,
    };
  }

  const [
    rpcUrl,
    registry,
    submitter,
    contextUrl,
    imageUrlsJson,
    videoUrl,
    title,
    description,
    tags,
    categoryId,
    salt,
    rewardAsset = DEFAULT_REWARD_ASSET.toString(),
    rewardAmount = DEFAULT_REWARD_AMOUNT.toString(),
  ] = rawArgs;
  const imageUrls = parseImageUrls(imageUrlsJson, { allowEmpty: true });
  const trimmedVideoUrl = videoUrl.trim();
  if (trimmedVideoUrl && !isSupportedYouTubeUrl(trimmedVideoUrl)) {
    console.error(`Unsupported video URL: ${trimmedVideoUrl}`);
    process.exit(1);
  }
  if (trimmedVideoUrl && imageUrls.length > 0) {
    console.error("Choose images or video, not both.");
    process.exit(1);
  }
  return {
    rpcUrl,
    registry,
    submitter,
    contextUrl,
    media: { imageUrls, videoUrl: trimmedVideoUrl },
    title,
    description,
    tags,
    categoryId,
    salt,
    rewardAsset: BigInt(rewardAsset),
    rewardAmount: BigInt(rewardAmount),
  };
}

const {
  rpcUrl,
  registry,
  submitter,
  contextUrl,
  media,
  title,
  description,
  tags,
  categoryId,
  salt,
  rewardAsset,
  rewardAmount,
} = parseArgs(args);
const publicClient = createPublicClient({
  transport: http(rpcUrl),
});
assertHttpsUrl(contextUrl, "Context URL");
const [, submissionKey] = await publicClient.readContract({
  address: registry,
  abi: parseAbi([
    "function previewQuestionSubmissionKey(string contextUrl, string[] imageUrls, string videoUrl, string title, string description, string tags, uint256 categoryId) view returns (uint256 resolvedCategoryId, bytes32 submissionKey)",
  ]),
  functionName: "previewQuestionSubmissionKey",
  args: [contextUrl, media.imageUrls, media.videoUrl, title, description, tags, BigInt(categoryId)],
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
      { type: "uint8" },
      { type: "uint256" },
    ],
    [submissionKey, title, description, tags, BigInt(categoryId), salt, submitter, Number(rewardAsset), rewardAmount],
  ),
);

console.log(revealCommitment);
