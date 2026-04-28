import { ROUND_STATE, ROUND_STATE_LABEL } from "@curyo/contracts/protocol";
import { CuryoApiError, CuryoSdkError } from "./errors";
import {
  createCuryoReadClient,
  type CuryoContentDetailsResponse,
  type CuryoRoundItem,
} from "./read";
import type { CuryoFetch } from "./types";

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
type JsonRecord = Record<string, unknown>;

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MCP_PROTOCOL_VERSION = "2025-11-25";
const DEFAULT_AGENT_API_PATH = "/api/agent";
const DEFAULT_MCP_PATH = "/api/mcp";
const AGENT_AUTH_REQUIRED_MESSAGE =
  "Curyo agent asks require mcpAccessToken for the hosted agent API, or a user-controlled wallet execution flow.";

export interface CuryoAgentClientOptions {
  agentApiPath?: string;
  apiBaseUrl?: string;
  mcpApiUrl?: string;
  mcpAccessToken?: string;
  fetchImpl?: CuryoFetch;
  quoteFetchImpl?: CuryoFetch;
  timeoutMs?: number;
  mcpProtocolVersion?: string;
}

export interface CuryoAgentQuestionItem {
  title: string;
  description?: string;
  contextUrl: string;
  categoryId: string | number | bigint;
  tags: string | string[];
  imageUrls?: string[];
  videoUrl?: string;
  [key: string]: unknown;
}

export interface CuryoAgentBounty {
  asset?: "USDC" | string;
  amount: string | number | bigint;
  requiredVoters?: string | number | bigint;
  requiredSettledRounds?: string | number | bigint;
  rewardPoolExpiresAt?: string | number | bigint;
  feedbackClosesAt?: string | number | bigint;
  [key: string]: unknown;
}

export interface CuryoAgentRoundConfig {
  epochDuration?: string | number | bigint;
  blindPhaseSeconds?: string | number | bigint;
  blindSeconds?: string | number | bigint;
  maxDuration?: string | number | bigint;
  maxDurationSeconds?: string | number | bigint;
  deadlineSeconds?: string | number | bigint;
  minVoters?: string | number | bigint;
  maxVoters?: string | number | bigint;
  [key: string]: unknown;
}

export interface CuryoAgentQuestionRequest {
  clientRequestId: string;
  chainId?: number;
  question?: CuryoAgentQuestionItem;
  questions?: CuryoAgentQuestionItem[];
  bounty: CuryoAgentBounty;
  roundConfig?: CuryoAgentRoundConfig;
  [key: string]: unknown;
}

export interface QuoteQuestionRequest extends CuryoAgentQuestionRequest {}

export interface AskHumansRequest extends CuryoAgentQuestionRequest {
  maxPaymentAmount?: string | number | bigint;
  mode?: "sync" | "async";
  paymentAuthorization?: {
    from?: `0x${string}` | string;
    nonce?: `0x${string}` | string;
    signature?: `0x${string}` | string;
    to?: `0x${string}` | string;
    validAfter?: string | number | bigint;
    validBefore?: string | number | bigint;
    value?: string | number | bigint;
    [key: string]: unknown;
  };
  paymentMode?: "wallet_calls" | "x402_authorization";
  transport?: "http" | "mcp";
  walletAddress?: `0x${string}` | string;
}

export interface ConfirmAskTransactionsRequest {
  operationKey: `0x${string}` | string;
  transactionHashes: (`0x${string}` | string)[];
}

export interface QuestionStatusLookup {
  operationKey?: `0x${string}` | string;
  chainId?: number;
  clientRequestId?: string;
}

export interface CuryoAgentPayment {
  amount?: string;
  asset?: string;
  bountyAmount?: string;
  decimals?: number;
  spender?: string;
  tokenAddress?: string;
  [key: string]: unknown;
}

export interface CuryoAgentWalletTransactionCall {
  data?: `0x${string}` | string;
  description?: string;
  functionName?: string;
  id?: string;
  phase?: "approve_usdc" | "reserve_submission" | "submit_question" | "submit_x402_question" | string;
  to?: `0x${string}` | string;
  value?: string;
  waitAfterMs?: number;
  [key: string]: unknown;
}

export interface CuryoAgentWalletTransactionPlan {
  calls?: CuryoAgentWalletTransactionCall[];
  requiresOrderedExecution?: boolean;
  [key: string]: unknown;
}

export interface CuryoAgentWalletInfo {
  address?: `0x${string}` | string;
  fundingMode?: "agent_wallet" | "x402_authorization" | string;
  note?: string;
  [key: string]: unknown;
}

export interface CuryoAgentFastLaneGuidance {
  conservativeStartingBountyAtomic?: string;
  estimatedResultAt?: number;
  estimatedTimeToResultSeconds?: number;
  expectedResponse?: {
    healthyTargetVoters?: string;
    likelyOutcome?: "thin" | "healthy" | "broad" | string;
    minimumExpectedVoters?: string;
    [key: string]: unknown;
  };
  guidance?: string[];
  minimumViableQuorum?: string;
  perRequiredSignalUnitAtomic?: string;
  pricingConfidence?: "low" | "medium" | "high" | string;
  recommendedAction?: "start_small" | "raise_before_submit" | "adjust_round_window" | string;
  requiredSignalUnits?: string;
  speed?: "fast" | "standard" | "slow" | string;
  stretchBountyAmountAtomic?: string;
  suggestedBountyAmountAtomic?: string;
  warnings?: string[];
  [key: string]: unknown;
}

export interface CuryoAgentLiveAskGuidance {
  lowResponseRisk?: "low" | "medium" | "high" | string;
  reasonCodes?: string[];
  recommendedAction?: "wait" | "top_up" | "retry_later" | string;
  suggestedTopUpAtomic?: string | null;
  [key: string]: unknown;
}

export interface QuoteQuestionResponse {
  canSubmit?: boolean;
  clientRequestId?: string;
  fastLane?: CuryoAgentFastLaneGuidance;
  operationKey?: `0x${string}` | string;
  payloadHash?: string;
  payment?: CuryoAgentPayment;
  questionCount?: number;
  resolvedCategoryIds?: string[];
  walletPolicyRequired?: boolean;
  [key: string]: unknown;
}

