import { ROUND_STATE, ROUND_STATE_LABEL } from "@curyo/contracts/protocol";
import { createHash } from "crypto";
import { getOptionalAppUrl } from "~~/lib/env/server";
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
  requiredScope: McpScope;
  title: string;
};

type AskHumansMode = "sync" | "async";
type BackgroundTaskScheduler = (task: () => Promise<void> | void) => void;

type McpToolDependencies = {
  completeManagedQuestionSubmissionRequest: typeof completeManagedQuestionSubmissionRequest;
  getMcpAgentBudgetSummary: typeof getMcpAgentBudgetSummary;
  handleManagedQuestionSubmissionRequest: typeof handleManagedQuestionSubmissionRequest;
  preflightX402QuestionSubmission: typeof preflightX402QuestionSubmission;
  reserveMcpAgentBudget: typeof reserveMcpAgentBudget;
  resolveX402QuestionConfig: typeof resolveX402QuestionConfig;
  startManagedQuestionSubmissionRequest: typeof startManagedQuestionSubmissionRequest;
  updateMcpBudgetReservation: typeof updateMcpBudgetReservation;
};

let mcpToolTestOverrides: Partial<McpToolDependencies> | null = null;

function getMcpToolDependencies(): McpToolDependencies {
  return {
    completeManagedQuestionSubmissionRequest:
      mcpToolTestOverrides?.completeManagedQuestionSubmissionRequest ?? completeManagedQuestionSubmissionRequest,
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

const operationLookupSchema = {
  additionalProperties: false,
  properties: {
    chainId: { description: "Chain id used with clientRequestId lookup.", type: "integer" },
    clientRequestId: { description: "Client idempotency key returned by curyo_ask_humans.", type: "string" },
    operationKey: { description: "Curyo operation key returned by quote or ask.", type: "string" },
  },
  type: "object",
};

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
    description: "Preflight and price a paid question before reserving spend.",
    inputSchema: {
      additionalProperties: true,
      properties: {
        bounty: { description: "USDC bounty settings in atomic units.", type: "object" },
        chainId: { type: "integer" },
        clientRequestId: { type: "string" },
        question: {
          description: "Question payload with title, description, contextUrl, categoryId, and tags.",
          type: "object",
        },
      },
      required: ["clientRequestId", "question", "bounty"],
      type: "object",
    },
    name: "curyo_quote_question",
    requiredScope: MCP_SCOPES.quote,
    title: "Quote Human Ask",
  },
  {
    description: "Reserve managed MCP budget and submit a paid question for verified humans to rate.",
    inputSchema: {
      additionalProperties: true,
      properties: {
        bounty: { description: "USDC bounty settings in atomic units.", type: "object" },
        chainId: { type: "integer" },
        clientRequestId: { type: "string" },
        maxPaymentAmount: {
          description: "Maximum total managed spend, including bounty and service fee, in atomic USDC.",
          type: "string",
        },
        mode: {
          default: "sync",
          description: "Use async to return after payment settlement and poll with curyo_get_question_status.",
          enum: ["sync", "async"],
          type: "string",
        },
        question: {
          description: "Question payload with title, description, contextUrl, categoryId, and tags.",
          type: "object",
        },
      },
      required: ["clientRequestId", "question", "bounty", "maxPaymentAmount"],
      type: "object",
    },
    name: "curyo_ask_humans",
    requiredScope: MCP_SCOPES.ask,
    title: "Ask Humans",
  },
  {
    description: "Get paid ask operation status by operationKey or chainId plus clientRequestId.",
    inputSchema: operationLookupSchema,
    name: "curyo_get_question_status",
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

function formatQuoteResult(params: Awaited<ReturnType<typeof preflightX402QuestionSubmission>>, tokenAddress: string) {
  return {
    canSubmit: true,
    operationKey: params.operation.operationKey,
    payment: {
      amount: params.paymentAmount.toString(),
      asset: "USDC",
      decimals: X402_USDC_DECIMALS,
      tokenAddress,
    },
    payloadHash: params.operation.payloadHash,
    resolvedCategoryId: params.resolvedCategoryId.toString(),
  };
}

async function quoteQuestion(args: JsonObject, agent: McpAgentAuth) {
  const dependencies = getMcpToolDependencies();
  const payload = parseX402QuestionRequest(args);
  const managedPayload = toManagedMcpPayload(agent, payload);
  const config = dependencies.resolveX402QuestionConfig(managedPayload.chainId, { requireThirdwebSecret: false });
  const quote = await dependencies.preflightX402QuestionSubmission({ config, payload: managedPayload });
  return {
    ...formatQuoteResult(quote, config.usdcAddress),
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
  const roundState = typeof latestRound?.state === "number" ? latestRound.state : null;
  const settled = roundState === ROUND_STATE.Settled;

  return {
    operation: record ? normalizeMcpQuestionBody(x402QuestionSubmissionRecordBody(record)) : null,
    publicUrl: getPublicQuestionUrl(contentId),
    ready: settled,
    result: {
      categoryId: response.content.categoryId?.toString?.() ?? String(response.content.categoryId ?? ""),
      confidenceMass: response.content.ratingConfidenceMass ?? latestRound?.confidenceMass ?? null,
      contentId,
      currentRating: response.content.rating,
      currentRatingBps: response.content.ratingBps,
      effectiveEvidence: response.content.ratingEffectiveEvidence ?? latestRound?.effectiveEvidence ?? null,
      latestRound: latestRound
        ? {
            downCount: latestRound.downCount,
            downPool: latestRound.downPool?.toString?.() ?? latestRound.downPool ?? null,
            revealedCount: latestRound.revealedCount,
            roundId: latestRound.roundId?.toString?.() ?? String(latestRound.roundId ?? ""),
            settledAt: latestRound.settledAt?.toString?.() ?? latestRound.settledAt ?? null,
            state: roundState,
            stateLabel: roundState === null ? null : ROUND_STATE_LABEL[roundState as keyof typeof ROUND_STATE_LABEL],
            totalStake: latestRound.totalStake?.toString?.() ?? latestRound.totalStake ?? null,
            upCount: latestRound.upCount,
            upPool: latestRound.upPool?.toString?.() ?? latestRound.upPool ?? null,
            upWins: latestRound.upWins ?? null,
            voteCount: latestRound.voteCount,
          }
        : null,
      question: response.content.question ?? response.content.title,
      ratingSettledRounds: response.content.ratingSettledRounds,
      status: response.content.status,
    },
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

    case "curyo_quote_question":
      return quoteQuestion(args, params.agent);

    case "curyo_ask_humans": {
      const mode = parseAskHumansMode(args.mode);
      const scheduleBackgroundTask = params.scheduleBackgroundTask;
      if (mode === "async" && !scheduleBackgroundTask) {
        throw new McpToolError("Async ask_humans requires a background task scheduler.", 503);
      }

      const payload = parseX402QuestionRequest(args);
      const managedPayload = toManagedMcpPayload(params.agent, payload);
      const config = dependencies.resolveX402QuestionConfig(managedPayload.chainId, { requireThirdwebSecret: false });
      const quote = await dependencies.preflightX402QuestionSubmission({ config, payload: managedPayload });
      const maxPaymentAmount = parseMaxPaymentAmount(args.maxPaymentAmount);
      if (quote.paymentAmount > maxPaymentAmount) {
        throw new McpToolError("Quoted payment exceeds maxPaymentAmount.");
      }

      await dependencies.reserveMcpAgentBudget({
        agent: params.agent,
        amount: quote.paymentAmount,
        categoryId: payload.categoryId.toString(),
        chainId: payload.chainId,
        clientRequestId: payload.clientRequestId,
        operationKey: quote.operation.operationKey,
        payloadHash: quote.operation.payloadHash,
      });

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
              } catch (error) {
                console.error("[mcp] async ask completion failed", error);
                try {
                  await dependencies.updateMcpBudgetReservation({
                    error: error instanceof Error ? error.message : String(error),
                    operationKey: quote.operation.operationKey,
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
            throw error;
          }
        } else if (body.status === "submitted") {
          try {
            await dependencies.updateMcpBudgetReservation({
              contentId: typeof body.contentId === "string" ? body.contentId : null,
              operationKey: quote.operation.operationKey,
              status: "submitted",
            });
          } catch (error) {
            console.error("[mcp] submitted ask bookkeeping update failed", error);
            warnings.push("submitted_budget_update_failed");
          }
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
          managedBudget,
          pollAfterMs: 5_000,
          publicUrl: getPublicQuestionUrl(typeof body.contentId === "string" ? body.contentId : null),
          statusTool: "curyo_get_question_status",
          warnings,
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
        managedBudget,
        publicUrl: getPublicQuestionUrl(typeof body.contentId === "string" ? body.contentId : null),
        warnings,
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
