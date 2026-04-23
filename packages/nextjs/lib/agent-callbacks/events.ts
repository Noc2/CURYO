import { listActiveAgentCallbackSubscriptions } from "./registry";
import { canonicalJson } from "./signing";
import { randomUUID } from "node:crypto";
import { dbClient } from "~~/lib/db";

export type AgentCallbackDeliveryStatus = "pending" | "delivering" | "retrying" | "delivered" | "dead";

export type AgentCallbackEventRecord = {
  agentId: string;
  attemptCount: number;
  callbackUrl: string;
  createdAt: Date;
  deliveredAt: Date | null;
  eventId: string;
  eventKey: string;
  eventType: string;
  id: number;
  lastAttemptAt: Date | null;
  lastError: string | null;
  leaseExpiresAt: Date | null;
  leaseOwner: string | null;
  nextAttemptAt: Date;
  payload: string;
  secret: string;
  status: AgentCallbackDeliveryStatus;
  subscriptionId: string;
  updatedAt: Date;
};

export type EnqueueAgentCallbackEventInput = {
  agentId: string;
  eventId?: string;
  eventType: string;
  now?: Date;
  payload: unknown;
};

function parseDate(value: unknown): Date {
  return value instanceof Date ? value : new Date(String(value));
}

function parseOptionalDate(value: unknown): Date | null {
  if (!value) return null;
  return parseDate(value);
}

export function rowToCallbackEvent(row: Record<string, unknown> | undefined): AgentCallbackEventRecord | null {
  if (!row) return null;
  return {
    agentId: String(row.agent_id),
    attemptCount: Number(row.attempt_count),
    callbackUrl: String(row.callback_url),
    createdAt: parseDate(row.created_at),
    deliveredAt: parseOptionalDate(row.delivered_at),
    eventId: String(row.event_id),
    eventKey: String(row.event_key),
    eventType: String(row.event_type),
    id: Number(row.id),
    lastAttemptAt: parseOptionalDate(row.last_attempt_at),
    lastError: typeof row.last_error === "string" ? row.last_error : null,
    leaseExpiresAt: parseOptionalDate(row.lease_expires_at),
    leaseOwner: typeof row.lease_owner === "string" ? row.lease_owner : null,
    nextAttemptAt: parseDate(row.next_attempt_at),
    payload: String(row.payload),
    secret: String(row.secret),
    status: String(row.status) as AgentCallbackDeliveryStatus,
    subscriptionId: String(row.subscription_id),
    updatedAt: parseDate(row.updated_at),
  };
}

export function callbackEventKey(params: { eventId: string; subscriptionId: string }) {
  return `${params.subscriptionId}:${params.eventId}`;
}

export async function enqueueAgentCallbackEvent(input: EnqueueAgentCallbackEventInput) {
  const now = input.now ?? new Date();
  const eventId = input.eventId ?? randomUUID();
  const payload = canonicalJson({
    agentId: input.agentId,
    eventId,
    eventType: input.eventType,
    payload: input.payload,
  });
  const subscriptions = await listActiveAgentCallbackSubscriptions(input.agentId);
  const matchingSubscriptions = subscriptions.filter(subscription => subscription.eventTypes.includes(input.eventType));
  const records: AgentCallbackEventRecord[] = [];

  for (const subscription of matchingSubscriptions) {
    const result = await dbClient.execute({
      args: [
        callbackEventKey({ eventId, subscriptionId: subscription.id }),
        eventId,
        subscription.id,
        subscription.agentId,
        input.eventType,
        subscription.callbackUrl,
        subscription.secret,
        payload,
        now,
        now,
        now,
      ],
      sql: `
        INSERT INTO agent_callback_events (
          event_key, event_id, subscription_id, agent_id, event_type, callback_url, secret,
          payload, status, attempt_count, next_attempt_at, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0, ?, ?, ?)
        ON CONFLICT (event_key) DO UPDATE SET updated_at = agent_callback_events.updated_at
        RETURNING *
      `,
    });
    const record = rowToCallbackEvent(result.rows[0]);
    if (record) records.push(record);
  }

  return records;
}

export async function getAgentCallbackEvent(eventKey: string) {
  const result = await dbClient.execute({
    args: [eventKey],
    sql: `
      SELECT *
      FROM agent_callback_events
      WHERE event_key = ?
      LIMIT 1
    `,
  });

  return rowToCallbackEvent(result.rows[0]);
}