export interface AskHumansResponse {
  clientRequestId?: string;
  operationKey?: `0x${string}` | string;
  contentId?: string | null;
  contentIds?: string[];
  fastLane?: CuryoAgentFastLaneGuidance;
  managedBudget?: JsonRecord | null;
  nextAction?: string | null;
  pollAfterMs?: number | null;
  publicUrl?: string | null;
  ready?: boolean;
  resultTool?: string | null;
  terminal?: boolean;
  status?: string;
  statusTool?: string;
  confirmTool?: string;
  payment?: CuryoAgentPayment;
  paymentMode?: "wallet_calls" | "x402_authorization" | string;
  rewardPoolId?: string | null;
  transactionPlan?: CuryoAgentWalletTransactionPlan;
  transactionHashes?: string[];
  wallet?: CuryoAgentWalletInfo;
  webhook?: JsonRecord | null;
  warnings?: string[];
  x402AuthorizationRequest?: JsonRecord | null;
  [key: string]: unknown;
}

export interface CallbackDeliveryStatus {
  attemptCount: number;
  callbackUrl: string;
  deliveredAt?: string | null;
  eventId: string;
  eventType: string;
  lastError?: string | null;
  nextAttemptAt: string;
  status: "pending" | "delivering" | "retrying" | "delivered" | "dead";
  subscriptionId: string;
  [key: string]: unknown;
}

export interface QuestionStatusResponse {
  bounty?: JsonRecord;
  bundleId?: string | null;
  callbackDeliveries?: CallbackDeliveryStatus[];
  chainId?: number;
  clientRequestId?: string;
  contentId?: string | null;
  contentIds?: string[];
  error?: string | null;
  nextAction?: string | null;
  operationKey?: `0x${string}` | string;
  payerAddress?: string;
  payloadHash?: string;
  payment?: CuryoAgentPayment;
  pollAfterMs?: number | null;
  publicUrl?: string | null;
  questionCount?: number;
  ready?: boolean;
  liveAskGuidance?: CuryoAgentLiveAskGuidance | null;
  rewardPoolId?: string | null;
  resultTool?: string | null;
  status: string;
  terminal?: boolean;
  transactionHashes?: string[];
  updatedAt?: string;
  [key: string]: unknown;
}

export type CuryoAgentAnswer =
  | "pending"
  | "proceed"
  | "proceed_with_caution"
  | "revise_and_resubmit"
  | "do_not_proceed"
  | "inconclusive"
  | "failed";

export interface CuryoAgentResult {
  ready: boolean;
  answer?: CuryoAgentAnswer | string;
  status?: string;
  operation?: JsonRecord | null;
  result?: unknown;
  confidence?: {
    level?: "none" | "low" | "medium" | "high" | string;
    score?: number;
    [key: string]: unknown;
  };
  cohortSummary?: JsonRecord | null;
  distribution?: JsonRecord;
  voteCount?: number;
  stakeMass?: JsonRecord;
  rationaleSummary?: string;
  majorObjections?: JsonRecord[];
  featureTest?: JsonRecord | null;
  dissentingView?: string | null;
  liveAskGuidance?: CuryoAgentLiveAskGuidance | null;
  recommendedNextAction?: string;
  publicUrl?: string | null;
  methodology?: JsonRecord;
  limitations?: string[];
  protocolState?: JsonRecord;
  [key: string]: unknown;
}

export interface AgentResultTemplate {
  bundleStrategy?: "independent" | "rank_by_rating" | string;
  id: string;
  description?: string;
  interpretation?: JsonRecord;
  ratingSystem?: string;
  recommendedUse?: string[];
  resultSpecHash?: `0x${string}` | string;
  submissionPattern?: "single_question" | "bundle_member" | string;
  templateInputsExample?: JsonValue;
  templateInputsSchema?: JsonRecord;
  title?: string;
  version: number;
  voteSemantics?: {
    up: string;
    down: string;
  };
  [key: string]: unknown;
}

export interface ListResultTemplatesResponse {
  templates: AgentResultTemplate[];
  [key: string]: unknown;
}

export interface CuryoAgentClient {
  quoteQuestion(params: QuoteQuestionRequest): Promise<QuoteQuestionResponse>;
  askHumans(params: AskHumansRequest): Promise<AskHumansResponse>;
  confirmAskTransactions(
    params: ConfirmAskTransactionsRequest,
  ): Promise<QuestionStatusResponse>;
  getQuestionStatus(
    params: QuestionStatusLookup,
  ): Promise<QuestionStatusResponse>;
  getResult(
    params: QuestionStatusLookup & { contentId?: string | bigint },
  ): Promise<CuryoAgentResult>;
  listResultTemplates(): Promise<ListResultTemplatesResponse>;
}

export interface WebhookVerifierOptions {
  secret: string;
  eventIdHeader?: string;
  signatureHeader?: string;
  timestampHeader?: string;
  toleranceSeconds?: number;
}

export interface VerifyWebhookParams {
  body: string | Uint8Array | ArrayBuffer | JsonValue | JsonRecord;
  headers: Headers | Record<string, string | string[] | undefined | null>;
  now?: Date | number;
}

export interface WebhookVerifier {
  verify(params: VerifyWebhookParams): Promise<boolean>;
  assertValid(params: VerifyWebhookParams): Promise<void>;
}

interface NormalizedAgentConfig {
  agentApiPath: string;
  apiBaseUrl?: string;
  mcpApiUrl?: string;
  mcpAccessToken?: string;
  fetchImpl: CuryoFetch;
  timeoutMs: number;
  mcpProtocolVersion: string;
}

type PublicFeedbackItem = {
  body?: string;
  feedbackType?: string;
  roundId?: string | null;
  sourceUrl?: string | null;
  [key: string]: unknown;
};

type PublicFeedbackListResponse = {
  items?: PublicFeedbackItem[];
  [key: string]: unknown;
};

