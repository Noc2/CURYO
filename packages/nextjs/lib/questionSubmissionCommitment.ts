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
  questionMetadataHash: Hex;
  rewardAmount: bigint;
  rewardAsset: number;
  requiredSettledRounds: bigint;
  requiredVoters: bigint;
  resultSpecHash: Hex;
  rewardPoolExpiresAt: bigint;
  feedbackClosesAt: bigint;
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
  spec: {
    questionMetadataHash: Hex;
    resultSpecHash: Hex;
  };
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
  feedbackClosesAt: bigint;
  roundConfig: QuestionSubmissionRoundConfig;
  submitter: Address;
};

type QuestionBundleSubmissionRevealCommitmentParams = Omit<QuestionBundleRevealCommitmentParams, "bundleHash"> & {
  questions: readonly QuestionBundleSubmissionItem[];
};

function buildSubmissionMediaHash(imageUrls: readonly string[], videoUrl: string): Hex {
  return keccak256(encodeAbiParameters([{ type: "string[]" }, { type: "string" }], [[...imageUrls], videoUrl]));
}

export function buildQuestionSubmissionKey(
  params: Pick<QuestionBundleSubmissionItem, "categoryId" | "contextUrl" | "description" | "tags" | "title">,
): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        { type: "string" },
        { type: "uint256" },
        { type: "string" },
        { type: "string" },
        { type: "string" },
        { type: "string" },
      ],
      [
        "curyo-question-context-v1",
        params.categoryId,
        params.contextUrl,
        params.title,
        params.description,
        params.tags,
      ],
    ),
  );
}

export function buildQuestionSubmissionRevealCommitment(params: QuestionSubmissionRevealCommitmentParams): Hex {
  const mediaHash = buildSubmissionMediaHash(params.imageUrls, params.videoUrl);
  const textHash = keccak256(
    encodeAbiParameters(
      [{ type: "string" }, { type: "string" }, { type: "string" }],
      [params.title, params.description, params.tags],
    ),
  );
  const rewardTermsHash = keccak256(
    encodeAbiParameters(
      [
        { type: "uint8" },
        { type: "uint256" },
        { type: "uint256" },
        { type: "uint256" },
        { type: "uint256" },
        { type: "uint256" },
      ],
      [
        params.rewardAsset,
        params.rewardAmount,
        params.requiredVoters,
        params.requiredSettledRounds,
        params.rewardPoolExpiresAt,
        params.feedbackClosesAt,
      ],
    ),
  );
  const roundConfigHash = keccak256(
    encodeAbiParameters(
      [{ type: "uint32" }, { type: "uint32" }, { type: "uint16" }, { type: "uint16" }],
      [
        Number(params.roundConfig.epochDuration),
        Number(params.roundConfig.maxDuration),
        Number(params.roundConfig.minVoters),
        Number(params.roundConfig.maxVoters),
      ],
    ),
  );
  return keccak256(
    encodeAbiParameters(
      [
        { type: "string" },
        { type: "bytes32" },
        { type: "bytes32" },
        { type: "bytes32" },
        { type: "uint256" },
        { type: "bytes32" },
        { type: "address" },
        { type: "bytes32" },
        { type: "bytes32" },
        { type: "bytes32" },
        { type: "bytes32" },
      ],
      [
        "curyo-question-reveal-v3",
        params.submissionKey,
        mediaHash,
        textHash,
        params.categoryId,
        params.salt,
        params.submitter,
        rewardTermsHash,
        roundConfigHash,
        params.questionMetadataHash,
        params.resultSpecHash,
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
          question.spec.questionMetadataHash,
          question.spec.resultSpecHash,
        ],
      ),
    ),
  );

  return keccak256(
    encodeAbiParameters([{ type: "string" }, { type: "bytes32[]" }], ["curyo-question-bundle-v2", questionHashes]),
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
        { type: "uint256" },
        { type: "uint32" },
        { type: "uint32" },
        { type: "uint16" },
        { type: "uint16" },
      ],
      [
        "curyo-question-bundle-reveal-v3",
        params.bundleHash,
        params.submitter,
        params.rewardAsset,
        params.rewardAmount,
        params.requiredVoters,
        params.requiredSettledRounds,
        params.rewardPoolExpiresAt,
        params.feedbackClosesAt,
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
