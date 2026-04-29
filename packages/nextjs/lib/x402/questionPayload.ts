import { createHash } from "crypto";
import { buildQuestionSpecHashes } from "~~/lib/agent/questionSpecs";
import {
  type AgentQuestionSpecInput,
  DEFAULT_AGENT_TEMPLATE_ID,
  DEFAULT_AGENT_TEMPLATE_VERSION,
} from "~~/lib/agent/questionSpecs";
import { findAgentResultTemplate } from "~~/lib/agent/templates";
import {
  getContentDescriptionValidationError,
  getContentTitleValidationError,
} from "~~/lib/moderation/submissionValidation";
import { findBlockedContentTags } from "~~/lib/moderation/submissionValidation";
import {
  DEFAULT_QUESTION_ROUND_CONFIG,
  type QuestionRoundConfig,
  serializeQuestionRoundConfig,
} from "~~/lib/questionRoundConfig";

export const X402_CELO_USDC_BY_CHAIN_ID: Record<number, `0x${string}`> = {
  42220: "0xcebA9300f2b948710d2653dD7B07f33A8B32118C",
  11142220: "0x01C5C0122039549AD1493B8220cABEdD739BC44E",
};

export const X402_SUBMISSION_REWARD_ASSET_USDC = 1;
export const X402_USDC_DECIMALS = 6;
const X402_DEFAULT_SUBMISSION_BOUNTY_USDC = 1_000_000n;
const X402_MIN_REWARD_POOL_REQUIRED_VOTERS = 3n;
const X402_MIN_REWARD_POOL_SETTLED_ROUNDS = 1n;
export const X402_MAX_QUESTION_BUNDLE_COUNT = 10;

const DIRECT_IMAGE_URL_PATTERN = /^https:\/\/.+\.(?:avif|gif|jpe?g|png|webp)(?:[?#].*)?$/i;
const CLIENT_REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{4,160}$/;

export class X402QuestionInputError extends Error {
  readonly status = 400;

  constructor(message: string) {
    super(message);
    this.name = "X402QuestionInputError";
  }
}

export type X402QuestionPayload = {
  clientRequestId: string;
  chainId: number;
  questions: X402QuestionItemPayload[];
  roundConfig: QuestionRoundConfig;
  bounty: {
    asset: "USDC";
    amount: bigint;
    requiredVoters: bigint;
    requiredSettledRounds: bigint;
    rewardPoolExpiresAt: bigint;
    feedbackClosesAt: bigint;
  };
};

export type X402QuestionItemPayload = {
  contextUrl: string;
  imageUrls: string[];
  videoUrl: string;
  title: string;
  description: string;
  tags: string;
  tagList: string[];
  categoryId: bigint;
  targetAudience: AgentQuestionSpecInput["targetAudience"];
  templateId: string;
  templateInputs: AgentQuestionSpecInput["templateInputs"];
  templateVersion: number;
  questionMetadataHash: `0x${string}`;
  resultSpecHash: `0x${string}`;
};

export type X402QuestionOperation = {
  operationKey: `0x${string}`;
  payloadHash: string;
  canonicalPayload: ReturnType<typeof toCanonicalQuestionPayload>;
};

export function assertSupportedX402BundleBounty(bounty: Pick<X402QuestionPayload["bounty"], "rewardPoolExpiresAt">) {
  if (bounty.rewardPoolExpiresAt <= 0n) {
    throw new X402QuestionInputError("bounty.rewardPoolExpiresAt must be greater than zero for bundle submissions.");
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown, fieldName: string): string {
  if (typeof value !== "string") {
    throw new X402QuestionInputError(`${fieldName} must be a string.`);
  }

  const trimmed = value.trim();
  if (!trimmed) {
    throw new X402QuestionInputError(`${fieldName} is required.`);
  }

  return trimmed;
}

function readOptionalString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseNonNegativeInteger(value: unknown, fieldName: string): bigint {
  const rawValue =
    typeof value === "bigint" || typeof value === "number" || typeof value === "string" ? String(value).trim() : "";
  if (!/^\d+$/.test(rawValue)) {
    throw new X402QuestionInputError(`${fieldName} must be a non-negative integer.`);
  }

  return BigInt(rawValue);
}

function parsePositiveAtomicAmount(value: unknown, fieldName: string): bigint {
  const parsed = parseNonNegativeInteger(value, fieldName);
  if (parsed <= 0n) {
    throw new X402QuestionInputError(`${fieldName} must be greater than zero.`);
  }
  return parsed;
}

function normalizeHttpsUrl(value: string, fieldName: string): string {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:") {
      throw new X402QuestionInputError(`${fieldName} must be an HTTPS URL.`);
    }
    return parsed.toString();
  } catch (error) {
    if (error instanceof X402QuestionInputError) throw error;
    throw new X402QuestionInputError(`${fieldName} must be a valid HTTPS URL.`);
  }
}

function isYouTubeVideoUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (host === "youtu.be") return parsed.pathname.length > 1;
    if (host === "www.youtube.com" && parsed.pathname.startsWith("/embed/")) {
      return parsed.pathname.length > "/embed/".length;
    }

    return (
      (host === "youtube.com" || host === "www.youtube.com" || host === "m.youtube.com") &&
      parsed.pathname === "/watch" &&
      parsed.searchParams.has("v")
    );
  } catch {
    return false;
  }
}

