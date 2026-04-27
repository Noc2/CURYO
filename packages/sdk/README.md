# Curyo SDK

Framework-agnostic frontend SDK foundations for integrating Curyo into existing websites and apps.

## Goals

- Provide a stable client entrypoint for hosted reads and typed write helpers.
- Reuse protocol-safe primitives from `@curyo/contracts` instead of duplicating ABI logic.
- Stay framework-agnostic so React, Next.js, vanilla TypeScript, and server-side callers can share the same core package.
- Keep the protocol surfaces simple enough that AI-agent integrations can reuse the same submission and read flows as human users.

## Planned Surface

- `createCuryoClient(...)` for shared configuration
- typed read helpers for indexed/hosted data
- vote/frontend helpers for building transaction payloads, including the redeployed tlock metadata bindings
- small, wallet-agnostic write helpers

Framework-specific hooks and UI components should live in a follow-up package rather than this core SDK.

## Available Today

- client config normalization via `createCuryoClient(...)`
- typed read client for hosted/indexed HTTP routes
- vote/frontend helpers in `@curyo/sdk/vote`
- wallet-agnostic agent helpers in `@curyo/sdk/agent` for MCP-compatible asks, non-custodial agent-wallet flows, result parsing, and webhook verification

## Quick Example

```ts
import { createCuryoClient } from "@curyo/sdk";
import {
  buildCommitVoteParams,
  buildVoteTransferPayload,
  buildVoteTransferAndCallData,
} from "@curyo/sdk/vote";

const curyo = createCuryoClient({
  apiBaseUrl: "https://api.curyo.xyz",
  frontendCode: "0x1234567890123456789012345678901234567890",
});

const { content } = await curyo.read.getContent("42");

const commit = await buildCommitVoteParams({
  voter: "0xYourWalletAddress",
  contentId: 42n,
  isUp: true,
  stakeAmount: 2.5,
  epochDuration: 20 * 60,
  roundReferenceRatingBps:
    content.openRound?.referenceRatingBps ?? content.ratingBps ?? 5000,
  defaultFrontendCode: curyo.config.frontendCode,
});

const payload = buildVoteTransferPayload({
  contentId: 42n,
  roundReferenceRatingBps: commit.roundReferenceRatingBps,
  commitHash: commit.commitHash,
  ciphertext: commit.ciphertext,
  frontend: commit.frontend,
  targetRound: commit.targetRound,
  drandChainHash: commit.drandChainHash,
});

const txData = buildVoteTransferAndCallData({
  votingEngineAddress: "0x9999999999999999999999999999999999999999",
  stakeWei: commit.stakeWei,
  payload,
});
```

The SDK stays wallet-agnostic on purpose. Host apps can hand the resulting calldata to wagmi, viem, thirdweb, or their own signing flow.

## Agent Helpers

```ts
import { createCuryoAgentClient, buildWebhookVerifier } from "@curyo/sdk/agent";

const agent = createCuryoAgentClient({
  apiBaseUrl: "https://curyo.example",
  mcpAccessToken: process.env.CURYO_MCP_TOKEN,
});

const quote = await agent.quoteQuestion({
  clientRequestId: "launch-check-1",
  chainId: 42220,
  bounty: {
    amount: "1000000",
    requiredVoters: "3",
    requiredSettledRounds: "1",
  },
  question: {
    title: "Should the agent proceed with launch?",
    description:
      "Review the attached launch checklist and vote up only if the release looks ready.",
    contextUrl: "https://example.com/launch-checklist",
    categoryId: "1",
    tags: ["agent", "launch"],
  },
});

const ask = await agent.askHumans({
  clientRequestId: "launch-check-1",
  maxPaymentAmount: quote.payment?.amount ?? "1000000",
  bounty: {
    amount: "1000000",
    requiredVoters: "3",
    requiredSettledRounds: "1",
  },
  question: {
    title: "Should the agent proceed with launch?",
    description:
      "Review the attached launch checklist and vote up only if the release looks ready.",
    contextUrl: "https://example.com/launch-checklist",
    categoryId: "1",
    tags: ["agent", "launch"],
  },
});

const status = await agent.getQuestionStatus({
  operationKey: ask.operationKey,
});
const result = await agent.getResult({ operationKey: status.operationKey });

const verifier = buildWebhookVerifier({
  secret: process.env.CURYO_WEBHOOK_SECRET ?? "",
});
await verifier.assertValid({ body: webhookBody, headers: webhookHeaders });
```

Question `description` is optional. Submission helpers normalize it to an empty string before hashing and submitting.

For ranked-option bundles, `requiredSettledRounds` is the number of completed bundle round sets to fund. Each round set requires every question in the bundle to settle once, and eligible voters claim each completed set separately.

For agent flows, treat `quote -> ask -> execute wallet calls -> confirm -> wait -> result` as the safe default. `askHumans` requires an authenticated MCP/direct-agent token. Paid asks return ordered wallet calls from a user-controlled smart wallet or scoped agent wallet; after execution, call `confirmAskTransactions` with the transaction hashes. The SDK stays wallet-agnostic and does not import a signing implementation.

## Agent Examples

Runtime-oriented examples live in [`packages/agents/examples`](../agents/examples). They include:

- copy-paste remote MCP configs for OpenClaw-style and Gemini CLI clients
- a canonical `landing-pitch-review.ts` loop for backend workers and agent wrappers
- notes for ChatGPT, Claude, and Hermes-style persistent agents

Use them as reference implementations for the same safe default:

1. quote before spending
2. ask with a stable client request id
3. wait through a signed callback or poll status
4. read the structured result
5. store `publicUrl`, `operationKey`, and the result summary in memory or logs
