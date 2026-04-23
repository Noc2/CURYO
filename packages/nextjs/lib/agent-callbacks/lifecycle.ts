import { enqueueAgentCallbackEvent } from "./events";
import { buildAgentCallbackPayload, callbackEventId } from "./payload";
import type { AgentCallbackEventType } from "./types";
import { ROUND_STATE } from "@curyo/contracts/protocol";
import { buildAgentLiveAskGuidance } from "~~/lib/agent/liveAskGuidance";
import { dbClient } from "~~/lib/db";
import { buildContentFeedbackRoundContext, listContentFeedback } from "~~/lib/feedback/contentFeedback";
import { ponderApi } from "~~/services/ponder/client";

type ManagedLifecycleCandidate = {
  agentId: string;
  chainId: number;
  clientRequestId: string;
  contentId: string;
  operationKey: `0x${string}`;
  sortAt: Date;
};

type ManagedLifecycleCursor = Pick<ManagedLifecycleCandidate, "operationKey" | "sortAt">;

type AgentLifecycleDependencies = {
  enqueueAgentCallbackEvent: typeof enqueueAgentCallbackEvent;
  getContentById: typeof ponderApi.getContentById;
  listCandidates: (params: { after?: ManagedLifecycleCursor | null; limit: number }) => Promise<ManagedLifecycleCandidate[]>;
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
  return Array.isArray(rounds) ? ((rounds[0] as Record<string, unknown> | null | undefined) ?? null) : null;
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

async function listManagedLifecycleCandidates(params: { after?: ManagedLifecycleCursor | null; limit: number }) {
  const sortExpression = "COALESCE(submissions.submitted_at, submissions.updated_at, reservations.updated_at)";
  const result = await dbClient.execute({
    args: [
      params.after?.sortAt ?? null,
      params.after?.sortAt ?? null,
      params.after?.sortAt ?? null,
      params.after?.operationKey ?? null,
      params.limit,
    ],
    sql: `
      SELECT
        reservations.agent_id,
        reservations.chain_id,
        reservations.client_request_id,
        submissions.content_id,
        reservations.operation_key,
        ${sortExpression} AS sort_at
      FROM mcp_agent_budget_reservations AS reservations
      INNER JOIN x402_question_submissions AS submissions
        ON submissions.operation_key = reservations.operation_key
      WHERE submissions.status = 'submitted'
        AND submissions.content_id IS NOT NULL
        AND (
          ? IS NULL
          OR ${sortExpression} > ?
          OR (${sortExpression} = ? AND reservations.operation_key > ?)
        )
      ORDER BY sort_at ASC, reservations.operation_key ASC
      LIMIT ?
    `,
  });

  return result.rows.map(row => ({
    agentId: String(row.agent_id),
    chainId: Number(row.chain_id),
    clientRequestId: String(row.client_request_id),
    contentId: String(row.content_id),
    operationKey: String(row.operation_key) as `0x${string}`,
    sortAt: row.sort_at instanceof Date ? row.sort_at : new Date(String(row.sort_at)),
  }));
}

export async function sweepAgentLifecycleCallbacks(params: { limit?: number; now?: Date } = {}) {
  const pageSize = Math.max(1, Math.min(params.limit ?? 25, 100));
  const now = params.now ?? new Date();
  const nowSeconds = Math.floor(now.getTime() / 1000);
  const dependencies = getLifecycleDependencies();
  const emitted = {
    bountyLowResponse: 0,
    feedbackUnlocked: 0,
    questionOpen: 0,
    questionSettled: 0,
    questionSettling: 0,
  };
  let scanned = 0;
  let cursor: ManagedLifecycleCursor | null = null;

  while (true) {
    const candidates = await dependencies.listCandidates({
      after: cursor,
      limit: pageSize,
    });
    if (candidates.length === 0) break;

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
      const liveAskGuidance = buildAgentLiveAskGuidance({
        content: response.content,
        nowSeconds,
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

      if (liveAskGuidance && liveAskGuidance.lowResponseRisk === "high" && liveAskGuidance.recommendedAction !== "wait") {
        await dependencies.enqueueAgentCallbackEvent({
          agentId: candidate.agentId,
          eventId: callbackEventId(candidate.operationKey, "bounty.low_response"),
          eventType: "bounty.low_response",
          payload: buildAgentCallbackPayload({
            body: {
              contentId: candidate.contentId,
              liveAskGuidance,
              status: "low_response",
            },
            chainId: candidate.chainId,
            clientRequestId: candidate.clientRequestId,
            eventType: "bounty.low_response",
            operationKey: candidate.operationKey,
          }),
        });
        emitted.bountyLowResponse += 1;
      }

      scanned += 1;
    }

    const lastCandidate = candidates.at(-1);
    if (!lastCandidate) break;
    if (
      cursor &&
      lastCandidate.operationKey === cursor.operationKey &&
      lastCandidate.sortAt.getTime() === cursor.sortAt.getTime()
    ) {
      break;
    }
    cursor = {
      operationKey: lastCandidate.operationKey,
      sortAt: lastCandidate.sortAt,
    };
    if (candidates.length < pageSize) break;
  }

  return {
    emitted,
    scanned,
  };
}
