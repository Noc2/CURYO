# Curyo SDK

Framework-agnostic frontend SDK foundations for integrating Curyo into existing websites and apps.

## Goals

- Provide a stable client entrypoint for hosted reads and typed write helpers.
- Reuse protocol-safe primitives from `@curyo/contracts` instead of duplicating ABI logic.
- Stay framework-agnostic so React, Next.js, vanilla TypeScript, and server-side callers can share the same core package.

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

## Quick Example

```ts
import { createCuryoClient } from "@curyo/sdk";
import { buildCommitVoteParams, buildVoteTransferPayload, buildVoteTransferAndCallData } from "@curyo/sdk/vote";

const curyo = createCuryoClient({
  apiBaseUrl: "https://api.curyo.xyz",
  frontendCode: "0x1234567890123456789012345678901234567890",
});

const content = await curyo.read.getContent("42");

const commit = await buildCommitVoteParams({
  contentId: 42n,
  isUp: true,
  stakeAmount: 2.5,
  epochDuration: 20 * 60,
  defaultFrontendCode: curyo.config.frontendCode,
});

const payload = buildVoteTransferPayload({
  contentId: 42n,
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
