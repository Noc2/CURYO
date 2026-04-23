import { createHash } from "crypto";
import {
  AGENT_CALLBACK_EVENT_TYPES,
  type AgentCallbackEventType,
  enqueueAgentCallbackEvent,
  upsertAgentCallbackSubscription,
} from "~~/lib/agent-callbacks";
import { buildAgentFastLaneGuidance } from "~~/lib/agent/fastLane";
import { buildAgentResultPackage } from "~~/lib/agent/resultPackage";
import {
  agentAskHumansInputSchema,
  agentAskHumansOutputSchema,
  agentBotBalanceOutputSchema,
  agentOperationLookupInputSchema,
  agentQuestionStatusOutputSchema,
  agentQuoteInputSchema,
  agentQuoteOutputSchema,
  resultPackageOutputSchema,
  templateListOutputSchema,
} from "~~/lib/agent/schemas";
import { listAgentResultTemplates } from "~~/lib/agent/templates";
import { getOptionalAppUrl } from "~~/lib/env/server";
import { buildContentFeedbackRoundContext, listContentFeedback } from "~~/lib/feedback/contentFeedback";
import { MCP_SCOPES, type McpAgentAuth, type McpScope } from "~~/lib/mcp/auth";
import {
  McpBudgetError,
  getMcpAgentBudgetSummary,
  getMcpBudgetReservation,
  getMcpBudgetReservationByClientRequest,
  reserveMcpAgentBudget,
  updateMcpBudgetReservation,
} from "~~/lib/mcp/budget";
import { type X402QuestionPayload, X402_USDC_DECIMALS, parseX402QuestionRequest } from "~~/lib/x402/questionPayload";
import {
  X402QuestionConfigError,
  X402QuestionConflictError,
  completeManagedQuestionSubmissionRequest,
  getX402QuestionSubmissionByOperationKey,
  handleManagedQuestionSubmissionRequest,
  preflightX402QuestionSubmission,
  resolveX402QuestionConfig,
  startManagedQuestionSubmissionRequest,
  x402QuestionSubmissionRecordBody,
} from "~~/lib/x402/questionSubmission";
import { ponderApi } from "~~/services/ponder/client";

type JsonObject = Record<string, unknown>;

type McpToolDefinition = {
  description: string;
  inputSchema: JsonObject;
  name: string;
  outputSchema?: JsonObject;
  requiredScope: McpScope;
  title: string;
};

type AskHumansMode = "sync" | "async";
type BackgroundTaskScheduler = (task: () => Promise<void> | void) => void;

type McpToolDependencies = {
  completeManagedQuestionSubmissionRequest: typeof completeManagedQuestionSubmissionRequest;
  enqueueAgentCallbackEvent: typeof enqueueAgentCallbackEvent;
  getMcpAgentBudgetSummary: typeof getMcpAgentBudgetSummary;
  handleManagedQuestionSubmissionRequest: typeof handleManagedQuestionSubmissionRequest;
  preflightX402QuestionSubmission: typeof preflightX402QuestionSubmission;
  reserveMcpAgentBudget: typeof reserveMcpAgentBudget;
  resolveX402QuestionConfig: typeof resolveX402QuestionConfig;
  startManagedQuestionSubmissionRequest: typeof startManagedQuestionSubmissionRequest;
  updateMcpBudgetReservation: typeof updateMcpBudgetReservation;
  upsertAgentCallbackSubscription: typeof upsertAgentCallbackSubscription;
};

let mcpToolTestOverrides: Partial<McpToolDependencies> | null = null;

function getMcpToolDependencies(): McpToolDependencies {
  return {
    completeManagedQuestionSubmissionRequest:
      mcpToolTestOverrides?.completeManagedQuestionSubmissionRequest ?? completeManagedQuestionSubmissionRequest,
    enqueueAgentCallbackEvent: mcpToolTestOverrides?.enqueueAgentCallbackEvent ?? enqueueAgentCallbackEvent,
    getMcpAgentBudgetSummary: mcpToolTestOverrides?.getMcpAgentBudgetSummary ?? getMcpAgentBudgetSummary,
    handleManagedQuestionSubmissionRequest:
      mcpToolTestOverrides?.handleManagedQuestionSubmissionRequest ?? handleManagedQuestionSubmissionRequest,
    preflightX402QuestionSubmission:
      mcpToolTestOverrides?.preflightX402QuestionSubmission ?? preflightX402QuestionSubmission,
    reserveMcpAgentBudget: mcpToolTestOverrides?.reserveMcpAgentBudget ?? reserveMcpAgentBudget,
    resolveX402QuestionConfig: mcpToolTestOverrides?.resolveX402QuestionConfig ?? resolveX402QuestionConfig,
    startManagedQuestionSubmissionRequest:
      mcpToolTestOverrides?.startManagedQuestionSubmissionRequest ?? startManagedQuestionSubmissionRequest,
    updateMcpBudgetReservation: mcpToolTestOverrides?.updateMcpBudgetReservation ?? updateMcpBudgetReservation,
    upsertAgentCallbackSubscription:
      mcpToolTestOverrides?.upsertAgentCallbackSubscription ?? upsertAgentCallbackSubscription,
  };
}

