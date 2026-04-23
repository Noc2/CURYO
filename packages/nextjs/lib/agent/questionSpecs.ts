import { type Hex, keccak256, stringToHex } from "viem";
import { type QuestionRoundConfig, serializeQuestionRoundConfig } from "~~/lib/questionRoundConfig";

export const DEFAULT_AGENT_TEMPLATE_ID = "generic_rating";
export const DEFAULT_AGENT_TEMPLATE_VERSION = 1;

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export type AgentQuestionSpecInput = {
  bounty?: {
    amount: bigint | string;
    asset: string;
    requiredSettledRounds?: bigint | string;
    requiredVoters?: bigint | string;
  };
  categoryId: bigint | string;
  contextUrl: string;
  description: string;
  imageUrls: readonly string[];
  roundConfig?: QuestionRoundConfig;
  study?: {
    bundleIndex?: number;
    studyId?: string;
  } | null;
  tags: readonly string[];
  templateInputs?: JsonValue;
  templateId?: string;
  templateVersion?: number;
  title: string;
  videoUrl: string;
  voteSemantics?: {
    down: string;
    up: string;
  };
};

function stableJson(value: JsonValue): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }

  return `{${Object.keys(value)
    .sort()
    .map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`)
    .join(",")}}`;
}

export function hashCanonicalJson(value: JsonValue): Hex {
  return keccak256(stringToHex(stableJson(value)));
}

export function buildQuestionMetadata(input: AgentQuestionSpecInput): JsonValue {
  return {
    bounty: input.bounty
      ? {
          amount: input.bounty.amount.toString(),
          asset: input.bounty.asset,
          requiredSettledRounds: input.bounty.requiredSettledRounds?.toString() ?? null,
          requiredVoters: input.bounty.requiredVoters?.toString() ?? null,
        }
      : null,
    categoryId: input.categoryId.toString(),
    contextUrl: input.contextUrl,
    description: input.description,
    imageUrls: [...input.imageUrls],
    roundConfig: input.roundConfig ? serializeQuestionRoundConfig(input.roundConfig) : null,
    schemaVersion: "curyo.question.v1",
    study: input.study ?? null,
    tags: [...input.tags],
    templateInputs: input.templateInputs ?? null,
    templateId: input.templateId ?? DEFAULT_AGENT_TEMPLATE_ID,
    templateVersion: input.templateVersion ?? DEFAULT_AGENT_TEMPLATE_VERSION,
    title: input.title,
    videoUrl: input.videoUrl,
  };
}

export function buildDefaultResultSpec(
  templateId = DEFAULT_AGENT_TEMPLATE_ID,
  templateVersion = DEFAULT_AGENT_TEMPLATE_VERSION,
  voteSemantics: AgentQuestionSpecInput["voteSemantics"] = {
    down: "negative signal for the submitted question",
    up: "positive signal for the submitted question",
  },
): JsonValue {
  return {
    confidenceInputs: [
      "revealedCount",
      "totalStake",
      "ratingBps",
      "conservativeRatingBps",
      "confidenceMass",
      "effectiveEvidence",
    ],
    ratingSystem: "curyo.binary_staked_rating.v1",
    schemaVersion: "curyo.result_spec.v1",
    templateId,
    templateVersion,
    voteSemantics,
  };
}

export function buildQuestionSpecHashes(input: AgentQuestionSpecInput) {
  const questionMetadata = buildQuestionMetadata(input);
  const resultSpec = buildDefaultResultSpec(input.templateId, input.templateVersion, input.voteSemantics);

  return {
    questionMetadata,
    questionMetadataHash: hashCanonicalJson(questionMetadata),
    resultSpec,
    resultSpecHash: hashCanonicalJson(resultSpec),
  };
}