const DEFAULT_AGENT_RESULT_TEMPLATE = {
  id: "generic_rating",
  interpretation: {
    cautionRatingBps: 5500,
    proceedConservativeRatingBps: 5500,
    proceedRatingBps: 6500,
    reviseRatingBps: 4000,
  },
  ratingSystem: "curyo.binary_staked_rating.v1",
  version: 1,
} as const;

const FEATURE_ACCEPTANCE_RESULT_TEMPLATE = {
  id: "feature_acceptance_test",
  interpretation: {
    cautionRatingBps: 6000,
    proceedConservativeRatingBps: 6500,
    proceedRatingBps: 7500,
    reviseRatingBps: 5000,
  },
  ratingSystem: "curyo.binary_staked_rating.v1",
  resultSpecHash: "0x2245ce23320cf4fafe1fe8d340b04dacf0a769aff01929dd7676b331087514f5",
  version: 1,
} as const;

const OBJECTION_FEEDBACK_TYPES = new Set([
  "concern",
  "counterpoint",
  "source_quality",
  "bug_report",
  "repro_steps",
  "usability_blocker",
]);
const FEATURE_FAILURE_FEEDBACK_TYPES = new Set(["bug_report", "repro_steps", "usability_blocker"]);

export function createCuryoAgentClient(
  options: CuryoAgentClientOptions = {},
): CuryoAgentClient {
  const config = normalizeAgentConfig(options);

  return {
    quoteQuestion: (params) => quoteQuestion(params, config),
    askHumans: (params) => askHumans(params, config),
    confirmAskTransactions: (params) => confirmAskTransactions(params, config),
    getQuestionStatus: (params) => getQuestionStatus(params, config),
    getResult: (params) => getResult(params, config),
    listResultTemplates: () => listResultTemplates(config),
  };
}

export function quoteQuestion(
  params: QuoteQuestionRequest,
  options: CuryoAgentClientOptions = {},
): Promise<QuoteQuestionResponse> {
  const config = normalizeAgentConfig(options);
  if (hasDirectAgentHttp(config)) {
    return requestJson<QuoteQuestionResponse>(config, agentQuoteUrl(config), {
      body: stringifyJson(params),
      headers: jsonAgentHeaders(config),
      method: "POST",
    });
  }

  if (config.apiBaseUrl && !config.mcpAccessToken) {
    throw new CuryoSdkError(AGENT_AUTH_REQUIRED_MESSAGE);
  }

  return callMcpTool<QuoteQuestionResponse>(
    config,
    "curyo_quote_question",
    params,
  );
}

export async function askHumans(
  params: AskHumansRequest,
  options: CuryoAgentClientOptions = {},
): Promise<AskHumansResponse> {
  const config = normalizeAgentConfig(options);
  const { transport, ...body } = params;

  if (
    transport === "http" ||
    (transport !== "mcp" && hasDirectAgentHttp(config))
  ) {
    return requestJson<AskHumansResponse>(config, agentAsksUrl(config), {
      body: stringifyJson(body),
      headers: jsonAgentHeaders(config),
      method: "POST",
    });
  }

  if (transport === "mcp" || config.mcpAccessToken) {
    return callMcpTool<AskHumansResponse>(config, "curyo_ask_humans", body);
  }

  throw new CuryoSdkError(AGENT_AUTH_REQUIRED_MESSAGE);
}

export async function confirmAskTransactions(
  params: ConfirmAskTransactionsRequest,
  options: CuryoAgentClientOptions = {},
): Promise<QuestionStatusResponse> {
  const config = normalizeAgentConfig(options);
  if (hasDirectAgentHttp(config)) {
    return requestJson<QuestionStatusResponse>(config, agentConfirmAskUrl(config, params.operationKey), {
      body: stringifyJson({ transactionHashes: params.transactionHashes }),
      headers: jsonAgentHeaders(config),
      method: "POST",
    });
  }

  if (config.mcpAccessToken) {
    return callMcpTool<QuestionStatusResponse>(config, "curyo_confirm_ask_transactions", { ...params });
  }

  throw new CuryoSdkError(AGENT_AUTH_REQUIRED_MESSAGE);
}

export async function getQuestionStatus(
  params: QuestionStatusLookup,
  options: CuryoAgentClientOptions = {},
): Promise<QuestionStatusResponse> {
  const config = normalizeAgentConfig(options);
  if (hasDirectAgentHttp(config)) {
    return requestJson<QuestionStatusResponse>(
      config,
      agentStatusUrl(config, params),
      {
        headers: agentHeaders(config),
        method: "GET",
      },
    );
  }

  if (config.mcpAccessToken) {
    return callMcpTool<QuestionStatusResponse>(
      config,
      "curyo_get_question_status",
      { ...params },
    );
  }

  throw new CuryoSdkError(AGENT_AUTH_REQUIRED_MESSAGE);
}

export async function getResult(
  params: QuestionStatusLookup & { contentId?: string | bigint },
  options: CuryoAgentClientOptions = {},
): Promise<CuryoAgentResult> {
  const config = normalizeAgentConfig(options);
  if (hasDirectAgentHttp(config)) {
    return requestJson<CuryoAgentResult>(
      config,
      agentResultUrl(config, params),
      {
        headers: agentHeaders(config),
        method: "GET",
      },
    );
  }

  const contentId =
    params.contentId === undefined ? "" : String(params.contentId).trim();
  if (contentId && config.apiBaseUrl && !config.mcpAccessToken) {
    return buildPublicAgentResult(config, contentId, null);
  }

  if (config.mcpAccessToken) {
    const result = await callMcpTool<unknown>(config, "curyo_get_result", {
      ...params,
      contentId:
        params.contentId === undefined ? undefined : String(params.contentId),
    });
    return parseAgentResult(result);
  }

  throw new CuryoSdkError(AGENT_AUTH_REQUIRED_MESSAGE);
}

export async function listResultTemplates(
  options: CuryoAgentClientOptions = {},
): Promise<ListResultTemplatesResponse> {
  const config = normalizeAgentConfig(options);
  if (hasDirectAgentHttp(config)) {
    return requestJson<ListResultTemplatesResponse>(
      config,
      agentTemplatesUrl(config),
      {
        headers: agentHeaders(config),
        method: "GET",
      },
    );
  }

  return callMcpTool<ListResultTemplatesResponse>(
    config,
    "curyo_list_result_templates",
    {},
  );
}

