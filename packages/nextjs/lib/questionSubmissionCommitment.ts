import { type Address, type Hex, encodeAbiParameters, keccak256 } from "viem";

type QuestionSubmissionRoundConfig = {
  epochDuration: bigint | number;
  maxDuration: bigint | number;
  minVoters: bigint | number;
  maxVoters: bigint | number;
};

type QuestionSubmissionRevealCommitmentParams = {
  categoryId: bigint;
  description: string;
  imageUrls: readonly string[];
  rewardAmount: bigint;
  rewardAsset: number;
  requiredSettledRounds: bigint;
  requiredVoters: bigint;
  rewardPoolExpiresAt: bigint;
  roundConfig: QuestionSubmissionRoundConfig;
  salt: Hex;
  submissionKey: Hex;
  submitter: Address;
  tags: string;
  title: string;
  videoUrl: string;
};

export type QuestionBundleSubmissionItem = {
  categoryId: bigint;
  contextUrl: string;
  description: string;
  imageUrls: readonly string[];
  salt: Hex;
  tags: string;
  title: string;
  videoUrl: string;
};

type QuestionBundleRevealCommitmentParams = {
  bundleHash: Hex;
  rewardAmount: bigint;
  rewardAsset: number;
  requiredSettledRounds: bigint;
  requiredVoters: bigint;
  rewardPoolExpiresAt: bigint;
  roundConfig: QuestionSubmissionRoundConfig;
  submitter: Address;
};

type QuestionBundleSubmissionRevealCommitmentParams = Omit<QuestionBundleRevealCommitmentParams, "bundleHash"> & {
  questions: readonly QuestionBundleSubmissionItem[];
};

function buildSubmissionMediaHash(imageUrls: readonly string[], videoUrl: string): Hex {
  return keccak256(encodeAbiParameters([{ type: "string[]" }, { type: "string" }], [[...imageUrls], videoUrl]));
}

export function buildQuestionSubmissionRevealCommitment(params: QuestionSubmissionRevealCommitmentParams): Hex {
  const mediaHash = buildSubmissionMediaHash(params.imageUrls, params.videoUrl);
  return keccak256(
    encodeAbiParameters(
      [
        { type: "bytes32" },
        { type: "bytes32" },
        { type: "string" },
        { type: "string" },
        { type: "string" },
        { type: "uint256" },
        { type: "bytes32" },
        { type: "address" },
        { type: "uint8" },
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
        params.submissionKey,
        mediaHash,
        params.title,
        params.description,
        params.tags,
        params.categoryId,
        params.salt,
        params.submitter,
        params.rewardAsset,
        params.rewardAmount,
        params.requiredVoters,
        params.requiredSettledRounds,
        params.rewardPoolExpiresAt,
        Number(params.roundConfig.epochDuration),
        Number(params.roundConfig.maxDuration),
        Number(params.roundConfig.minVoters),
        Number(params.roundConfig.maxVoters),
      ],
    ),
  );
}

export function buildQuestionBundleHash(questions: readonly QuestionBundleSubmissionItem[]): Hex {
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
        ],
        [
          "curyo-question-bundle-item-v1",
          question.contextUrl,
          buildSubmissionMediaHash(question.imageUrls, question.videoUrl),
          question.title,
          question.description,
          question.tags,
          question.categoryId,
          question.salt,
          BigInt(index),
        ],
      ),
    ),
  );

  return keccak256(
    encodeAbiParameters([{ type: "string" }, { type: "bytes32[]" }], ["curyo-question-bundle-v1", questionHashes]),
  );
}

export function buildQuestionBundleRevealCommitment(params: QuestionBundleRevealCommitmentParams): Hex {
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
        { type: "uint32" },
        { type: "uint32" },
        { type: "uint16" },
        { type: "uint16" },
      ],
      [
        "curyo-question-bundle-reveal-v1",
        params.bundleHash,
        params.submitter,
        params.rewardAsset,
        params.rewardAmount,
        params.requiredVoters,
        params.requiredSettledRounds,
        params.rewardPoolExpiresAt,
        Number(params.roundConfig.epochDuration),
        Number(params.roundConfig.maxDuration),
        Number(params.roundConfig.minVoters),
        Number(params.roundConfig.maxVoters),
      ],
    ),
  );
}

export function buildQuestionBundleSubmissionRevealCommitment(
  params: QuestionBundleSubmissionRevealCommitmentParams,
): Hex {
  return buildQuestionBundleRevealCommitment({
    ...params,
    bundleHash: buildQuestionBundleHash(params.questions),
  });
}
