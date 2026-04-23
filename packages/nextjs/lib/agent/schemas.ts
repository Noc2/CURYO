type JsonSchema = Record<string, unknown>;

const atomicAmountSchema = {
  description: "Atomic USDC amount as a base-10 integer string.",
  pattern: "^\\d+$",
  type: "string",
};

const chainIdSchema = {
  description: "EVM chain id.",
  minimum: 1,
  type: "integer",
};

const templateSelectorSchema = {
  additionalProperties: false,
  properties: {
    templateId: {
      description: "Off-chain Curyo result interpretation template id.",
      type: "string",
    },
    templateInputs: {
      additionalProperties: true,
      description: "Template-specific off-chain inputs used only for result interpretation.",
      type: "object",
    },
    templateVersion: {
      description: "Template version. Defaults to the latest supported version for the template.",
      minimum: 1,
      type: "integer",
    },
  },
  type: "object",
} satisfies JsonSchema;

export const agentQuestionInputSchema = {
  additionalProperties: true,
  properties: {
    categoryId: { description: "Curyo category id.", type: ["integer", "string"] },
    contextUrl: { description: "HTTPS context URL voters should inspect.", type: "string" },
    description: { description: "Question details shown to voters.", type: "string" },
    imageUrls: {
      description: "Optional direct HTTPS image URLs.",
      items: { type: "string" },
      type: "array",
    },
    tags: {
      description: "One to three public tags.",
      items: { type: "string" },
      type: ["array", "string"],
    },
    title: { description: "Question title shown to voters.", type: "string" },
    videoUrl: { description: "Optional YouTube URL.", type: "string" },
    ...templateSelectorSchema.properties,
  },
  required: ["title", "description", "contextUrl", "categoryId", "tags"],
  type: "object",
} satisfies JsonSchema;

export const agentBountyInputSchema = {
  additionalProperties: false,
  properties: {
    amount: atomicAmountSchema,
    asset: {
      default: "USDC",
      enum: ["USDC", "usdc"],
      type: "string",
    },
    feedbackClosesAt: {
      description: "Unix timestamp in seconds when feedback bonuses close. 0 means no explicit close.",
      type: ["integer", "string"],
    },
    requiredSettledRounds: {
      description: "Required settled rounds for the bounty.",
      type: ["integer", "string"],
    },
    requiredVoters: {
      description: "Minimum eligible voters required by the bounty.",
      type: ["integer", "string"],
    },
    rewardPoolExpiresAt: {
      description: "Unix timestamp in seconds when bounty claims expire. 0 means no explicit expiry.",
      type: ["integer", "string"],
    },
  },
  required: ["amount"],
  type: "object",
} satisfies JsonSchema;

export const agentRoundConfigInputSchema = {
  additionalProperties: false,
  properties: {
    epochDuration: { type: ["integer", "string"] },
    maxDuration: { type: ["integer", "string"] },
    maxVoters: { type: ["integer", "string"] },
    minVoters: { type: ["integer", "string"] },
  },
  type: "object",
} satisfies JsonSchema;

export const agentOperationLookupInputSchema = {
  additionalProperties: false,
  properties: {
    chainId: { description: "Chain id used with clientRequestId lookup.", type: "integer" },
    clientRequestId: { description: "Client idempotency key returned by curyo_ask_humans.", type: "string" },
    operationKey: { description: "Curyo operation key returned by quote or ask.", type: "string" },
  },
  type: "object",
} satisfies JsonSchema;

export const agentAskInputBaseProperties = {
  bounty: agentBountyInputSchema,
  chainId: chainIdSchema,
  clientRequestId: {
    description: "Idempotency key chosen by the agent.",
    pattern: "^[A-Za-z0-9._:-]{4,160}$",
    type: "string",
  },
  question: agentQuestionInputSchema,
  questions: {
    description: "Ordered bundle of question payloads. The bounty pays only when every question is answered.",
    items: agentQuestionInputSchema,
    type: "array",
  },
  roundConfig: agentRoundConfigInputSchema,
  ...templateSelectorSchema.properties,
} satisfies JsonSchema;

export const agentQuoteInputSchema = {
  additionalProperties: true,
  properties: agentAskInputBaseProperties,
  required: ["clientRequestId", "bounty"],
  type: "object",
} satisfies JsonSchema;

export const agentAskHumansInputSchema = {
  additionalProperties: true,
  properties: {
    ...agentAskInputBaseProperties,
    maxPaymentAmount: {
      description: "Maximum total managed spend, including bounty and service fee, in atomic USDC.",
      pattern: "^\\d+$",
      type: "string",
    },
    mode: {
      default: "sync",
      description: "Use async to return after payment settlement and poll with curyo_get_question_status.",
      enum: ["sync", "async"],
      type: "string",
    },
    webhookUrl: {
      description: "Optional HTTPS callback URL for lifecycle events.",
      type: "string",
    },
    webhookEvents: {
      description: "Optional lifecycle event names to deliver to webhookUrl.",
      items: { type: "string" },
      type: "array",
    },
    webhookSecret: {
      description: "Shared HMAC secret used to sign callback deliveries.",
      type: "string",
    },
  },
  required: ["clientRequestId", "bounty", "maxPaymentAmount"],
  type: "object",
} satisfies JsonSchema;

