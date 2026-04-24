import {
  encodeAbiParameters,
  encodeFunctionData,
  keccak256,
  parseAbi,
} from "viem";

const DEFAULT_QUESTION_METADATA_HASH =
  "0xed39b36e9ce5c1bfc657909c2f687347be2de998bc871eb8d33df17fdfa0d8cd";
const DEFAULT_RESULT_SPEC_HASH =
  "0x8e5f27bc3269c62c92754f76279bd83838462060fc6cd77411b7407027cfa11f";
const MAX_SUBMISSION_IMAGE_URLS = 4;
const DIRECT_IMAGE_URL_PATTERN =
  /^https:\/\/\S+\.(?:avif|gif|jpe?g|png|webp)(?:[?#]\S*)?$/i;

const abi = parseAbi([
  "function submitQuestionBundleWithRewardAndRoundConfig((string contextUrl,string[] imageUrls,string videoUrl,string title,string description,string tags,uint256 categoryId,bytes32 salt,(bytes32 questionMetadataHash,bytes32 resultSpecHash) spec)[] questions,(uint8 asset,uint256 amount,uint256 requiredVoters,uint256 requiredSettledRounds,uint256 bountyClosesAt,uint256 feedbackClosesAt) rewardTerms,(uint32 epochDuration,uint32 maxDuration,uint16 minVoters,uint16 maxVoters) roundConfig)",
]);

function fail(message) {
  console.error(message);
  process.exit(1);
}

function usage() {
  fail(
    "Usage: node buildQuestionBundleReservation.js <submitter> <rewardAsset> <rewardAmount> <requiredVoters> <requiredSettledRounds> <bountyClosesAt> <feedbackClosesAt> <epochDuration> <maxDuration> <minVoters> <maxVoters> -- <contextUrl> <imageUrlsJson> <videoUrl> <title> <description> <tags> <categoryId> <salt> [question args...]"
  );
}

function assertHttpsUrl(value, label) {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" || /\s/.test(value))
      throw new Error("invalid");
  } catch {
    fail(`${label} must be a valid HTTPS URL.`);
  }
}

function assertBytes32(value, label) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(value)) {
    fail(`${label} must be a bytes32 hex string.`);
  }
}

function isSupportedYouTubeUrl(value) {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:") return false;

    if (parsed.hostname === "youtu.be") {
      return parsed.pathname.length > 1;
    }

    if (
      parsed.hostname === "www.youtube.com" &&
      parsed.pathname.startsWith("/embed/")
    ) {
      return parsed.pathname.length > "/embed/".length;
    }

    const isWatchHost =
      parsed.hostname === "youtube.com" ||
      parsed.hostname === "www.youtube.com" ||
      parsed.hostname === "m.youtube.com";
    return (
      isWatchHost &&
      parsed.pathname === "/watch" &&
      parsed.searchParams.has("v")
    );
  } catch {
    return false;
  }
}

function parseImageUrls(value) {
  const trimmed = value.trim();
  if (!trimmed) {
    fail("Image URL array is required.");
  }

  try {
    const parsed = JSON.parse(trimmed);
    if (
      !Array.isArray(parsed) ||
      parsed.some(
        (item) => typeof item !== "string" || item.trim().length === 0
      )
    ) {
      fail("Invalid image URL array JSON. Expected a JSON string array.");
    }
    if (parsed.length > MAX_SUBMISSION_IMAGE_URLS) {
      fail(`Expected at most ${MAX_SUBMISSION_IMAGE_URLS} image URLs.`);
    }
    const unsupportedImageUrl = parsed.find(
      (item) => !DIRECT_IMAGE_URL_PATTERN.test(item)
    );
    if (unsupportedImageUrl) {
      fail(`Unsupported image URL: ${unsupportedImageUrl}`);
    }
    return parsed;
  } catch (error) {
    if (error instanceof SyntaxError) {
      fail("Invalid image URL array JSON. Expected a JSON string array.");
    }
    throw error;
  }
}

function parseQuestionArgs(questionArgs) {
  if (questionArgs.length < 16 || questionArgs.length % 8 !== 0) {
    usage();
  }

  const questions = [];
  for (let index = 0; index < questionArgs.length; index += 8) {
    const [
      contextUrl,
      imageUrlsJson,
      videoUrl,
      title,
      description,
      tags,
      categoryId,
      salt,
    ] = questionArgs.slice(index, index + 8);
    const imageUrls = parseImageUrls(imageUrlsJson);
    const trimmedVideoUrl = videoUrl.trim();
    assertHttpsUrl(contextUrl, "Context URL");
    if (trimmedVideoUrl && !isSupportedYouTubeUrl(trimmedVideoUrl)) {
      fail(`Unsupported video URL: ${trimmedVideoUrl}`);
    }
    if (trimmedVideoUrl && imageUrls.length > 0) {
      fail("Choose images or video, not both.");
    }
    assertBytes32(salt, "Salt");

    questions.push({
      contextUrl,
      imageUrls,
      videoUrl: trimmedVideoUrl,
      title,
      description,
      tags,
      categoryId: BigInt(categoryId),
      salt,
    });
  }
  return questions;
}

