import {
  type McpBudgetReservationRecord,
  getMcpBudgetReservation,
  getMcpBudgetReservationByClientRequest,
} from "./budget";
import { listAgentCallbackEventsByEventIdPrefix } from "~~/lib/agent-callbacks/events";
import { getAgentPublicQuestionUrl } from "~~/lib/agent-callbacks/payload";
import { type AgentLiveAskGuidance, buildAgentLiveAskGuidance } from "~~/lib/agent/liveAskGuidance";
import { dbClient } from "~~/lib/db";
import {
  type X402QuestionSubmissionRecord,
  getX402QuestionSubmissionByOperationKey,
  x402QuestionSubmissionRecordBody,
} from "~~/lib/x402/questionSubmission";
import { ponderApi } from "~~/services/ponder/client";

type QueryRow = Record<string, unknown>;

export type McpAskAuditRecord = {
  agentId: string;
  categoryId: string;
  chainId: number;
  clientRequestId: string;
  contentId: string | null;
  createdAt: Date;
  error: string | null;
  eventType: string;
  id: number;
  operationKey: `0x${string}`;
  paymentAmount: string;
  payloadHash: string;
  status: string;
};

export type McpAskAuditDetails = {
  auditEvents: Array<Record<string, unknown>>;
  callbackDeliveries: Array<Record<string, unknown>>;
  categoryId: string;
  chainId: number;
  clientRequestId: string;
  contentId: string | null;
  createdAt: string;
  error: string | null;
  liveAskGuidance: AgentLiveAskGuidance | null;
  operationKey: `0x${string}`;
  paymentAmount: string;
  payloadHash: string;
  publicUrl: string | null;
  reservation: Record<string, unknown>;
  status: string;
  submission: Record<string, unknown> | null;
  updatedAt: string;
};

export type McpAskAuditFilters = {
  agentId: string;
  chainId?: number;
  eventType?: string;
  from?: Date;
  limit?: number;
  status?: string;
  to?: Date;
};

function parseDate(value: unknown) {
  return value instanceof Date ? value : new Date(String(value));
}

function normalizeCallbackDeliveries(
  deliveries: Awaited<ReturnType<typeof listAgentCallbackEventsByEventIdPrefix>>,
): Array<Record<string, unknown>> {
  return deliveries.map(delivery => ({
    attemptCount: delivery.attemptCount,
    callbackUrl: delivery.callbackUrl,
    deliveredAt: delivery.deliveredAt ? delivery.deliveredAt.toISOString() : null,
    eventId: delivery.eventId,
    eventType: delivery.eventType,
    lastError: delivery.lastError,
    nextAttemptAt: delivery.nextAttemptAt.toISOString(),
    status: delivery.status,
    subscriptionId: delivery.subscriptionId,
  }));
}

function serializeReservation(record: McpBudgetReservationRecord) {
  return {
    agentId: record.agentId,
    categoryId: record.categoryId,
    chainId: record.chainId,
    clientRequestId: record.clientRequestId,
    contentId: record.contentId,
    createdAt: record.createdAt.toISOString(),
    error: record.error,
    operationKey: record.operationKey,
    paymentAmount: record.paymentAmount,
    payloadHash: record.payloadHash,
    status: record.status,
    updatedAt: record.updatedAt.toISOString(),
  };
}

function rowToAuditRecord(row: QueryRow | undefined): McpAskAuditRecord | null {
  if (!row) return null;
  return {
    agentId: String(row.agent_id),
    categoryId: String(row.category_id),
    chainId: Number(row.chain_id),
    clientRequestId: String(row.client_request_id),
    contentId: typeof row.content_id === "string" ? row.content_id : null,
    createdAt: parseDate(row.created_at),
    error: typeof row.error === "string" ? row.error : null,
    eventType: String(row.event_type),
    id: Number(row.id),
    operationKey: String(row.operation_key) as `0x${string}`,
    paymentAmount: String(row.payment_amount),
    payloadHash: String(row.payload_hash),
    status: String(row.status),
  };
}

function serializeAuditRecord(record: McpAskAuditRecord) {
  return {
    categoryId: record.categoryId,
    chainId: record.chainId,
    clientRequestId: record.clientRequestId,
    contentId: record.contentId,
    createdAt: record.createdAt.toISOString(),
    error: record.error,
    eventType: record.eventType,
    id: record.id,
    operationKey: record.operationKey,
    paymentAmount: record.paymentAmount,
    payloadHash: record.payloadHash,
    publicUrl: getAgentPublicQuestionUrl(record.contentId),
    status: record.status,
  };
}

