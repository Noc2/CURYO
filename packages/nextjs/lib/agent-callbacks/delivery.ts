import { type AgentCallbackEventRecord, rowToCallbackEvent } from "./events";
import { buildCallbackHeaders } from "./signing";
import { dbClient } from "~~/lib/db";

export type LeaseAgentCallbackEventsInput = {
  leaseMs?: number;
  limit?: number;
  now?: Date;
  workerId: string;
};

export type FailAgentCallbackDeliveryInput = {
  baseDelayMs?: number;
  error: string;
  eventKey: string;
  maxAttempts?: number;
  maxDelayMs?: number;
  now?: Date;
  workerId: string;
};

export type DeliverLeasedCallbackEventInput = {
  event: AgentCallbackEventRecord;
  fetchImpl?: typeof fetch;
  now?: Date;
};

function retryDelayMs(attemptCount: number, baseDelayMs: number, maxDelayMs: number) {
  return Math.min(maxDelayMs, baseDelayMs * 2 ** Math.max(0, attemptCount - 1));
}

export async function leaseDueAgentCallbackEvents(input: LeaseAgentCallbackEventsInput) {
  const now = input.now ?? new Date();
  const leaseMs = input.leaseMs ?? 30_000;
  const limit = input.limit ?? 25;
  const leaseExpiresAt = new Date(now.getTime() + leaseMs);

  const result = await dbClient.execute({
    args: [input.workerId, leaseExpiresAt, now, now, now, now, limit],
    sql: `
      UPDATE agent_callback_events
      SET
        status = 'delivering',
        lease_owner = ?,
        lease_expires_at = ?,
        attempt_count = attempt_count + 1,
        last_attempt_at = ?,
        updated_at = ?
      WHERE event_key IN (
        SELECT event_key
        FROM agent_callback_events
        WHERE status IN ('pending', 'retrying')
          AND next_attempt_at <= ?
          AND (lease_expires_at IS NULL OR lease_expires_at <= ?)
        ORDER BY next_attempt_at ASC, id ASC
        LIMIT ?
      )
      RETURNING *
    `,
  });

  return result.rows.map(row => rowToCallbackEvent(row)).filter((row): row is AgentCallbackEventRecord => !!row);
}

export async function completeAgentCallbackDelivery(params: { eventKey: string; now?: Date; workerId: string }) {
  const now = params.now ?? new Date();
  const result = await dbClient.execute({
    args: [now, now, params.eventKey, params.workerId],
    sql: `
      UPDATE agent_callback_events
      SET
        status = 'delivered',
        lease_owner = NULL,
        lease_expires_at = NULL,
        delivered_at = ?,
        updated_at = ?
      WHERE event_key = ? AND lease_owner = ? AND status = 'delivering'
      RETURNING *
    `,
  });

  return rowToCallbackEvent(result.rows[0]);
}

export async function failAgentCallbackDelivery(input: FailAgentCallbackDeliveryInput) {
  const now = input.now ?? new Date();
  const maxAttempts = input.maxAttempts ?? 5;
  const baseDelayMs = input.baseDelayMs ?? 1_000;
  const maxDelayMs = input.maxDelayMs ?? 5 * 60_000;

  const current = await dbClient.execute({
    args: [input.eventKey, input.workerId],
    sql: `
      SELECT attempt_count
      FROM agent_callback_events
      WHERE event_key = ? AND lease_owner = ? AND status = 'delivering'
      LIMIT 1
    `,
  });
  const attemptCount = Number(current.rows[0]?.attempt_count ?? 0);
  if (attemptCount === 0) return null;

  const isDead = attemptCount >= maxAttempts;
  const nextAttemptAt = isDead ? now : new Date(now.getTime() + retryDelayMs(attemptCount, baseDelayMs, maxDelayMs));
  const result = await dbClient.execute({
    args: [
      isDead ? "dead" : "retrying",
      input.error.slice(0, 2000),
      nextAttemptAt,
      now,
      input.eventKey,
      input.workerId,
    ],
    sql: `
      UPDATE agent_callback_events
      SET
        status = ?,
        lease_owner = NULL,
        lease_expires_at = NULL,
        last_error = ?,
        next_attempt_at = ?,
        updated_at = ?
      WHERE event_key = ? AND lease_owner = ? AND status = 'delivering'
      RETURNING *
    `,
  });

  return rowToCallbackEvent(result.rows[0]);
}

export async function releaseExpiredAgentCallbackLeases(params: { now?: Date } = {}) {
  const now = params.now ?? new Date();
  const result = await dbClient.execute({
    args: [now, now, now],
    sql: `
      UPDATE agent_callback_events
      SET
        status = 'retrying',
        lease_owner = NULL,
        lease_expires_at = NULL,
        next_attempt_at = ?,
        updated_at = ?
      WHERE status = 'delivering' AND lease_expires_at <= ?
      RETURNING *
    `,
  });

  return result.rows.map(row => rowToCallbackEvent(row)).filter((row): row is AgentCallbackEventRecord => !!row);
}

export function buildCallbackDeliveryRequest(input: { event: AgentCallbackEventRecord; now?: Date }) {
  const timestamp = (input.now ?? new Date()).toISOString();
  return {
    body: input.event.payload,
    headers: buildCallbackHeaders({
      body: input.event.payload,
      eventId: input.event.eventId,
      secret: input.event.secret,
      timestamp,
    }),
    method: "POST" as const,
    url: input.event.callbackUrl,
  };
}

export async function deliverLeasedAgentCallbackEvent(input: DeliverLeasedCallbackEventInput) {
  const request = buildCallbackDeliveryRequest({ event: input.event, now: input.now });
  const fetchImpl = input.fetchImpl ?? fetch;
  const response = await fetchImpl(request.url, {
    body: request.body,
    headers: request.headers,
    method: request.method,
  });

  return {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
  };
}