async function buildPublicAgentResult(
  config: NormalizedAgentConfig,
  contentId: string,
  operation: JsonRecord | null,
): Promise<CuryoAgentResult> {
  const read = createCuryoReadClient({
    apiBaseUrl: config.apiBaseUrl,
    fetchImpl: config.fetchImpl,
    timeoutMs: config.timeoutMs,
  });

  const [contentResponse, feedbackResponse] = await Promise.all([
    read.getContent(contentId),
    requestJson<PublicFeedbackListResponse>(config, feedbackUrl(config, contentId), {
      headers: {
        accept: "application/json",
      },
      method: "GET",
    }),
  ]);

  return formatPublicAgentResult({
    contentId,
    contentResponse,
    feedback: Array.isArray(feedbackResponse.items) ? feedbackResponse.items : [],
    operation,
    publicUrl: publicQuestionUrl(config, contentId),
  });
}

function formatPublicAgentResult(params: {
  contentId: string;
  contentResponse: CuryoContentDetailsResponse;
  feedback: PublicFeedbackItem[];
  operation: JsonRecord | null;
  publicUrl: string | null;
}): CuryoAgentResult {
  const latestRound = latestRoundFromContentDetails(params.contentResponse);
  const content = params.contentResponse.content as JsonRecord;
  const template = publicResultTemplateFromHash(content.resultSpecHash);
  const roundState = toNumberValue(latestRound?.state, null);
  const ratingBps =
    toNumberValue(content.ratingBps, null) ??
    toNumberValue(latestRound?.ratingBps, null);
  const conservativeRatingBps =
    toNumberValue(content.conservativeRatingBps, null) ??
    toNumberValue(latestRound?.conservativeRatingBps, ratingBps) ??
    ratingBps;
  const rating = toNumberValue(content.rating, null);
  const upStake = toBigIntValue(latestRound?.upPool);
  const downStake = toBigIntValue(latestRound?.downPool);
  const roundStake = toBigIntValue(latestRound?.totalStake);
  const totalStake = roundStake > 0n ? roundStake : upStake + downStake;
  const upShare = bigintShare(upStake, totalStake);
  const downShare = bigintShare(downStake, totalStake);
  const revealedCount = toNumberValue(latestRound?.revealedCount, 0) ?? 0;
  const voteCount =
    toNumberValue(latestRound?.voteCount, toNumberValue(content.totalVotes, 0)) ?? 0;
  const settledRounds = toNumberValue(content.ratingSettledRounds, 0) ?? 0;
  const answer = classifyPublicAnswer({
    conservativeRatingBps,
    ratingBps,
    roundState,
    template,
  });
  const participationTarget =
    Math.max(toNumberValue(content.roundMinVoters, 3) ?? 3, 1) * 2;
  const participationScore = clamp01(revealedCount / participationTarget);
  const marginScore =
    upShare !== null && downShare !== null
      ? Math.abs(upShare - downShare)
      : ratingBps !== null
        ? Math.abs(ratingBps - 5000) / 5000
        : 0;
  const historyScore = clamp01(settledRounds / 3);
  const confidenceScore =
    roundState === ROUND_STATE.Settled
      ? roundScore(0.5 * participationScore + 0.3 * marginScore + 0.2 * historyScore)
      : 0;
  const confidence: NonNullable<CuryoAgentResult["confidence"]> = {
    level: confidenceLevel(confidenceScore),
    score: confidenceScore,
  };
  const majorObjections = buildMajorObjections(params.feedback, downShare);
  const featureTest = buildFeatureTestSummary({
    answer,
    feedback: params.feedback,
    templateId: template.id,
  });
  const feedbackQuality = buildFeedbackQuality(params.feedback, majorObjections);
  const ready = isTerminalRoundState(roundState);
  const stateLabel =
    roundState === null
      ? null
      : ROUND_STATE_LABEL[roundState as keyof typeof ROUND_STATE_LABEL];
  const sourceUrls = [
    ...new Set(
      params.feedback
        .map((item) => (typeof item.sourceUrl === "string" ? item.sourceUrl : null))
        .filter((value): value is string => Boolean(value)),
    ),
  ];
  const feedbackTypes = summarizeFeedbackTypes(params.feedback);
  const limitations = [
    "Curyo ratings are human judgment signals, not factual proof.",
    "Confidence is derived from revealed participation, stake margin, and settled history.",
  ];

  if (!ready)
    limitations.push("The latest round is not final, so the result can change.");
  if (params.feedback.length === 0)
    limitations.push("No public feedback text is available for rationale extraction.");
  if (revealedCount < Math.max(toNumberValue(content.roundMinVoters, 3) ?? 3, 3)) {
    limitations.push("The revealed vote count is low.");
  }

  return {
    answer,
    confidence,
    cohortSummary: null,
    dissentingView:
      downShare !== null && downShare >= 0.15
        ? `Minority down signal: ${Math.round(downShare * 100)}% of revealed stake and ${latestRound?.downCount ?? 0} revealed down votes.`
        : null,
    distribution: {
      conservativeRatingBps,
      down: {
        count: toNumberValue(latestRound?.downCount, 0) ?? 0,
        share: downShare,
        stake: downStake.toString(),
      },
      rating,
      ratingBps,
      revealedCount,
      state: roundState,
      stateLabel,
      up: {
        count: toNumberValue(latestRound?.upCount, 0) ?? 0,
        share: upShare,
        stake: upStake.toString(),
      },
    },
    featureTest,
    feedbackQuality,
    limitations,
    liveAskGuidance: null,
    majorObjections,
    methodology: {
      questionMetadataHash:
        typeof content.questionMetadataHash === "string"
          ? content.questionMetadataHash
          : null,
      ratingSystem: template.ratingSystem,
      resultSpecHash:
        typeof content.resultSpecHash === "string" ? content.resultSpecHash : null,
      sources: ["ponder.content", "ponder.rounds", "public.content_feedback"],
      templateId: template.id,
      templateVersion: template.version,
      thresholds: template.interpretation,
    },
    operation: params.operation,
    protocolState: {
      audienceContext: params.contentResponse.audienceContext,
      categoryId:
        typeof content.categoryId === "string"
          ? content.categoryId
          : String(content.categoryId ?? ""),
      contentId: params.contentId,
      currentRating: rating,
      currentRatingBps: ratingBps,
      effectiveEvidence:
        typeof content.ratingEffectiveEvidence === "string"
          ? content.ratingEffectiveEvidence
          : typeof latestRound?.effectiveEvidence === "string"
            ? latestRound.effectiveEvidence
            : valueToString(latestRound?.effectiveEvidence),
      latestRound,
      question:
        typeof content.question === "string"
          ? content.question
          : params.contentResponse.content.title,
      ratingSettledRounds: settledRounds,
      status: toNumberValue(content.status, null),
    },
    publicUrl: params.publicUrl,
    rationaleSummary: buildRationaleSummary({
      feedbackTypes,
      ratingBps,
      revealedCount,
      stateLabel,
      totalStake,
    }),
    ready,
    recommendedNextAction: recommendedNextAction(
      answer,
      confidence.level,
      majorObjections.length,
    ),
    sourceUrls,
    stakeMass: {
      down: downStake.toString(),
      total: totalStake.toString(),
      unit: "raw_staked_voting_power",
      up: upStake.toString(),
    },
    voteCount,
  };
}

