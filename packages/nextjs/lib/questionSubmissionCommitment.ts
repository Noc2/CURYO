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

export function buildQuestionSubmissionRevealCommitment(params: QuestionSubmissionRevealCommitmentParams): Hex {
  const mediaHash = keccak256(
    encodeAbiParameters([{ type: "string[]" }, { type: "string" }], [[...params.imageUrls], params.videoUrl]),
  );
  const legacyCommitment = keccak256(
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
      ],
    ),
  );

  return keccak256(
    encodeAbiParameters(
      [{ type: "bytes32" }, { type: "uint32" }, { type: "uint32" }, { type: "uint16" }, { type: "uint16" }],
      [
        legacyCommitment,
        Number(params.roundConfig.epochDuration),
        Number(params.roundConfig.maxDuration),
        Number(params.roundConfig.minVoters),
        Number(params.roundConfig.maxVoters),
      ],
    ),
  );
}
