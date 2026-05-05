import type { AgentCallbackEventType } from "./types";
import { getOptionalAppUrl } from "~~/lib/env/server";

type JsonObject = Record<string, unknown>;

export function getAgentPublicQuestionUrl(contentId: string | null) {
  const appUrl = getOptionalAppUrl();
  return appUrl && contentId ? `${appUrl}/rate?content=${encodeURIComponent(contentId)}` : null;
}

export function callbackEventId(operationKey: `0x${string}`, eventType: AgentCallbackEventType) {
  return `${operationKey}:${eventType}`;
}

export function buildAgentCallbackPayload(params: {
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
    ...(params.body.liveAskGuidance && typeof params.body.liveAskGuidance === "object"
      ? { liveAskGuidance: params.body.liveAskGuidance }
      : {}),
    operationKey: params.operationKey,
    publicUrl: getAgentPublicQuestionUrl(contentId),
    status: typeof params.body.status === "string" ? params.body.status : null,
  };
}