function normalizeImageUrls(value: unknown): string[] {
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new X402QuestionInputError("imageUrls must be an array of HTTPS URLs.");
  }

  const imageUrls = value.map((entry, index) => {
    const normalized = normalizeHttpsUrl(readString(entry, `imageUrls[${index}]`), `imageUrls[${index}]`);
    if (!DIRECT_IMAGE_URL_PATTERN.test(normalized)) {
      throw new X402QuestionInputError("imageUrls must point to direct image files.");
    }
    return normalized;
  });

  if (imageUrls.length > 4) {
    throw new X402QuestionInputError("imageUrls supports at most four images.");
  }

  return imageUrls;
}

function normalizeTags(value: unknown): { tags: string; tagList: string[] } {
  const rawTags = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
  const tagList = rawTags
    .map(tag => (typeof tag === "string" ? tag.trim() : ""))
    .filter(Boolean)
    .slice(0, 4);

  if (tagList.length === 0) {
    throw new X402QuestionInputError("At least one tag is required.");
  }
  if (tagList.length > 3) {
    throw new X402QuestionInputError("At most three tags are supported.");
  }

  const blockedTags = findBlockedContentTags(tagList);
  if (blockedTags.length > 0) {
    throw new X402QuestionInputError("Tags contain prohibited content.");
  }

  return {
    tagList,
    tags: tagList.join(","),
  };
}

function normalizeTemplateInputs(value: unknown, fieldName: string): AgentQuestionSpecInput["templateInputs"] {
  if (value === undefined || value === null) return null;
  if (!isObject(value)) {
    throw new X402QuestionInputError(`${fieldName} must be an object when provided.`);
  }

  try {
    return JSON.parse(JSON.stringify(value)) as AgentQuestionSpecInput["templateInputs"];
  } catch {
    throw new X402QuestionInputError(`${fieldName} must be JSON serializable.`);
  }
}

function normalizeJsonObject(value: unknown, fieldName: string): AgentQuestionSpecInput["targetAudience"] {
  if (value === undefined || value === null) return null;
  if (!isObject(value)) {
    throw new X402QuestionInputError(`${fieldName} must be an object when provided.`);
  }

  try {
    return JSON.parse(JSON.stringify(value)) as AgentQuestionSpecInput["targetAudience"];
  } catch {
    throw new X402QuestionInputError(`${fieldName} must be JSON serializable.`);
  }
}

function normalizeTemplateSelection(
  value: Record<string, unknown>,
  fieldPrefix: string,
  defaults: {
    templateId?: string;
    templateInputs?: AgentQuestionSpecInput["templateInputs"];
    templateVersion?: number;
  },
) {
  const rawTemplateId = readOptionalString(value.templateId) || defaults.templateId || DEFAULT_AGENT_TEMPLATE_ID;
  const template = findAgentResultTemplate(rawTemplateId);
  if (!template) {
    throw new X402QuestionInputError(`${fieldPrefix}.templateId is not supported.`);
  }

  const templateVersion =
    value.templateVersion === undefined || value.templateVersion === null
      ? (defaults.templateVersion ?? template.version)
      : Number.parseInt(String(value.templateVersion), 10);
  if (!Number.isSafeInteger(templateVersion) || templateVersion <= 0) {
    throw new X402QuestionInputError(`${fieldPrefix}.templateVersion must be a positive integer.`);
  }
  if (templateVersion !== template.version) {
    throw new X402QuestionInputError(
      `${fieldPrefix}.templateVersion ${templateVersion} is not supported for ${template.id}.`,
    );
  }

  const templateInputs =
    value.templateInputs === undefined
      ? (defaults.templateInputs ?? null)
      : normalizeTemplateInputs(value.templateInputs, `${fieldPrefix}.templateInputs`);

  return {
    template,
    templateId: template.id,
    templateInputs,
    templateVersion,
  };
}

