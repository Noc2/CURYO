import { ROUND_STATE, ROUND_STATE_LABEL } from "@curyo/contracts/protocol";
import { parseX402QuestionRequest } from "~~/lib/x402/questionPayload";
import {
  X402QuestionConfigError,
  X402QuestionConflictError,
  getX402QuestionSubmissionByClientRequest,
  getX402QuestionSubmissionByOperationKey,
  handleManagedQuestionSubmissionRequest,
  preflightX402QuestionSubmission,
  resolveX402QuestionConfig,
  x402QuestionSubmissionRecordBody,
} from "~~/lib/x402/questionSubmission";
import { getOptionalAppUrl } from "~~/lib/env/server";
import { getMcpAgentBudgetSummary, reserveMcpAgentBudget, updateMcpBudgetReservation } from "~~/lib/mcp/budget";
import { MCP_SCOPES, type McpAgentAuth, type McpScope } from "~~/lib/mcp/auth";
import { ponderApi } from "~~/services/ponder/client";

type JsonObject = Record<string, unknown>;

type McpToolDefinition = {
  description: string;
  inputSchema: JsonObject;
  name: string;
  requiredScope: McpScope;
  title: string;
};

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
        question: { description: "Question payload with title, description, contextUrl, categoryId, and tags.", type: "object" },
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
        question: { description: "Question payload with title, description, contextUrl, categoryId, and tags.", type: "object" },
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
  const rawValue = typeof value === "number" || typeof value === "bigint" || typeof value === "string" ? String(value) : "";
  if (!/^\d+$/.test(rawValue.trim())) {
    throw new McpToolError("maxPaymentAmount must be a non-negative integer string.");
  }
  return BigInt(rawValue);
}

function getPublicQuestionUrl(contentId: string | null) {
  const appUrl = getOptionalAppUrl();
  return appUrl && contentId ? `${appUrl}/rate?content=${encodeURIComponent(contentId)}` : null;
}

async function lookupQuestionOperation(args: JsonObject) {
  const operationKey = typeof args.operationKey === "string" ? args.operationKey.trim() : "";
  if (operationKey) {
    if (!/^0x[a-fA-F0-9]{64}$/.test(operationKey)) {
      throw new McpToolError("operationKey must be a 32-byte hex string.");
    }
    return getX402QuestionSubmissionByOperationKey(operationKey as `0x${string}`);
  }

  const chainId = Number.parseInt(String(args.chainId ?? ""), 10);
  const clientRequestId = typeof args.clientRequestId === "string" ? args.clientRequestId.trim() : "";
  if (!Number.isSafeInteger(chainId) || chainId <= 0 || !clientRequestId) {
    throw new McpToolError("Provide operationKey or both chainId and clientRequestId.");
  }

  return getX402QuestionSubmissionByClientRequest({ chainId, clientRequestId });
}

function formatQuoteResult(params: Awaited<ReturnType<typeof preflightX402QuestionSubmission>>) {
  return {
    canSubmit: true,
    operationKey: params.operation.operationKey,
    payment: {
      amount: params.paymentAmount.toString(),
      asset: "USDC",
      decimals: 6,
    },
    payloadHash: params.operation.payloadHash,
    resolvedCategoryId: params.resolvedCategoryId.toString(),
  };
}

async function quoteQuestion(args: JsonObject) {
  const payload = parseX402QuestionRequest(args);
  const config = resolveX402QuestionConfig(payload.chainId, { requireThirdwebSecret: false });
  const quote = await preflightX402QuestionSubmission({ config, payload });
  return formatQuoteResult(quote);
}

function latestRoundFromContentResponse(response: Awaited<ReturnType<typeof ponderApi.getContentById>>) {
  const rounds = Array.isArray(response.rounds) ? response.rounds : [];
  return rounds[0] ?? null;
}

async function buildQuestionResult(args: JsonObject) {
  const directContentId = typeof args.contentId === "string" ? args.contentId.trim() : "";
  const record = directContentId ? null : await lookupQuestionOperation(args);
  const contentId = directContentId || record?.contentId;

  if (!contentId) {
    return {
      operation: x402QuestionSubmissionRecordBody(record),
      ready: false,
      result: null,
    };
  }

  const response = await ponderApi.getContentById(contentId);
  const latestRound = latestRoundFromContentResponse(response);
  const roundState = typeof latestRound?.state === "number" ? latestRound.state : null;
  const settled = roundState === ROUND_STATE.Settled;

  return {
    operation: record ? x402QuestionSubmissionRecordBody(record) : null,
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

export async function callCuryoMcpTool(params: { agent: McpAgentAuth; arguments: unknown; name: string }) {
  const args = asObject(params.arguments ?? {});

  switch (params.name) {
    case "curyo_list_categories":
      return ponderApi.getCategories();

    case "curyo_quote_question":
      return quoteQuestion(args);

    case "curyo_ask_humans": {
      const payload = parseX402QuestionRequest(args);
      const config = resolveX402QuestionConfig(payload.chainId, { requireThirdwebSecret: false });
      const quote = await preflightX402QuestionSubmission({ config, payload });
      const maxPaymentAmount = parseMaxPaymentAmount(args.maxPaymentAmount);
      if (quote.paymentAmount > maxPaymentAmount) {
        throw new McpToolError("Quoted payment exceeds maxPaymentAmount.");
      }

      await reserveMcpAgentBudget({
        agent: params.agent,
        amount: quote.paymentAmount,
        categoryId: payload.categoryId.toString(),
        chainId: payload.chainId,
        clientRequestId: payload.clientRequestId,
        operationKey: quote.operation.operationKey,
        payloadHash: quote.operation.payloadHash,
      });

      try {
        const result = await handleManagedQuestionSubmissionRequest({
          agentId: params.agent.id,
          payload,
        });
        const body = result.body as JsonObject;
        await updateMcpBudgetReservation({
          contentId: typeof body.contentId === "string" ? body.contentId : null,
          operationKey: quote.operation.operationKey,
          status: "submitted",
        });

        return {
          ...body,
          managedBudget: await getMcpAgentBudgetSummary(params.agent),
          publicUrl: getPublicQuestionUrl(typeof body.contentId === "string" ? body.contentId : null),
        };
      } catch (error) {
        await updateMcpBudgetReservation({
          error: error instanceof Error ? error.message : String(error),
          operationKey: quote.operation.operationKey,
          status: "failed",
        });
        throw error;
      }
    }

    case "curyo_get_question_status": {
      const record = await lookupQuestionOperation(args);
      return {
        ...x402QuestionSubmissionRecordBody(record),
        publicUrl: getPublicQuestionUrl(record?.contentId ?? null),
      };
    }

    case "curyo_get_result":
      return buildQuestionResult(args);

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