export function __setMcpToolTestOverridesForTests(overrides: Partial<McpToolDependencies> | null) {
  mcpToolTestOverrides = overrides;
}

export class McpToolError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "McpToolError";
    this.status = status;
  }
}

export const MCP_TOOLS: McpToolDefinition[] = [
  {
    description: "List Curyo categories that paid asks can target.",
    inputSchema: {
      additionalProperties: false,
      properties: {},
      type: "object",
    },
    name: "curyo_list_categories",
    requiredScope: MCP_SCOPES.read,
    title: "List Curyo Categories",
  },
  {
    description: "List off-chain result interpretation templates used by Curyo agent asks.",
    inputSchema: {
      additionalProperties: false,
      properties: {},
      type: "object",
    },
    name: "curyo_list_result_templates",
    outputSchema: templateListOutputSchema,
    requiredScope: MCP_SCOPES.read,
    title: "List Result Templates",
  },
  {
    description: "Preflight and price a paid question before reserving spend.",
    inputSchema: agentQuoteInputSchema,
    name: "curyo_quote_question",
    outputSchema: agentQuoteOutputSchema,
    requiredScope: MCP_SCOPES.quote,
    title: "Quote Human Ask",
  },
  {
    description: "Reserve managed MCP budget and submit a paid question for verified humans to rate.",
    inputSchema: agentAskHumansInputSchema,
    name: "curyo_ask_humans",
    outputSchema: agentAskHumansOutputSchema,
    requiredScope: MCP_SCOPES.ask,
    title: "Ask Humans",
  },
  {
    description: "Get paid ask operation status by operationKey or chainId plus clientRequestId.",
    inputSchema: agentOperationLookupInputSchema,
    name: "curyo_get_question_status",
    outputSchema: agentQuestionStatusOutputSchema,
    requiredScope: MCP_SCOPES.read,
    title: "Get Question Status",
  },
  {
    description: "Fetch the public human signal for a submitted question.",
    inputSchema: {
      additionalProperties: false,
      properties: {
        chainId: { description: "Chain id used with clientRequestId lookup.", type: "integer" },
        clientRequestId: { description: "Client idempotency key returned by curyo_ask_humans.", type: "string" },
        contentId: { description: "Curyo content id.", type: "string" },
        operationKey: { description: "Curyo operation key returned by quote or ask.", type: "string" },
      },
      type: "object",
    },
    name: "curyo_get_result",
    outputSchema: resultPackageOutputSchema,
    requiredScope: MCP_SCOPES.read,
    title: "Get Human Result",
  },
  {
    description: "Show this authenticated agent's managed MCP budget and caps.",
    inputSchema: {
      additionalProperties: false,
      properties: {},
      type: "object",
    },
    name: "curyo_get_bot_balance",
    outputSchema: agentBotBalanceOutputSchema,
    requiredScope: MCP_SCOPES.balance,
    title: "Get Bot Balance",
  },
];

function asObject(value: unknown): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new McpToolError("Tool arguments must be an object.");
  }
  return value as JsonObject;
}

function parseMaxPaymentAmount(value: unknown): bigint {
  const rawValue =
    typeof value === "number" || typeof value === "bigint" || typeof value === "string" ? String(value) : "";
  if (!/^\d+$/.test(rawValue.trim())) {
    throw new McpToolError("maxPaymentAmount must be a non-negative integer string.");
  }
  return BigInt(rawValue);
}

function parseAskHumansMode(value: unknown): AskHumansMode {
  if (value === undefined || value === null) return "sync";
  if (value === "sync" || value === "async") return value;
  throw new McpToolError("mode must be either sync or async.");
}