export function parseAgentResult(value: unknown): CuryoAgentResult {
  const parsed = parseMaybeJson(value);
  const unwrapped = unwrapStructuredContent(parsed);
  if (!isJsonRecord(unwrapped)) {
    throw new CuryoSdkError("Agent result must be a JSON object");
  }

  const ready =
    typeof unwrapped.ready === "boolean"
      ? unwrapped.ready
      : inferResultReady(unwrapped);
  return {
    ...unwrapped,
    ready,
  } as CuryoAgentResult;
}

export function buildWebhookVerifier(
  options: WebhookVerifierOptions,
): WebhookVerifier {
  if (!options.secret) {
    throw new CuryoSdkError("Webhook verifier secret is required");
  }

  const eventIdHeader = (
    options.eventIdHeader ?? "x-curyo-callback-id"
  ).toLowerCase();
  const signatureHeader = (
    options.signatureHeader ?? "x-curyo-callback-signature"
  ).toLowerCase();
  const timestampHeader = (
    options.timestampHeader ?? "x-curyo-callback-timestamp"
  ).toLowerCase();
  const toleranceSeconds = options.toleranceSeconds ?? 300;

  async function verify(params: VerifyWebhookParams): Promise<boolean> {
    const signatureHeaderValue = getHeader(params.headers, signatureHeader);
    if (!signatureHeaderValue) return false;

    const eventId = getHeader(params.headers, eventIdHeader);
    if (!eventId) return false;

    const timestamp = getHeader(params.headers, timestampHeader);
    if (
      !timestamp ||
      (toleranceSeconds >= 0 &&
        !isTimestampFresh(timestamp, toleranceSeconds, params.now))
    ) {
      return false;
    }

    const body = bodyToString(params.body);
    const signedPayload = `v1.${eventId}.${timestamp}.${body}`;
    const expected = await hmacSha256Hex(options.secret, signedPayload);
    return signatureMatches(signatureHeaderValue, expected);
  }

  return {
    verify,
    assertValid: async (params) => {
      if (!(await verify(params))) {
        throw new CuryoSdkError("Invalid Curyo webhook signature");
      }
    },
  };
}