function normalizeChainId(value: unknown, fallbackChainId?: number): number {
  const rawValue = value ?? fallbackChainId;
  const chainId = typeof rawValue === "number" ? rawValue : Number.parseInt(String(rawValue ?? ""), 10);
  if (!Number.isSafeInteger(chainId) || chainId <= 0) {
    throw new X402QuestionInputError("chainId must be a positive integer.");
  }

  return chainId;
}

function normalizeBounty(value: unknown): X402QuestionPayload["bounty"] {
  if (!isObject(value)) {
    throw new X402QuestionInputError("bounty is required.");
  }

  const asset = readOptionalString(value.asset).toUpperCase() || "USDC";
  if (asset !== "USDC") {
    throw new X402QuestionInputError("Only USDC bounties are supported for x402 submissions.");
  }

  const amount = parsePositiveAtomicAmount(value.amount, "bounty.amount");
  const requiredVoters = parseNonNegativeInteger(
    value.requiredVoters ?? X402_MIN_REWARD_POOL_REQUIRED_VOTERS,
    "bounty.requiredVoters",
  );
  const requiredSettledRounds = parseNonNegativeInteger(
    value.requiredSettledRounds ?? X402_MIN_REWARD_POOL_SETTLED_ROUNDS,
    "bounty.requiredSettledRounds",
  );
  const rewardPoolExpiresAt = parseNonNegativeInteger(value.rewardPoolExpiresAt ?? 0n, "bounty.rewardPoolExpiresAt");
  const feedbackClosesAt = parseNonNegativeInteger(
    value.feedbackClosesAt ?? value.rewardPoolExpiresAt ?? 0n,
    "bounty.feedbackClosesAt",
  );

  if (requiredVoters < X402_MIN_REWARD_POOL_REQUIRED_VOTERS) {
    throw new X402QuestionInputError(`bounty.requiredVoters must be at least ${X402_MIN_REWARD_POOL_REQUIRED_VOTERS}.`);
  }
  if (requiredSettledRounds < X402_MIN_REWARD_POOL_SETTLED_ROUNDS) {
    throw new X402QuestionInputError(
      `bounty.requiredSettledRounds must be at least ${X402_MIN_REWARD_POOL_SETTLED_ROUNDS}.`,
    );
  }
  if (amount < X402_DEFAULT_SUBMISSION_BOUNTY_USDC) {
    throw new X402QuestionInputError("bounty.amount must be at least 1000000 atomic USDC.");
  }
  if (amount < requiredVoters * requiredSettledRounds) {
    throw new X402QuestionInputError("bounty.amount is too small for the selected voter requirements.");
  }
  if (rewardPoolExpiresAt > 0n && feedbackClosesAt > rewardPoolExpiresAt) {
    throw new X402QuestionInputError("bounty.feedbackClosesAt cannot be after bounty.rewardPoolExpiresAt.");
  }
  assertSupportedX402BundleBounty({
    rewardPoolExpiresAt,
  });

  return {
    asset: "USDC",
    amount,
    requiredVoters,
    requiredSettledRounds,
    rewardPoolExpiresAt,
    feedbackClosesAt,
  };
}

function normalizeRoundConfig(value: unknown): QuestionRoundConfig {
  if (value === undefined || value === null) {
    return DEFAULT_QUESTION_ROUND_CONFIG;
  }
  if (!isObject(value)) {
    throw new X402QuestionInputError("question.roundConfig must be an object.");
  }

  const epochDuration = parseNonNegativeInteger(
    value.epochDuration ?? value.blindPhaseSeconds ?? value.blindSeconds,
    "question.roundConfig.epochDuration",
  );
  const maxDuration = parseNonNegativeInteger(
    value.maxDuration ?? value.maxDurationSeconds ?? value.deadlineSeconds,
    "question.roundConfig.maxDuration",
  );
  const minVoters = parseNonNegativeInteger(value.minVoters, "question.roundConfig.minVoters");
  const maxVoters = parseNonNegativeInteger(value.maxVoters, "question.roundConfig.maxVoters");

  if (epochDuration <= 0n) {
    throw new X402QuestionInputError("question.roundConfig.epochDuration must be greater than zero.");
  }
  if (maxDuration <= 0n) {
    throw new X402QuestionInputError("question.roundConfig.maxDuration must be greater than zero.");
  }
  if (minVoters <= 0n || maxVoters <= 0n || maxVoters < minVoters) {
    throw new X402QuestionInputError("question.roundConfig voter values are invalid.");
  }

  return { epochDuration, maxDuration, minVoters, maxVoters };
}

