import { buildAgentCallbackPayload, callbackEventId } from "./payload";
import { enqueueAgentCallbackEvent } from "./events";
import type { AgentCallbackEventType } from "./types";
import { ROUND_STATE } from "@curyo/contracts/protocol";
import { dbClient } from "~~/lib/db";
import { buildContentFeedbackRoundContext, listContentFeedback } from "~~/lib/feedback/contentFeedback";
import { ponderApi } from "~~/services/ponder/client";

type ManagedLifecycleCandidate = {
  agentId: string;
  chainId: number;
  clientRequestId: string;
  contentId: string;
  operationKey: `0x${string}`;
};

type AgentLifecycleDependencies = {
  enqueueAgentCallbackEvent: typeof enqueueAgentCallbackEvent;
  getContentById: typeof ponderApi.getContentById;
  listCandidates: (limit: number) => Promise<ManagedLifecycleCandidate[]>;
  listContentFeedback: typeof listContentFeedback;
};

let lifecycleTestOverrides: Partial<AgentLifecycleDependencies> | null = null;

function getLifecycleDependencies(): AgentLifecycleDependencies {
  return {
    enqueueAgentCallbackEvent: lifecycleTestOverrides?.enqueueAgentCallbackEvent ?? enqueueAgentCallbackEvent,
    getContentById: lifecycleTestOverrides?.getContentById ?? ponderApi.getContentById,
    listCandidates: lifecycleTestOverrides?.listCandidates ?? listManagedLifecycleCandidates,
    listContentFeedback: lifecycleTestOverrides?.listContentFeedback ?? listContentFeedback,
  };
}

export function __setAgentLifecycleTestOverridesForTests(overrides: Partial<AgentLifecycleDependencies> | null) {
  lifecycleTestOverrides = overrides;
}

function toOptionalUnixSeconds(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, Math.floor(value));
  if (typeof value === "bigint") return Number(value >= 0n ? value : 0n);
  if (typeof value === "string" && /^\d+$/.test(value)) return Number.parseInt(value, 10);
  return null;
}

function latestRound(rounds: unknown[]) {
  return Array.isArray(rounds) ? (rounds[0] as Record<string, unknown> | null | undefined) ?? null : null;
}

function isTerminalRoundState(state: unknown) {
  return (
    state === ROUND_STATE.Settled ||
    state === ROUND_STATE.Cancelled ||
    state === ROUND_STATE.Tied ||
    state === ROUND_STATE.RevealFailed
  );
}

function lifecycleEventsForContent(params: {
  feedbackPublicCount: number;
  nowSeconds: number;
  response: Awaited<ReturnType<typeof ponderApi.getContentById>>;
}) {
  const events: AgentCallbackEventType[] = [];
  const openRound = params.response.content.openRound;
  const newestRound = latestRound(params.response.rounds);
  const newestRoundState = newestRound?.state ?? null;

  if (openRound) {
    events.push("question.open");

    const estimatedSettlementTime = toOptionalUnixSeconds(openRound.estimatedSettlementTime);
    if (estimatedSettlementTime !== null && estimatedSettlementTime <= params.nowSeconds) {
      events.push("question.settling");
    }
  }

  if (isTerminalRoundState(newestRoundState)) {
    events.push("question.settled");
    if (params.feedbackPublicCount > 0) {
      events.push("feedback.unlocked");
    }
  }

  return events;
}

async function listManagedLifecycleCandidates(limit: number) {
  const result = await dbClient.execute({
    args: [limit],
    sql: `
      SELECT agent_id, chain_id, client_request_id, content_id, operation_key
      FROM mcp_agent_budget_reservations
      WHERE status = 'submitted' AND content_id IS NOT NULL
      ORDER BY updated_at ASC, operation_key ASC
      LIMIT ?
    `,
  });

  return result.rows.map(row => ({
    agentId: String(row.agent_id),
    chainId: Number(row.chain_id),
    clientRequestId: String(row.client_request_id),
    contentId: String(row.content_id),
    operationKey: String(row.operation_key) as `0x${string}`,
  }));
}

export async function sweepAgentLifecycleCallbacks(params: { limit?: number; now?: Date } = {}) {
  const limit = Math.max(1, Math.min(params.limit ?? 25, 100));
  const now = params.now ?? new Date();
  const nowSeconds = Math.floor(now.getTime() / 1000);
  const dependencies = getLifecycleDependencies();
  const candidates = await dependencies.listCandidates(limit);
  const emitted = {
    feedbackUnlocked: 0,
    questionOpen: 0,
    questionSettled: 0,
    questionSettling: 0,
  };

  for (const candidate of candidates) {
    const response = await dependencies.getContentById(candidate.contentId);
    const feedbackContext = buildContentFeedbackRoundContext(
      Array.isArray(response.rounds) ? response.rounds : [],
      response.content.openRound?.roundId ?? null,
    );
    const feedback = await dependencies.listContentFeedback({
      contentId: candidate.contentId,
      context: feedbackContext,
    });

    for (const eventType of lifecycleEventsForContent({
      feedbackPublicCount: feedback.items.length,
      nowSeconds,
      response,
    })) {
      await dependencies.enqueueAgentCallbackEvent({
        agentId: candidate.agentId,
        eventId: callbackEventId(candidate.operationKey, eventType),
        eventType,
        payload: buildAgentCallbackPayload({
          body: {
            contentId: candidate.contentId,
            status:
              eventType === "question.open"
                ? "open"
                : eventType === "question.settling"
                  ? "settling"
                  : eventType === "question.settled"
                    ? "settled"
                    : "feedback_unlocked",
          },
          chainId: candidate.chainId,
          clientRequestId: candidate.clientRequestId,
          eventType,
          operationKey: candidate.operationKey,
        }),
      });

      if (eventType === "question.open") emitted.questionOpen += 1;
      if (eventType === "question.settling") emitted.questionSettling += 1;
      if (eventType === "question.settled") emitted.questionSettled += 1;
      if (eventType === "feedback.unlocked") emitted.feedbackUnlocked += 1;
    }
  }

  return {
    emitted,
    scanned: candidates.length,
  };
}