async function callMcpTool<T>(
  config: NormalizedAgentConfig,
  name: string,
  args: JsonRecord,
): Promise<T> {
  if (!config.mcpApiUrl) {
    throw new CuryoSdkError(
      "apiBaseUrl or mcpApiUrl is required for MCP agent operations",
    );
  }

  const id = `curyo-sdk-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const body = {
    id,
    jsonrpc: "2.0",
    method: "tools/call",
    params: {
      arguments: args,
      name,
    },
  };

  const headers: Record<string, string> = {
    accept: "application/json",
    "content-type": "application/json",
    "mcp-protocol-version": config.mcpProtocolVersion,
  };
  if (config.mcpAccessToken) {
    headers.authorization = `Bearer ${config.mcpAccessToken}`;
  }

  const rpc = await requestJson<JsonRecord>(config, config.mcpApiUrl, {
    body: stringifyJson(body),
    headers,
    method: "POST",
  });

  if (isJsonRecord(rpc.error)) {
    const message =
      typeof rpc.error.message === "string"
        ? rpc.error.message
        : "Curyo MCP request failed";
    throw new CuryoApiError(message, 400);
  }

  const result = isJsonRecord(rpc.result) ? rpc.result : null;
  const toolResult = isJsonRecord(result?.structuredContent)
    ? result.structuredContent
    : result?.structuredContent;
  if (isJsonRecord(toolResult) && toolResult.isError === true) {
    const message =
      typeof toolResult.message === "string"
        ? toolResult.message
        : "Curyo MCP tool failed";
    throw new CuryoApiError(message, 400);
  }
  if (result?.isError === true) {
    const structured = isJsonRecord(result.structuredContent)
      ? result.structuredContent
      : {};
    const message =
      typeof structured.message === "string"
        ? structured.message
        : "Curyo MCP tool failed";
    throw new CuryoApiError(message, 400);
  }

  return (
    result && "structuredContent" in result
      ? result.structuredContent
      : rpc.result
  ) as T;
}

async function requestJson<T>(
  config: Pick<NormalizedAgentConfig, "fetchImpl" | "timeoutMs">,
  url: string,
  init: RequestInit,
): Promise<T> {
  const response = await fetchWithTimeout(
    config.fetchImpl,
    config.timeoutMs,
    url,
    init,
  );

  const body = await response.text();
  const parsed = body.length === 0 ? null : parseJson(body);

  if (!response.ok) {
    const message =
      isJsonRecord(parsed) && typeof parsed.error === "string"
        ? parsed.error
        : isJsonRecord(parsed) && typeof parsed.message === "string"
          ? parsed.message
          : `Curyo request failed with status ${response.status}`;
    throw new CuryoApiError(message, response.status);
  }

  return parsed as T;
}

async function fetchWithTimeout(
  fetchImpl: CuryoFetch,
  timeoutMs: number,
  url: string,
  init: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetchImpl(url, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new CuryoApiError(`Curyo request timed out after ${timeoutMs}ms`, 504);
    }

    const message = error instanceof Error ? error.message : "Unknown fetch error";
    throw new CuryoApiError(`Curyo request failed: ${message}`, 502);
  } finally {
    clearTimeout(timeoutHandle);
  }
}

function feedbackUrl(config: NormalizedAgentConfig, contentId: string) {
  if (!config.apiBaseUrl) {
    throw new CuryoSdkError(
      "apiBaseUrl is required for public agent feedback reads",
    );
  }

  const url = new URL("/api/feedback", `${config.apiBaseUrl}/`);
  url.searchParams.set("contentId", contentId);
  return url.toString();
}

function publicQuestionUrl(
  config: Pick<NormalizedAgentConfig, "apiBaseUrl">,
  contentId: string | null,
) {
  if (!config.apiBaseUrl || !contentId) return null;
  const url = new URL("/rate", `${config.apiBaseUrl}/`);
  url.searchParams.set("content", contentId);
  return url.toString();
}

function latestRoundFromContentDetails(response: CuryoContentDetailsResponse) {
  if (Array.isArray(response.rounds) && response.rounds.length > 0) {
    return response.rounds[0] ?? null;
  }

  return isJsonRecord(response.content.openRound)
    ? (response.content.openRound as unknown as CuryoRoundItem)
    : null;
}

function toNumberValue(value: unknown, fallback: number | null = null): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return fallback;
}

function toBigIntValue(value: unknown): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isFinite(value)) {
    return BigInt(Math.max(0, Math.floor(value)));
  }
  if (typeof value === "string" && /^\d+$/.test(value)) return BigInt(value);
  return 0n;
}

function bigintShare(numerator: bigint, denominator: bigint): number | null {
  if (denominator <= 0n) return null;
  return Number((numerator * 10_000n) / denominator) / 10_000;
}

function roundScore(value: number) {
  return Math.round(value * 100) / 100;
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function valueToString(value: unknown) {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "bigint") {
    return value.toString();
  }
  return null;
}

function confidenceLevel(score: number): "none" | "low" | "medium" | "high" {
  if (score <= 0) return "none";
  if (score < 0.4) return "low";
  if (score < 0.7) return "medium";
  return "high";
}

function publicResultTemplateFromHash(value: unknown) {
  if (
    typeof value === "string" &&
    value.toLowerCase() === FEATURE_ACCEPTANCE_RESULT_TEMPLATE.resultSpecHash
  ) {
    return FEATURE_ACCEPTANCE_RESULT_TEMPLATE;
  }
  return DEFAULT_AGENT_RESULT_TEMPLATE;
}

function classifyPublicAnswer(params: {
  conservativeRatingBps: number | null;
  ratingBps: number | null;
  roundState: number | null;
  template: typeof DEFAULT_AGENT_RESULT_TEMPLATE | typeof FEATURE_ACCEPTANCE_RESULT_TEMPLATE;
}): CuryoAgentAnswer {
  if (params.roundState === ROUND_STATE.Open || params.roundState === null) return "pending";
  if (params.roundState === ROUND_STATE.Tied) return "inconclusive";
  if (
    params.roundState === ROUND_STATE.Cancelled ||
    params.roundState === ROUND_STATE.RevealFailed
  ) {
    return "failed";
  }
  if (params.roundState !== ROUND_STATE.Settled) return "inconclusive";

  const ratingBps = params.ratingBps ?? 5000;
  const conservativeRatingBps =
    params.conservativeRatingBps ?? params.ratingBps ?? 5000;
  const thresholds = params.template.interpretation;
  if (
    ratingBps >= thresholds.proceedRatingBps &&
    conservativeRatingBps >= thresholds.proceedConservativeRatingBps
  ) {
    return "proceed";
  }
  if (ratingBps >= thresholds.cautionRatingBps) {
    return "proceed_with_caution";
  }
  if (ratingBps >= thresholds.reviseRatingBps) {
    return "revise_and_resubmit";
  }
  return "do_not_proceed";
}

function isTerminalRoundState(roundState: number | null) {
  return (
    roundState === ROUND_STATE.Settled ||
    roundState === ROUND_STATE.Cancelled ||
    roundState === ROUND_STATE.Tied ||
    roundState === ROUND_STATE.RevealFailed
  );
}

function recommendedNextAction(
  answer: CuryoAgentAnswer,
  confidence: NonNullable<CuryoAgentResult["confidence"]>["level"],
  objectionCount: number,
): string {
  if (answer === "pending") return "wait_for_settlement";
  if (answer === "inconclusive") return "collect_more_votes";
  if (answer === "failed") return "manual_review";
  if (answer === "do_not_proceed") return "do_not_proceed";
  if (answer === "revise_and_resubmit") return "revise_and_resubmit";
  if (confidence === "low") return "collect_more_votes";
  if (objectionCount > 0) return "proceed_after_addressing_objections";
  return "proceed";
}

function summarizeFeedbackTypes(feedback: readonly PublicFeedbackItem[]) {
  const counts = new Map<string, number>();
  for (const item of feedback) {
    if (typeof item.feedbackType !== "string" || item.feedbackType.length === 0) {
      continue;
    }
    counts.set(item.feedbackType, (counts.get(item.feedbackType) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([type, count]) => `${count} ${type}`);
}

function summarizeObjectionBody(body: string) {
  const normalized = body.replace(/\s+/g, " ").trim();
  return normalized.length > 220 ? `${normalized.slice(0, 217)}...` : normalized;
}

function buildMajorObjections(
  feedback: readonly PublicFeedbackItem[],
  downShare: number | null,
) {
  const objections = feedback
    .filter(
      (item) =>
        typeof item.feedbackType === "string" &&
        OBJECTION_FEEDBACK_TYPES.has(item.feedbackType) &&
        typeof item.body === "string",
    )
    .slice(0, 5)
    .map((item) => ({
      roundId: typeof item.roundId === "string" ? item.roundId : null,
      sourceUrl: typeof item.sourceUrl === "string" ? item.sourceUrl : null,
      summary: summarizeObjectionBody(item.body as string),
      type: item.feedbackType as string,
    }));

  if (objections.length === 0 && downShare !== null && downShare >= 0.25) {
    objections.push({
      roundId: null,
      sourceUrl: null,
      summary: `${Math.round(downShare * 100)}% of revealed stake voted down, but no public objection text is available.`,
      type: "down_vote_signal",
    });
  }

  return objections;
}

function buildFeatureTestSummary(params: {
  answer: CuryoAgentAnswer;
  feedback: readonly PublicFeedbackItem[];
  templateId: string;
}): JsonRecord | null {
  if (params.templateId !== FEATURE_ACCEPTANCE_RESULT_TEMPLATE.id) {
    return null;
  }

  const failureReports = params.feedback.filter(
    (item) =>
      typeof item.feedbackType === "string" &&
      FEATURE_FAILURE_FEEDBACK_TYPES.has(item.feedbackType) &&
      typeof item.body === "string",
  );
  const blockingReportCount = params.feedback.filter(
    (item) => item.feedbackType === "usability_blocker",
  ).length;
  const reproducibleReportCount = params.feedback.filter(
    (item) => item.feedbackType === "repro_steps",
  ).length;
  const environmentNoteCount = params.feedback.filter(
    (item) => item.feedbackType === "environment_note",
  ).length;
  const verdict =
    params.answer === "do_not_proceed" || params.answer === "revise_and_resubmit"
      ? "blocked"
      : params.answer === "proceed" || params.answer === "proceed_with_caution"
        ? failureReports.length > 0
          ? "works_with_issues"
          : "works"
        : "inconclusive";

  return {
    blockingReportCount,
    environmentNoteCount,
    reproducibleReportCount,
    topFailureReports: failureReports.slice(0, 5).map((item) => ({
      roundId: typeof item.roundId === "string" ? item.roundId : null,
      sourceUrl: typeof item.sourceUrl === "string" ? item.sourceUrl : null,
      summary: summarizeObjectionBody(item.body as string),
      type: item.feedbackType as string,
    })),
    verdict,
  };
}

function buildFeedbackQuality(
  feedback: readonly PublicFeedbackItem[],
  objections: readonly unknown[],
) {
  const sourceUrlCount = new Set(
    feedback
      .map((item) => (typeof item.sourceUrl === "string" ? item.sourceUrl : null))
      .filter(Boolean),
  ).size;
  const publicNoteCount = feedback.length;
  let actionability: "none" | "low" | "medium" | "high" = "none";
  if (publicNoteCount > 0) actionability = "low";
  if (objections.length > 0 || sourceUrlCount > 0 || publicNoteCount >= 3) {
    actionability = "medium";
  }
  if (objections.length >= 2 && (sourceUrlCount > 0 || publicNoteCount >= 5)) {
    actionability = "high";
  }

  return {
    actionability,
    objectionCount: objections.length,
    publicNoteCount,
    sourceUrlCount,
  };
}

function buildRationaleSummary(params: {
  feedbackTypes: string[];
  ratingBps: number | null;
  revealedCount: number;
  stateLabel: string | null;
  totalStake: bigint;
}) {
  const ratingText =
    params.ratingBps === null ? "no rating yet" : `${Math.round(params.ratingBps / 100)}/100`;
  const feedbackText =
    params.feedbackTypes.length > 0
      ? `Public feedback includes ${params.feedbackTypes.join(", ")}.`
      : "No public voter feedback is available.";
  return `Latest ${params.stateLabel ?? "unknown"} round has ${ratingText}, ${params.revealedCount} revealed votes, and ${params.totalStake.toString()} raw stake. ${feedbackText}`;
}

function normalizeAgentConfig(
  options: CuryoAgentClientOptions,
): NormalizedAgentConfig {
  const apiBaseUrl = normalizeUrl(options.apiBaseUrl);
  const fetchImpl = options.fetchImpl ?? fetch;
  return {
    agentApiPath: options.agentApiPath ?? DEFAULT_AGENT_API_PATH,
    apiBaseUrl,
    fetchImpl,
    mcpAccessToken: options.mcpAccessToken,
    mcpApiUrl:
      normalizeUrl(options.mcpApiUrl) ??
      (apiBaseUrl
        ? new URL(DEFAULT_MCP_PATH, `${apiBaseUrl}/`).toString()
        : undefined),
    mcpProtocolVersion:
      options.mcpProtocolVersion ?? DEFAULT_MCP_PROTOCOL_VERSION,
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  };
}

function normalizeUrl(value?: string) {
  if (!value) return undefined;

  try {
    return new URL(value).toString().replace(/\/+$/, "");
  } catch {
    throw new CuryoSdkError(`Invalid URL: ${value}`);
  }
}

function agentBaseUrl(config: NormalizedAgentConfig) {
  if (!config.apiBaseUrl) {
    throw new CuryoSdkError(
      "apiBaseUrl is required for direct agent HTTP operations",
    );
  }

  return new URL(
    config.agentApiPath.replace(/\/+$/, ""),
    `${config.apiBaseUrl}/`,
  ).toString();
}

function agentQuoteUrl(config: NormalizedAgentConfig) {
  return new URL("./quote", `${agentBaseUrl(config)}/`).toString();
}

function agentAsksUrl(config: NormalizedAgentConfig) {
  return new URL("./asks", `${agentBaseUrl(config)}/`).toString();
}

function agentConfirmAskUrl(config: NormalizedAgentConfig, operationKey: string) {
  const trimmed = operationKey.trim();
  if (!trimmed) {
    throw new CuryoSdkError("operationKey is required to confirm ask transactions");
  }
  return new URL(`./asks/${trimmed}/confirm`, `${agentBaseUrl(config)}/`).toString();
}

function agentStatusUrl(
  config: NormalizedAgentConfig,
  params: QuestionStatusLookup,
) {
  const operationKey =
    typeof params.operationKey === "string" ? params.operationKey.trim() : "";
  if (operationKey) {
    return new URL(
      `./asks/${operationKey}`,
      `${agentBaseUrl(config)}/`,
    ).toString();
  }

  if (!params.chainId || !params.clientRequestId) {
    throw new CuryoSdkError(
      "Provide operationKey or both chainId and clientRequestId",
    );
  }

  const url = new URL("./asks/by-client-request", `${agentBaseUrl(config)}/`);
  url.searchParams.set("chainId", String(params.chainId));
  url.searchParams.set("clientRequestId", params.clientRequestId);
  return url.toString();
}

function agentResultUrl(
  config: NormalizedAgentConfig,
  params: QuestionStatusLookup & { contentId?: string | bigint },
) {
  const contentId =
    params.contentId === undefined ? "" : String(params.contentId).trim();
  if (contentId) {
    return new URL(
      `./results/by-content/${encodeURIComponent(contentId)}`,
      `${agentBaseUrl(config)}/`,
    ).toString();
  }

  const operationKey =
    typeof params.operationKey === "string" ? params.operationKey.trim() : "";
  if (operationKey) {
    return new URL(
      `./results/${operationKey}`,
      `${agentBaseUrl(config)}/`,
    ).toString();
  }

  if (!params.chainId || !params.clientRequestId) {
    throw new CuryoSdkError(
      "Provide contentId, operationKey, or both chainId and clientRequestId",
    );
  }

  const url = new URL(
    "./results/by-client-request",
    `${agentBaseUrl(config)}/`,
  );
  url.searchParams.set("chainId", String(params.chainId));
  url.searchParams.set("clientRequestId", params.clientRequestId);
  return url.toString();
}

function agentTemplatesUrl(config: NormalizedAgentConfig) {
  return new URL("./templates", `${agentBaseUrl(config)}/`).toString();
}

function hasDirectAgentHttp(config: NormalizedAgentConfig) {
  return Boolean(config.apiBaseUrl && config.mcpAccessToken);
}

function agentHeaders(config: NormalizedAgentConfig) {
  if (!config.mcpAccessToken) {
    throw new CuryoSdkError(
      "mcpAccessToken is required for authenticated agent HTTP operations",
    );
  }

  return {
    accept: "application/json",
    authorization: `Bearer ${config.mcpAccessToken}`,
  };
}

function jsonAgentHeaders(config: NormalizedAgentConfig) {
  return {
    ...agentHeaders(config),
    "content-type": "application/json",
  };
}

function parseJson(body: string): unknown {
  try {
    return JSON.parse(body) as unknown;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown parse error";
    throw new CuryoApiError(`Curyo returned invalid JSON: ${message}`, 502);
  }
}

function stringifyJson(value: unknown) {
  return JSON.stringify(value, (_key, entry) =>
    typeof entry === "bigint" ? entry.toString() : entry,
  );
}

function parseMaybeJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  return parseJson(value);
}

function unwrapStructuredContent(value: unknown): unknown {
  if (!isJsonRecord(value)) return value;
  if (isJsonRecord(value.structuredContent)) return value.structuredContent;
  if (isJsonRecord(value.result)) {
    if (isJsonRecord(value.result.structuredContent))
      return value.result.structuredContent;
    return value.result;
  }
  if (Array.isArray(value.content)) {
    const textPart = value.content.find(
      (part) =>
        isJsonRecord(part) &&
        part.type === "text" &&
        typeof part.text === "string",
    );
    if (isJsonRecord(textPart) && typeof textPart.text === "string") {
      return parseMaybeJson(textPart.text);
    }
  }
  return value;
}

function inferResultReady(value: JsonRecord): boolean {
  if (isJsonRecord(value.result) && typeof value.result.ready === "boolean")
    return value.result.ready;
  if (value.result === null) return false;
  if (typeof value.answer === "string") return value.answer !== "pending";
  return false;
}

function isJsonRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getHeader(
  headers: Headers | Record<string, string | string[] | undefined | null>,
  name: string,
) {
  if (headers instanceof Headers) {
    return headers.get(name) ?? undefined;
  }

  const found = Object.entries(headers).find(
    ([key]) => key.toLowerCase() === name.toLowerCase(),
  )?.[1];
  return Array.isArray(found) ? found.join(",") : (found ?? undefined);
}

function bodyToString(body: VerifyWebhookParams["body"]): string {
  if (typeof body === "string") return body;
  if (body instanceof Uint8Array) return new TextDecoder().decode(body);
  if (body instanceof ArrayBuffer) return new TextDecoder().decode(body);
  return stringifyJson(body);
}

function isTimestampFresh(
  timestamp: string,
  toleranceSeconds: number,
  now: Date | number | undefined,
) {
  const timestampMs = /^\d+$/.test(timestamp)
    ? Number(timestamp) * (timestamp.length <= 10 ? 1000 : 1)
    : Date.parse(timestamp);
  if (!Number.isFinite(timestampMs)) return false;
  const nowMs =
    now instanceof Date
      ? now.getTime()
      : typeof now === "number"
        ? now
        : Date.now();
  return Math.abs(nowMs - timestampMs) <= toleranceSeconds * 1000;
}

async function hmacSha256Hex(secret: string, payload: string) {
  const encoder = new TextEncoder();
  const key = await globalThis.crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["sign"],
  );
  const signature = await globalThis.crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(payload),
  );
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function signatureMatches(headerValue: string, expectedHex: string) {
  const expected = expectedHex.toLowerCase();
  const candidates = headerValue
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => value.replace(/^(?:sha256|v1)=/i, "").toLowerCase());

  return candidates.some((candidate) => constantTimeEqual(candidate, expected));
}

function constantTimeEqual(a: string, b: string) {
  if (!/^[a-f0-9]+$/i.test(a) || !/^[a-f0-9]+$/i.test(b)) return false;
  if (a.length !== b.length) return false;

  let mismatch = 0;
  for (let index = 0; index < a.length; index++) {
    mismatch |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return mismatch === 0;
}