function parseArgs(rawArgs) {
  const separatorIndex = rawArgs.indexOf("--");
  if (separatorIndex !== 11) {
    usage();
  }

  const [
    submitter,
    rewardAsset,
    rewardAmount,
    requiredVoters,
    requiredSettledRounds,
    bountyClosesAt,
    feedbackClosesAt,
    epochDuration,
    maxDuration,
    minVoters,
    maxVoters,
  ] = rawArgs.slice(0, separatorIndex);
  const normalizedSubmitter = submitter.trim();
  if (!/^0x[0-9a-fA-F]{40}$/.test(normalizedSubmitter)) {
    fail("Submitter must be an address.");
  }

  return {
    submitter: normalizedSubmitter,
    rewardTerms: {
      asset: Number(rewardAsset),
      amount: BigInt(rewardAmount),
      requiredVoters: BigInt(requiredVoters),
      requiredSettledRounds: BigInt(requiredSettledRounds),
      bountyClosesAt: BigInt(bountyClosesAt),
      feedbackClosesAt: BigInt(feedbackClosesAt),
    },
    roundConfig: {
      epochDuration: Number(epochDuration),
      maxDuration: Number(maxDuration),
      minVoters: Number(minVoters),
      maxVoters: Number(maxVoters),
    },
    questions: parseQuestionArgs(rawArgs.slice(separatorIndex + 1)),
  };
}

function buildSubmissionMediaHash(imageUrls, videoUrl) {
  return keccak256(
    encodeAbiParameters(
      [{ type: "string[]" }, { type: "string" }],
      [imageUrls, videoUrl]
    )
  );
}

function buildQuestionBundleHash(questions) {
  const questionHashes = questions.map((question, index) =>
    keccak256(
      encodeAbiParameters(
        [
          { type: "string" },
          { type: "string" },
          { type: "bytes32" },
          { type: "string" },
          { type: "string" },
          { type: "string" },
          { type: "uint256" },
          { type: "bytes32" },
          { type: "uint256" },
          { type: "bytes32" },
          { type: "bytes32" },
        ],
        [
          "curyo-question-bundle-item-v2",
          question.contextUrl,
          buildSubmissionMediaHash(question.imageUrls, question.videoUrl),
          question.title,
          question.description,
          question.tags,
          question.categoryId,
          question.salt,
          BigInt(index),
          DEFAULT_QUESTION_METADATA_HASH,
          DEFAULT_RESULT_SPEC_HASH,
        ]
      )
    )
  );

  return keccak256(
    encodeAbiParameters(
      [{ type: "string" }, { type: "bytes32[]" }],
      ["curyo-question-bundle-v2", questionHashes]
    )
  );
}

function buildQuestionBundleRevealCommitment({
  bundleHash,
  submitter,
  rewardTerms,
  roundConfig,
}) {
  return keccak256(
    encodeAbiParameters(
      [
        { type: "string" },
        { type: "bytes32" },
        { type: "address" },
        { type: "uint8" },
        { type: "uint256" },
        { type: "uint256" },
        { type: "uint256" },
        { type: "uint256" },
        { type: "uint256" },
        { type: "uint32" },
        { type: "uint32" },
        { type: "uint16" },
        { type: "uint16" },
      ],
      [
        "curyo-question-bundle-reveal-v3",
        bundleHash,
        submitter,
        rewardTerms.asset,
        rewardTerms.amount,
        rewardTerms.requiredVoters,
        rewardTerms.requiredSettledRounds,
        rewardTerms.bountyClosesAt,
        rewardTerms.feedbackClosesAt,
        roundConfig.epochDuration,
        roundConfig.maxDuration,
        roundConfig.minVoters,
        roundConfig.maxVoters,
      ]
    )
  );
}

const { submitter, rewardTerms, roundConfig, questions } = parseArgs(
  process.argv.slice(2)
);
const bundleHash = buildQuestionBundleHash(questions);
const revealCommitment = buildQuestionBundleRevealCommitment({
  bundleHash,
  submitter,
  rewardTerms,
  roundConfig,
});
const calldata = encodeFunctionData({
  abi,
  functionName: "submitQuestionBundleWithRewardAndRoundConfig",
  args: [
    questions.map((question) => [
      question.contextUrl,
      question.imageUrls,
      question.videoUrl,
      question.title,
      question.description,
      question.tags,
      question.categoryId,
      question.salt,
      [DEFAULT_QUESTION_METADATA_HASH, DEFAULT_RESULT_SPEC_HASH],
    ]),
    [
      rewardTerms.asset,
      rewardTerms.amount,
      rewardTerms.requiredVoters,
      rewardTerms.requiredSettledRounds,
      rewardTerms.bountyClosesAt,
      rewardTerms.feedbackClosesAt,
    ],
    [
      roundConfig.epochDuration,
      roundConfig.maxDuration,
      roundConfig.minVoters,
      roundConfig.maxVoters,
    ],
  ],
});

console.log(revealCommitment);
console.log(calldata);
