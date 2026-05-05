export const AGENT_CALLBACK_EVENT_TYPES = [
  "question.submitting",
  "question.submitted",
  "question.open",
  "question.settling",
  "question.settled",
  "question.failed",
  "feedback.unlocked",
  "bounty.low_response",
] as const;

export type AgentCallbackEventType = (typeof AGENT_CALLBACK_EVENT_TYPES)[number];

export function isAgentCallbackEventType(value: string): value is AgentCallbackEventType {
  return AGENT_CALLBACK_EVENT_TYPES.includes(value as AgentCallbackEventType);
}