function parseWebhookOptions(args: JsonObject): {
  events: AgentCallbackEventType[];
  secret: string;
  url: string;
} | null {
  const url = typeof args.webhookUrl === "string" ? args.webhookUrl.trim() : "";
  if (!url) return null;
  const secret = typeof args.webhookSecret === "string" ? args.webhookSecret.trim() : "";
  if (!secret) {
    throw new McpToolError("webhookSecret is required when webhookUrl is provided.");
  }

  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1") {
      throw new McpToolError("webhookUrl must use https outside local development.");
    }
  } catch (error) {
    if (error instanceof McpToolError) throw error;
    throw new McpToolError("webhookUrl must be a valid URL.");
  }

  const rawEvents = Array.isArray(args.webhookEvents)
    ? args.webhookEvents.filter((event): event is string => typeof event === "string")
    : [];
  const events =
    rawEvents.length > 0
      ? rawEvents.filter((event): event is AgentCallbackEventType =>
          AGENT_CALLBACK_EVENT_TYPES.includes(event as AgentCallbackEventType),
        )
      : ([
          "question.submitting",
          "question.submitted",
          "question.failed",
          "question.settled",
          "feedback.unlocked",
          "bounty.low_response",
        ] satisfies AgentCallbackEventType[]);

  if (events.length === 0) {
    throw new McpToolError("webhookEvents must include at least one supported event type.");
  }

  return {
    events,
    secret,
    url,
  };
}

function getPublicQuestionUrl(contentId: string | null) {
  const appUrl = getOptionalAppUrl();
  return appUrl && contentId ? `${appUrl}/rate?content=${encodeURIComponent(contentId)}` : null;
}

function normalizeMcpPayment(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const payment = value as JsonObject;
  const asset = typeof payment.asset === "string" ? payment.asset : "";
  return {
    ...payment,
    asset: "USDC",
    decimals: X402_USDC_DECIMALS,
    tokenAddress: asset.startsWith("0x") ? asset : payment.tokenAddress,
  };
}

function normalizeMcpQuestionBody(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const body = value as JsonObject;
  return {
    ...body,
    payment: normalizeMcpPayment(body.payment),
  };
}

function callbackEventId(operationKey: `0x${string}`, eventType: AgentCallbackEventType) {
  return `${operationKey}:${eventType}`;
}