type NormalizedQuestionInput = Omit<X402QuestionItemPayload, "questionMetadataHash" | "resultSpecHash"> & {
  template: NonNullable<ReturnType<typeof findAgentResultTemplate>>;
};

function normalizeQuestion(
  value: unknown,
  index: number,
  defaults: {
    templateId?: string;
    templateInputs?: AgentQuestionSpecInput["templateInputs"];
    templateVersion?: number;
  },
): NormalizedQuestionInput {
  if (!isObject(value)) {
    throw new X402QuestionInputError(`questions[${index}] must be an object.`);
  }

  const fieldPrefix = `questions[${index}]`;
  const title = readString(value.title, `${fieldPrefix}.title`);
  const description = readOptionalString(value.description);
  const titleError = getContentTitleValidationError(title);
  if (titleError) {
    throw new X402QuestionInputError(titleError);
  }
  const descriptionError = getContentDescriptionValidationError(description);
  if (descriptionError) {
    throw new X402QuestionInputError(descriptionError);
  }

  const contextUrl = normalizeHttpsUrl(
    readString(value.contextUrl, `${fieldPrefix}.contextUrl`),
    `${fieldPrefix}.contextUrl`,
  );
  const imageUrls = normalizeImageUrls(value.imageUrls);
  const rawVideoUrl = readOptionalString(value.videoUrl);
  const videoUrl = rawVideoUrl ? normalizeHttpsUrl(rawVideoUrl, `${fieldPrefix}.videoUrl`) : "";
  if (videoUrl && !isYouTubeVideoUrl(videoUrl)) {
    throw new X402QuestionInputError(`${fieldPrefix}.videoUrl must be a supported YouTube URL.`);
  }
  if (videoUrl && imageUrls.length > 0) {
    throw new X402QuestionInputError("Use imageUrls or videoUrl, not both.");
  }

  const { tags, tagList } = normalizeTags(value.tags);
  const categoryId = parseNonNegativeInteger(value.categoryId, `${fieldPrefix}.categoryId`);
  const targetAudience = normalizeJsonObject(value.targetAudience, `${fieldPrefix}.targetAudience`);
  const templateSelection = normalizeTemplateSelection(value, fieldPrefix, defaults);

  return {
    categoryId,
    contextUrl,
    description,
    imageUrls,
    tags,
    tagList,
    targetAudience,
    template: templateSelection.template,
    templateId: templateSelection.templateId,
    templateInputs: templateSelection.templateInputs,
    templateVersion: templateSelection.templateVersion,
    title,
    videoUrl,
  };
}