async function listAuditRecords(params: McpAskAuditFilters & { operationKey?: `0x${string}` }) {
  const clauses = ["agent_id = ?"];
  const args: Array<string | number | Date> = [params.agentId];

  if (params.operationKey) {
    clauses.push("operation_key = ?");
    args.push(params.operationKey);
  }
  if (params.chainId !== undefined) {
    clauses.push("chain_id = ?");
    args.push(params.chainId);
  }
  if (params.status) {
    clauses.push("status = ?");
    args.push(params.status);
  }
  if (params.eventType) {
    clauses.push("event_type = ?");
    args.push(params.eventType);
  }
  if (params.from) {
    clauses.push("created_at >= ?");
    args.push(params.from);
  }
  if (params.to) {
    clauses.push("created_at <= ?");
    args.push(params.to);
  }

  const limit = Math.max(1, Math.min(params.limit ?? 200, 1000));
  args.push(limit);

  const result = await dbClient.execute({
    args,
    sql: `
      SELECT *
      FROM mcp_agent_ask_audit_records
      WHERE ${clauses.join(" AND ")}
      ORDER BY created_at DESC, id DESC
      LIMIT ?
    `,
  });

  return result.rows.map(row => rowToAuditRecord(row as QueryRow)).filter((row): row is McpAskAuditRecord => !!row);
}

async function loadLiveAskGuidance(contentId: string | null): Promise<AgentLiveAskGuidance | null> {
  if (!contentId) return null;
  try {
    const response = await ponderApi.getContentById(contentId);
    return buildAgentLiveAskGuidance({ content: response.content });
  } catch (error) {
    console.error("[agent-audits] live ask guidance unavailable", error);
    return null;
  }
}

async function buildAuditDetails(
  reservation: McpBudgetReservationRecord,
  submission: X402QuestionSubmissionRecord | null,
): Promise<McpAskAuditDetails> {
  const auditEvents = await listAuditRecords({
    agentId: reservation.agentId,
    limit: 200,
    operationKey: reservation.operationKey,
  });
  const callbackDeliveries = normalizeCallbackDeliveries(
    await listAgentCallbackEventsByEventIdPrefix({
      agentId: reservation.agentId,
      eventIdPrefix: `${reservation.operationKey}:`,
    }),
  );
  const contentId = submission?.contentId ?? reservation.contentId;

  return {
    auditEvents: auditEvents
      .slice()
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id - b.id)
      .map(serializeAuditRecord),
    callbackDeliveries,
    categoryId: reservation.categoryId,
    chainId: reservation.chainId,
    clientRequestId: reservation.clientRequestId,
    contentId,
    createdAt: reservation.createdAt.toISOString(),
    error: submission?.error ?? reservation.error,
    liveAskGuidance: await loadLiveAskGuidance(contentId),
    operationKey: reservation.operationKey,
    paymentAmount: reservation.paymentAmount,
    payloadHash: reservation.payloadHash,
    publicUrl: getAgentPublicQuestionUrl(contentId),
    reservation: serializeReservation(reservation),
    status: submission?.status ?? reservation.status,
    submission: submission ? (x402QuestionSubmissionRecordBody(submission) as Record<string, unknown>) : null,
    updatedAt: reservation.updatedAt.toISOString(),
  };
}

export async function getMcpAskAuditDetailsByOperation(params: { agentId: string; operationKey: `0x${string}` }) {
  const reservation = await getMcpBudgetReservation(params.operationKey);
  if (!reservation || reservation.agentId !== params.agentId) return null;
  const submission = await getX402QuestionSubmissionByOperationKey(params.operationKey);
  return buildAuditDetails(reservation, submission);
}

export async function getMcpAskAuditDetailsByClientRequest(params: {
  agentId: string;
  chainId: number;
  clientRequestId: string;
}) {
  const reservation = await getMcpBudgetReservationByClientRequest(params);
  if (!reservation) return null;
  const submission = await getX402QuestionSubmissionByOperationKey(reservation.operationKey);
  return buildAuditDetails(reservation, submission);
}

export async function listMcpAskAuditExportRows(params: McpAskAuditFilters) {
  return (await listAuditRecords(params)).map(serializeAuditRecord);
}