export const templateListOutputSchema = {
  additionalProperties: false,
  properties: {
    templates: {
      items: {
        additionalProperties: true,
        properties: {
          description: { type: "string" },
          id: { type: "string" },
          interpretation: { type: "object" },
          ratingSystem: { type: "string" },
          recommendedUse: { items: { type: "string" }, type: "array" },
          resultSpecHash: { type: "string" },
          title: { type: "string" },
          version: { type: "integer" },
          voteSemantics: { type: "object" },
        },
        required: ["id", "version", "ratingSystem", "interpretation", "resultSpecHash"],
        type: "object",
      },
      type: "array",
    },
  },
  required: ["templates"],
  type: "object",
} satisfies JsonSchema;

export const agentPaymentOutputSchema = {
  additionalProperties: false,
  properties: {
    amount: atomicAmountSchema,
    asset: { type: "string" },
    decimals: { type: "integer" },
    serviceFeeAmount: atomicAmountSchema,
    tokenAddress: { type: "string" },
  },
  type: "object",
} satisfies JsonSchema;

export const agentQuoteOutputSchema = {
  additionalProperties: true,
  properties: {
    canSubmit: { type: "boolean" },
    clientRequestId: { type: "string" },
    fastLane: { type: "object" },
    operationKey: { type: "string" },
    payment: agentPaymentOutputSchema,
    payloadHash: { type: "string" },
    questionCount: { type: "integer" },
    resolvedCategoryIds: { items: { type: "string" }, type: "array" },
  },
  required: ["canSubmit", "operationKey", "payment", "payloadHash", "questionCount", "resolvedCategoryIds"],
  type: "object",
} satisfies JsonSchema;

export const agentQuestionStatusOutputSchema = {
  additionalProperties: true,
  properties: {
    bundleId: { type: ["string", "null"] },
    chainId: { type: "integer" },
    clientRequestId: { type: "string" },
    contentId: { type: ["string", "null"] },
    contentIds: { items: { type: "string" }, type: "array" },
    error: { type: ["string", "null"] },
    operationKey: { type: "string" },
    payloadHash: { type: "string" },
    payment: agentPaymentOutputSchema,
    publicUrl: { type: ["string", "null"] },
    questionCount: { type: "integer" },
    rewardPoolId: { type: ["string", "null"] },
    status: {
      enum: ["not_found", "payment_settled", "submitting", "submitted", "failed"],
      type: "string",
    },
    transactionHashes: { items: { type: "string" }, type: "array" },
    updatedAt: { type: "string" },
  },
  required: ["status"],
  type: "object",
} satisfies JsonSchema;

export const agentAskHumansOutputSchema = {
  additionalProperties: true,
  properties: {
    ...agentQuestionStatusOutputSchema.properties,
    bounty: { type: "object" },
    fastLane: { type: "object" },
    managedBudget: { type: ["object", "null"] },
    pollAfterMs: { type: "integer" },
    statusTool: { type: "string" },
    warnings: { items: { type: "string" }, type: "array" },
  },
  required: ["status", "operationKey"],
  type: "object",
} satisfies JsonSchema;

export const resultPackageOutputSchema = {
  additionalProperties: true,
  properties: {
    answer: { type: "string" },
    confidence: {
      additionalProperties: false,
      properties: {
        level: { enum: ["none", "low", "medium", "high"], type: "string" },
        score: { type: "number" },
      },
      required: ["level", "score"],
      type: "object",
    },
    distribution: { type: "object" },
    dissentingView: { type: ["string", "null"] },
    limitations: { items: { type: "string" }, type: "array" },
    majorObjections: { items: { type: "object" }, type: "array" },
    methodology: { type: "object" },
    operation: { type: ["object", "null"] },
    protocolState: { type: "object" },
    publicUrl: { type: ["string", "null"] },
    rationaleSummary: { type: "string" },
    ready: { type: "boolean" },
    recommendedNextAction: { type: "string" },
    stakeMass: { type: "object" },
    voteCount: { type: "number" },
  },
  required: [
    "ready",
    "answer",
    "confidence",
    "distribution",
    "voteCount",
    "stakeMass",
    "rationaleSummary",
    "majorObjections",
    "dissentingView",
    "recommendedNextAction",
    "publicUrl",
    "methodology",
    "limitations",
  ],
  type: "object",
} satisfies JsonSchema;

export const agentBotBalanceOutputSchema = {
  additionalProperties: true,
  properties: {
    agentId: { type: "string" },
    dailyBudgetAtomic: atomicAmountSchema,
    perAskLimitAtomic: atomicAmountSchema,
    remainingDailyBudgetAtomic: atomicAmountSchema,
    spentTodayAtomic: atomicAmountSchema,
  },
  required: ["agentId", "dailyBudgetAtomic", "perAskLimitAtomic", "remainingDailyBudgetAtomic", "spentTodayAtomic"],
  type: "object",
} satisfies JsonSchema;
