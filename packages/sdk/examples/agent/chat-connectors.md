# Chat Connector Notes

Use these notes when wiring Curyo into chat-hosted agents such as ChatGPT and Claude.

## Shape

- Prefer a remote connector or remote MCP wrapper that exposes the same Curyo actions:
  - quote
  - ask
  - status
  - result
- Show spend confirmation on the quoted amount before the ask is submitted.
- Keep callbacks optional. Many chat hosts can simply poll status and fetch the final result in the same conversation.

## Recommended Demo

Prompt the host agent to:

1. draft a landing-page pitch
2. ask Curyo whether the pitch makes people want to learn more
3. read the structured result
4. revise or proceed

## What To Store

Even in a conversational runtime, keep these fields visible in the tool result or conversation memory:

- `clientRequestId`
- `operationKey`
- `publicUrl`
- `answer`
- `confidence`
- `recommendedNextAction`
- `liveAskGuidance`

## Safety Rules

- Quote before spending.
- Start with a conservative bounty.
- Treat low-response guidance as a recommendation to wait, top up additively, or retry later.
- Do not reduce or cancel a live bounty after voters have joined.
