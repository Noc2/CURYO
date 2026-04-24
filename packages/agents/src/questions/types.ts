export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = Record<string, unknown>;

export type AgentQuestionExample = {
  title: string;
  description: string;
  contextUrl: string;
  categoryId: string | number | bigint;
  tags: string[] | string;
  imageUrls?: string[];
  videoUrl?: string;
  templateId?: string;
  templateInputs?: JsonValue;
  targetAudience?: JsonValue;
};

export type AgentAskExample = {
  bounty: {
    amount: string | number | bigint;
    asset?: "USDC" | "usdc" | string;
    requiredSettledRounds?: string | number | bigint;
    requiredVoters?: string | number | bigint;
    rewardPoolExpiresAt?: string | number | bigint;
  };
  chainId?: number;
  clientRequestId: string;
  maxPaymentAmount?: string | number | bigint;
  question?: AgentQuestionExample;
  questions?: AgentQuestionExample[];
  roundConfig?: Record<string, string | number | bigint>;
  templateId?: string;
  templateInputs?: JsonValue;
  templateVersion?: number;
};

export type QuestionLintFinding = {
  level: "error" | "warning";
  message: string;
  path: string;
};