function callbackPayload(params: {
  body: JsonObject;
  chainId: number;
  clientRequestId: string;
  eventType: AgentCallbackEventType;
  operationKey: `0x${string}`;
}) {
  const contentId = typeof params.body.contentId === "string" ? params.body.contentId : null;
  const contentIds = Array.isArray(params.body.contentIds)
    ? params.body.contentIds.filter((id): id is string => typeof id === "string")
    : [];
  return {
    chainId: params.chainId,
    clientRequestId: params.clientRequestId,
    contentId,
    contentIds,
    error: typeof params.body.error === "string" ? params.body.error : null,
    eventType: params.eventType,
    operationKey: params.operationKey,
    publicUrl: getPublicQuestionUrl(contentId),
    status: typeof params.body.status === "string" ? params.body.status : null,
  };
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function buildManagedMcpClientRequestId(agent: McpAgentAuth, clientRequestId: string) {
  return `mcp:${sha256(`${agent.id}:${clientRequestId}`).slice(0, 48)}`;
}

function toManagedMcpPayload(agent: McpAgentAuth, payload: X402QuestionPayload): X402QuestionPayload {
  return {
    ...payload,
    clientRequestId: buildManagedMcpClientRequestId(agent, payload.clientRequestId),
  };
}

async function lookupQuestionOperation(args: JsonObject, agent: McpAgentAuth) {
  const operationKey = typeof args.operationKey === "string" ? args.operationKey.trim() : "";
  if (operationKey) {
    if (!/^0x[a-fA-F0-9]{64}$/.test(operationKey)) {
      throw new McpToolError("operationKey must be a 32-byte hex string.");
    }
    const reservation = await getMcpBudgetReservation(operationKey as `0x${string}`);
    if (reservation && reservation.agentId !== agent.id) {
      throw new McpToolError("Operation was not submitted by this MCP agent.", 404);
    }
    return getX402QuestionSubmissionByOperationKey(operationKey as `0x${string}`);
  }

  const chainId = Number.parseInt(String(args.chainId ?? ""), 10);
  const clientRequestId = typeof args.clientRequestId === "string" ? args.clientRequestId.trim() : "";
  if (!Number.isSafeInteger(chainId) || chainId <= 0 || !clientRequestId) {
    throw new McpToolError("Provide operationKey or both chainId and clientRequestId.");
  }

  const reservation = await getMcpBudgetReservationByClientRequest({
    agentId: agent.id,
    chainId,
    clientRequestId,
  });
  if (!reservation) return null;

  return getX402QuestionSubmissionByOperationKey(reservation.operationKey);
}

function formatQuoteResult(
  params: Awaited<ReturnType<typeof preflightX402QuestionSubmission>>,
  payload: X402QuestionPayload,
  tokenAddress: string,
) {
  return {
    canSubmit: true,
    fastLane: buildAgentFastLaneGuidance({
      bounty: payload.bounty,
      questionCount: payload.questions.length,
      roundConfig: payload.roundConfig,
    }),
    operationKey: params.operation.operationKey,
    payment: {
      amount: params.paymentAmount.toString(),
      asset: "USDC",
      decimals: X402_USDC_DECIMALS,
      tokenAddress,
    },
    payloadHash: params.operation.payloadHash,
    questionCount: params.resolvedCategoryIds.length,
    resolvedCategoryIds: params.resolvedCategoryIds.map(categoryId => categoryId.toString()),
  };
}

async function quoteQuestion(args: JsonObject, agent: McpAgentAuth) {
  const dependencies = getMcpToolDependencies();
  const payload = parseX402QuestionRequest(args);
  const managedPayload = toManagedMcpPayload(agent, payload);
  const config = dependencies.resolveX402QuestionConfig(managedPayload.chainId, { requireThirdwebSecret: false });
  const quote = await dependencies.preflightX402QuestionSubmission({ config, payload: managedPayload });
  return {
    ...formatQuoteResult(quote, payload, config.usdcAddress),
    clientRequestId: payload.clientRequestId,
  };
}

function latestRoundFromContentResponse(response: Awaited<ReturnType<typeof ponderApi.getContentById>>) {
  const rounds = Array.isArray(response.rounds) ? response.rounds : [];
  return rounds[0] ?? null;
}

async function buildQuestionResult(args: JsonObject, agent: McpAgentAuth) {
  const directContentId = typeof args.contentId === "string" ? args.contentId.trim() : "";
  const record = directContentId ? null : await lookupQuestionOperation(args, agent);
  const contentId = directContentId || record?.contentId;

  if (!contentId) {
    return {
      operation: normalizeMcpQuestionBody(x402QuestionSubmissionRecordBody(record)),
      ready: false,
      result: null,
    };
  }

  const response = await ponderApi.getContentById(contentId);
  const latestRound = latestRoundFromContentResponse(response);
  const feedbackContext = buildContentFeedbackRoundContext(
    Array.isArray(response.rounds) ? response.rounds : [],
    response.content.openRound?.roundId ?? null,
  );
  const feedback = await listContentFeedback({ contentId, context: feedbackContext });
  const resultPackage = buildAgentResultPackage({
    audienceContext: response.audienceContext,
    content: response.content,
    feedback: feedback.items,
    latestRound,
    publicUrl: getPublicQuestionUrl(contentId),
  });

  return {
    operation: record ? normalizeMcpQuestionBody(x402QuestionSubmissionRecordBody(record)) : null,
    ...resultPackage,
  };
}

export async function callCuryoMcpTool(params: {
  agent: McpAgentAuth;
  arguments: unknown;
  name: string;
  scheduleBackgroundTask?: BackgroundTaskScheduler;
}) {
  const dependencies = getMcpToolDependencies();
  const args = asObject(params.arguments ?? {});

  switch (params.name) {
    case "curyo_list_categories":
      return ponderApi.getCategories();

    case "curyo_list_result_templates":
      return { templates: listAgentResultTemplates() };

    case "curyo_quote_question":
      return quoteQuestion(args, params.agent);

    case "curyo_ask_humans": {
      const mode = parseAskHumansMode(args.mode);
      const scheduleBackgroundTask = params.scheduleBackgroundTask;
      if (mode === "async" && !scheduleBackgroundTask) {
        throw new McpToolError("Async ask_humans requires a background task scheduler.", 503);
      }

      const payload = parseX402QuestionRequest(args);
      const webhook = parseWebhookOptions(args);
      const managedPayload = toManagedMcpPayload(params.agent, payload);
      const config = dependencies.resolveX402QuestionConfig(managedPayload.chainId, { requireThirdwebSecret: false });
      const quote = await dependencies.preflightX402QuestionSubmission({ config, payload: managedPayload });
      const fastLane = buildAgentFastLaneGuidance({
        bounty: payload.bounty,
        questionCount: payload.questions.length,
        roundConfig: payload.roundConfig,
      });
      const maxPaymentAmount = parseMaxPaymentAmount(args.maxPaymentAmount);
      if (quote.paymentAmount > maxPaymentAmount) {
        throw new McpToolError("Quoted payment exceeds maxPaymentAmount.");
      }

      await dependencies.reserveMcpAgentBudget({
        agent: params.agent,
        amount: quote.paymentAmount,
        categoryId: payload.questions[0]?.categoryId.toString() ?? "0",
        chainId: payload.chainId,
        clientRequestId: payload.clientRequestId,
        operationKey: quote.operation.operationKey,
        payloadHash: quote.operation.payloadHash,
      });

      const callbackWarnings: string[] = [];
      if (webhook) {
        await dependencies.upsertAgentCallbackSubscription({
          agentId: params.agent.id,
          callbackUrl: webhook.url,
          eventTypes: webhook.events,
          secret: webhook.secret,
        });
      }

      const enqueueCallbackEvent = async (eventType: AgentCallbackEventType, body: JsonObject) => {
        if (!webhook) return;
        try {
          await dependencies.enqueueAgentCallbackEvent({
            agentId: params.agent.id,
            eventId: callbackEventId(quote.operation.operationKey, eventType),
            eventType,
            payload: callbackPayload({
              body,
              chainId: payload.chainId,
              clientRequestId: payload.clientRequestId,
              eventType,
              operationKey: quote.operation.operationKey,
            }),
          });
        } catch (error) {
          console.error("[mcp] callback enqueue failed", error);
          callbackWarnings.push(`callback_enqueue_failed:${eventType}`);
        }
      };

      const webhookInfo = webhook
        ? {
            delivery: "signed_hmac_sha256",
            events: webhook.events,
            registered: true,
            signatureHeaders: ["x-curyo-callback-id", "x-curyo-callback-timestamp", "x-curyo-callback-signature"],
          }
        : null;

      if (mode === "async") {
        let started: Awaited<ReturnType<typeof startManagedQuestionSubmissionRequest>>;
        try {
          started = await dependencies.startManagedQuestionSubmissionRequest({
            agentId: params.agent.id,
            payload: managedPayload,
          });
        } catch (error) {
          await dependencies.updateMcpBudgetReservation({
            error: error instanceof Error ? error.message : String(error),
            operationKey: quote.operation.operationKey,
            status: "failed",
          });
          await enqueueCallbackEvent("question.failed", {
            error: error instanceof Error ? error.message : String(error),
            status: "failed",
          });
          throw error;
        }

        const body = started.body as JsonObject;
        const warnings: string[] = [];
        if (started.shouldSubmit) {
          try {
            scheduleBackgroundTask!(async () => {
              try {
                const completed = await dependencies.completeManagedQuestionSubmissionRequest({
                  agentId: params.agent.id,
                  payload: managedPayload,
                });
                const completedBody = completed.body as JsonObject;
                await dependencies.updateMcpBudgetReservation({
                  contentId: typeof completedBody.contentId === "string" ? completedBody.contentId : null,
                  operationKey: quote.operation.operationKey,
                  status: "submitted",
                });
                await enqueueCallbackEvent("question.submitted", completedBody);
              } catch (error) {
                console.error("[mcp] async ask completion failed", error);
                try {
                  await dependencies.updateMcpBudgetReservation({
                    error: error instanceof Error ? error.message : String(error),
                    operationKey: quote.operation.operationKey,
                    status: "failed",
                  });
                  await enqueueCallbackEvent("question.failed", {
                    error: error instanceof Error ? error.message : String(error),
                    status: "failed",
                  });
                } catch (budgetError) {
                  console.error("[mcp] async ask budget failure update failed", budgetError);
                }
              }
            });
          } catch (error) {
            await dependencies.updateMcpBudgetReservation({
              error: error instanceof Error ? error.message : String(error),
              operationKey: quote.operation.operationKey,
              status: "failed",
            });
            await enqueueCallbackEvent("question.failed", {
              error: error instanceof Error ? error.message : String(error),
              status: "failed",
            });
            throw error;
          }
        } else if (body.status === "submitted") {
          try {
            await dependencies.updateMcpBudgetReservation({
              contentId: typeof body.contentId === "string" ? body.contentId : null,
              operationKey: quote.operation.operationKey,
              status: "submitted",
            });
            await enqueueCallbackEvent("question.submitted", body);
          } catch (error) {
            console.error("[mcp] submitted ask bookkeeping update failed", error);
            warnings.push("submitted_budget_update_failed");
          }
        } else {
          await enqueueCallbackEvent("question.submitting", body);
        }

        let managedBudget: Awaited<ReturnType<typeof getMcpAgentBudgetSummary>> | null = null;
        try {
          managedBudget = await dependencies.getMcpAgentBudgetSummary(params.agent);
        } catch (error) {
          console.error("[mcp] budget summary unavailable after async ask start", error);
          warnings.push("managed_budget_unavailable");
        }

        return {
          ...(normalizeMcpQuestionBody(body) as JsonObject),
          clientRequestId: payload.clientRequestId,
          fastLane,
          managedBudget,
          pollAfterMs: 5_000,
          publicUrl: getPublicQuestionUrl(typeof body.contentId === "string" ? body.contentId : null),
          statusTool: "curyo_get_question_status",
          webhook: webhookInfo,
          warnings: [...warnings, ...callbackWarnings],
        };
      }

      let result: Awaited<ReturnType<typeof handleManagedQuestionSubmissionRequest>>;
      try {
        result = await dependencies.handleManagedQuestionSubmissionRequest({
          agentId: params.agent.id,
          payload: managedPayload,
        });
      } catch (error) {
        await dependencies.updateMcpBudgetReservation({
          error: error instanceof Error ? error.message : String(error),
          operationKey: quote.operation.operationKey,
          status: "failed",
        });
        await enqueueCallbackEvent("question.failed", {
          error: error instanceof Error ? error.message : String(error),
          status: "failed",
        });
        throw error;
      }

      const body = result.body as JsonObject;
      const warnings: string[] = [];

      try {
        await dependencies.updateMcpBudgetReservation({
          contentId: typeof body.contentId === "string" ? body.contentId : null,
          operationKey: quote.operation.operationKey,
          status: "submitted",
        });
        await enqueueCallbackEvent("question.submitted", body);
      } catch (error) {
        console.error("[mcp] submitted ask bookkeeping update failed", error);
        warnings.push("submitted_budget_update_failed");
      }

      let managedBudget: Awaited<ReturnType<typeof getMcpAgentBudgetSummary>> | null = null;
      try {
        managedBudget = await dependencies.getMcpAgentBudgetSummary(params.agent);
      } catch (error) {
        console.error("[mcp] budget summary unavailable after submitted ask", error);
        warnings.push("managed_budget_unavailable");
      }

      return {
        ...(normalizeMcpQuestionBody(body) as JsonObject),
        clientRequestId: payload.clientRequestId,
        fastLane,
        managedBudget,
        publicUrl: getPublicQuestionUrl(typeof body.contentId === "string" ? body.contentId : null),
        webhook: webhookInfo,
        warnings: [...warnings, ...callbackWarnings],
      };
    }

    case "curyo_get_question_status": {
      const record = await lookupQuestionOperation(args, params.agent);
      return {
        ...(normalizeMcpQuestionBody(x402QuestionSubmissionRecordBody(record)) as JsonObject),
        publicUrl: getPublicQuestionUrl(record?.contentId ?? null),
      };
    }

    case "curyo_get_result":
      return buildQuestionResult(args, params.agent);

    case "curyo_get_bot_balance":
      return getMcpAgentBudgetSummary(params.agent);

    default:
      throw new McpToolError(`Unknown tool: ${params.name}`, 404);
  }
}

export function getMcpToolDefinition(name: string) {
  return MCP_TOOLS.find(tool => tool.name === name) ?? null;
}

export function getMcpToolRequiredScope(name: string): McpScope | null {
  return getMcpToolDefinition(name)?.requiredScope ?? null;
}

export function normalizeToolError(error: unknown) {
  if (
    error instanceof McpToolError ||
    error instanceof McpBudgetError ||
    error instanceof X402QuestionConfigError ||
    error instanceof X402QuestionConflictError
  ) {
    return {
      code: error.name,
      message: error.message,
      status: "status" in error && typeof error.status === "number" ? error.status : 400,
    };
  }

  return {
    code: "InternalError",
    message: error instanceof Error ? error.message : "Unknown MCP tool error",
    status: 500,
  };
}
