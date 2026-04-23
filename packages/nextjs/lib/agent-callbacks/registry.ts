import { randomUUID } from "node:crypto";
import { dbClient } from "~~/lib/db";

export type AgentCallbackSubscriptionStatus = "active" | "disabled";

export type AgentCallbackSubscriptionRecord = {
  agentId: string;
  callbackUrl: string;
  createdAt: Date;
  eventTypes: string[];
  id: string;
  secret: string;
  status: AgentCallbackSubscriptionStatus;
  updatedAt: Date;
};

export type UpsertAgentCallbackSubscriptionInput = {
  agentId: string;
  callbackUrl: string;
  eventTypes: string[];
  id?: string;
  now?: Date;
  secret: string;
};

function parseDate(value: unknown): Date {
  return value instanceof Date ? value : new Date(String(value));
}

function parseEventTypes(value: unknown): string[] {
  if (typeof value !== "string") return [];
  const parsed = JSON.parse(value) as unknown;
  return Array.isArray(parsed) ? parsed.filter(item => typeof item === "string") : [];
}

export function rowToCallbackSubscription(
  row: Record<string, unknown> | undefined,
): AgentCallbackSubscriptionRecord | null {
  if (!row) return null;
  return {
    agentId: String(row.agent_id),
    callbackUrl: String(row.callback_url),
    createdAt: parseDate(row.created_at),
    eventTypes: parseEventTypes(row.event_types),
    id: String(row.id),
    secret: String(row.secret),
    status: String(row.status) as AgentCallbackSubscriptionStatus,
    updatedAt: parseDate(row.updated_at),
  };
}

function normalizeEventTypes(eventTypes: string[]) {
  return [...new Set(eventTypes.map(type => type.trim()).filter(Boolean))].sort();
}

function assertSubscriptionInput(input: UpsertAgentCallbackSubscriptionInput) {
  if (!input.agentId.trim()) throw new Error("Callback agentId is required.");
  if (!input.secret.trim()) throw new Error("Callback secret is required.");
  if (normalizeEventTypes(input.eventTypes).length === 0)
    throw new Error("At least one callback event type is required.");

  const url = new URL(input.callbackUrl);
  if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
    throw new Error("Callback URL must use https outside local development.");
  }
}

export async function upsertAgentCallbackSubscription(input: UpsertAgentCallbackSubscriptionInput) {
  assertSubscriptionInput(input);

  const now = input.now ?? new Date();
  const eventTypes = normalizeEventTypes(input.eventTypes);
  const result = await dbClient.execute({
    args: [
      input.id ?? randomUUID(),
      input.agentId,
      input.callbackUrl,
      input.secret,
      JSON.stringify(eventTypes),
      now,
      now,
    ],
    sql: `
      INSERT INTO agent_callback_subscriptions (
        id, agent_id, callback_url, secret, event_types, status, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, 'active', ?, ?)
      ON CONFLICT (agent_id, callback_url)
      DO UPDATE SET
        secret = EXCLUDED.secret,
        event_types = EXCLUDED.event_types,
        status = 'active',
        updated_at = EXCLUDED.updated_at
      RETURNING *
    `,
  });

  return rowToCallbackSubscription(result.rows[0]);
}

export async function disableAgentCallbackSubscription(params: { id: string; now?: Date }) {
  const now = params.now ?? new Date();
  const result = await dbClient.execute({
    args: [now, params.id],
    sql: `
      UPDATE agent_callback_subscriptions
      SET status = 'disabled', updated_at = ?
      WHERE id = ?
      RETURNING *
    `,
  });

  return rowToCallbackSubscription(result.rows[0]);
}

export async function listActiveAgentCallbackSubscriptions(agentId: string) {
  const result = await dbClient.execute({
    args: [agentId],
    sql: `
      SELECT *
      FROM agent_callback_subscriptions
      WHERE agent_id = ? AND status = 'active'
      ORDER BY created_at ASC, id ASC
    `,
  });

  return result.rows
    .map(row => rowToCallbackSubscription(row))
    .filter((row): row is AgentCallbackSubscriptionRecord => !!row);
}
