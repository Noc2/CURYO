# Curyo SDK

Framework-agnostic frontend SDK foundations for integrating Curyo into existing websites and apps.

## Goals

- Provide a stable client entrypoint for hosted reads and typed write helpers.
- Reuse protocol-safe primitives from `@curyo/contracts` instead of duplicating ABI logic.
- Stay framework-agnostic so React, Next.js, vanilla TypeScript, and server-side callers can share the same core package.

## Planned Surface

- `createCuryoClient(...)` for shared configuration
- typed read helpers for indexed/hosted data
- vote/frontend helpers for building transaction payloads
- small, wallet-agnostic write helpers

Framework-specific hooks and UI components should live in a follow-up package rather than this core SDK.