export function parseX402QuestionRequest(value: unknown, fallbackChainId?: number): X402QuestionPayload {
  if (!isObject(value)) {
    throw new X402QuestionInputError("Request body must be a JSON object.");
  }

  const clientRequestId = readString(value.clientRequestId, "clientRequestId");
  if (!CLIENT_REQUEST_ID_PATTERN.test(clientRequestId)) {
    throw new X402QuestionInputError(
      "clientRequestId must be 4-160 characters using letters, numbers, dot, dash, colon, or underscore.",
    );
  }

  const rawQuestions = Array.isArray(value.questions)
    ? value.questions
    : [isObject(value.question) ? value.question : value];
  if (rawQuestions.length === 0) {
    throw new X402QuestionInputError("At least one question is required.");
  }
  if (rawQuestions.length > X402_MAX_QUESTION_BUNDLE_COUNT) {
    throw new X402QuestionInputError(`At most ${X402_MAX_QUESTION_BUNDLE_COUNT} questions are supported.`);
  }

  const firstQuestion = isObject(rawQuestions[0]) ? rawQuestions[0] : {};
  const roundConfig = normalizeRoundConfig(value.roundConfig ?? firstQuestion.roundConfig);
  const bounty = normalizeBounty(value.bounty);
  const topLevelTemplateInputs = normalizeTemplateInputs(value.templateInputs, "templateInputs");
  const topLevelTemplateVersion =
    value.templateVersion === undefined || value.templateVersion === null
      ? DEFAULT_AGENT_TEMPLATE_VERSION
      : Number.parseInt(String(value.templateVersion), 10);
  const templateDefaults = {
    templateId: readOptionalString(value.templateId) || DEFAULT_AGENT_TEMPLATE_ID,
    templateInputs: topLevelTemplateInputs,
    templateVersion: topLevelTemplateVersion,
  };
  const questions = rawQuestions.map((question, index) => {
    const normalizedQuestion = normalizeQuestion(question, index, templateDefaults);
    const spec = buildQuestionSpecHashes({
      bounty: {
        amount: bounty.amount,
        asset: bounty.asset,
        requiredSettledRounds: bounty.requiredSettledRounds,
        requiredVoters: bounty.requiredVoters,
      },
      categoryId: normalizedQuestion.categoryId,
      contextUrl: normalizedQuestion.contextUrl,
      description: normalizedQuestion.description,
      imageUrls: normalizedQuestion.imageUrls,
      roundConfig,
      study: {
        bundleIndex: index,
      },
      tags: normalizedQuestion.tagList,
      targetAudience: normalizedQuestion.targetAudience,
      templateId: normalizedQuestion.templateId,
      templateInputs: normalizedQuestion.templateInputs,
      templateVersion: normalizedQuestion.templateVersion,
      title: normalizedQuestion.title,
      videoUrl: normalizedQuestion.videoUrl,
      voteSemantics: normalizedQuestion.template.voteSemantics,
    });

    return {
      categoryId: normalizedQuestion.categoryId,
      contextUrl: normalizedQuestion.contextUrl,
      description: normalizedQuestion.description,
      imageUrls: normalizedQuestion.imageUrls,
      questionMetadataHash: spec.questionMetadataHash,
      resultSpecHash: spec.resultSpecHash,
      tags: normalizedQuestion.tags,
      tagList: normalizedQuestion.tagList,
      targetAudience: normalizedQuestion.targetAudience,
      templateId: normalizedQuestion.templateId,
      templateInputs: normalizedQuestion.templateInputs,
      templateVersion: normalizedQuestion.templateVersion,
      title: normalizedQuestion.title,
      videoUrl: normalizedQuestion.videoUrl,
    };
  });

  return {
    clientRequestId,
    chainId: normalizeChainId(value.chainId ?? firstQuestion.chainId, fallbackChainId),
    questions,
    roundConfig,
    bounty,
  };
}

export function toCanonicalQuestionPayload(payload: X402QuestionPayload) {
  return {
    bounty: {
      amount: payload.bounty.amount.toString(),
      asset: payload.bounty.asset,
      requiredSettledRounds: payload.bounty.requiredSettledRounds.toString(),
      requiredVoters: payload.bounty.requiredVoters.toString(),
      rewardPoolExpiresAt: payload.bounty.rewardPoolExpiresAt.toString(),
      feedbackClosesAt: payload.bounty.feedbackClosesAt.toString(),
    },
    chainId: payload.chainId,
    clientRequestId: payload.clientRequestId,
    questions: payload.questions.map(question => ({
      categoryId: question.categoryId.toString(),
      contextUrl: question.contextUrl,
      description: question.description,
      imageUrls: question.imageUrls,
      questionMetadataHash: question.questionMetadataHash,
      resultSpecHash: question.resultSpecHash,
      tags: question.tagList,
      targetAudience: question.targetAudience,
      templateId: question.templateId,
      templateInputs: question.templateInputs,
      templateVersion: question.templateVersion,
      title: question.title,
      videoUrl: question.videoUrl,
    })),
    roundConfig: serializeQuestionRoundConfig(payload.roundConfig),
  };
}

export function buildX402QuestionOperation(payload: X402QuestionPayload): X402QuestionOperation {
  assertSupportedX402BundleBounty(payload.bounty);
  const canonicalPayload = toCanonicalQuestionPayload(payload);
  const payloadHash = createHash("sha256").update(JSON.stringify(canonicalPayload)).digest("hex");
  const operationKey = `0x${createHash("sha256").update(`curyo:x402-question:${payloadHash}`).digest("hex")}` as const;

  return {
    canonicalPayload,
    operationKey,
    payloadHash,
  };
}
