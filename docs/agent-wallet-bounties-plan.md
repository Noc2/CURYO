# Agent Wallet Bounties Plan

## Custody Model

- The front-end operator must not receive, escrow, pool, or control bounty funds.
- Decentralized protocol escrow contracts are acceptable when they are deployed as protocol infrastructure, governed by the protocol, and callable by anyone.
- A human user or workspace owner authorizes an agent wallet, smart-wallet session key, or signed authorization policy. The agent spends only within that policy.
- Curyo stores policy metadata, audit records, callbacks, and public transaction state. It should not store the user's owner key or an unrestricted session key.

## Current State

- Browser submissions already fund protocol escrow from the connected wallet.
- The hosted `/api/x402/questions` bounty submission endpoint has been removed because the previous path settled USDC to the server executor wallet and then submitted the bounty.
- The existing MCP paid ask path still uses the interim server executor after reserving an internal agent budget. Treat it as a migration target, not the final operator non-custodial model.
- Redeploying contracts is compatible with this plan and gives us a chance to add cleaner agent-wallet primitives instead of preserving the x402 executor pattern.

## Target Product Flow

1. The user opens the submit page and chooses the Agent tab.
2. The user creates or selects an agent budget for a smart wallet they control.
3. The UI shows spendable USDC, current allowance, per-ask cap, daily cap, allowed categories, expiry, and revocation state.
4. The agent receives a scoped credential that can prepare asks and either:
   - execute allowed calls through a user-authorized smart-wallet/session key, or
   - return a transaction plan for the user's wallet to sign.
5. The bounty moves directly from the user or agent smart wallet into `QuestionRewardPoolEscrow`.
6. Curyo returns operation keys, content IDs, reward-pool IDs, transaction hashes, and callback/status URLs.

## Contract Direction For Redeploy

- Keep protocol escrow contracts for bounty custody.
- Prefer direct smart-wallet execution first: `approve` USDC to `QuestionRewardPoolEscrow`, then call the existing question submission functions from the smart wallet.
- Add optional relayer-friendly funding only if needed:
  - accept USDC permit or transfer authorization from the user's wallet,
  - bind that authorization to a question operation key, chain ID, bounty amount, expiry, and nonce,
  - atomically fund escrow and submit the question in one protocol call,
  - let any relayer submit without ever receiving the USDC.
- Emit enough events to audit payer wallet, submitter wallet, reward pool, and agent policy ID without exposing private agent metadata.

## Commit Plan

1. Remove custodial hosted x402 bounty submission.
   - Delete `/api/x402/questions`.
   - Remove the callable operator-custodied x402 settlement helper.
   - Make the SDK stop defaulting tokenless asks into hosted x402.
   - Add x402 and SDK tests.

2. Update docs, env examples, legal copy, and this plan.
   - Stop advertising hosted x402 bounty submission.
   - Document that current MCP paid asks are still an interim executor path.
   - Clarify that protocol escrow is allowed but front-end operator custody is not.
   - Add legal-language placeholders for non-custodial bounty funding and agent authority.

3. Add agent-wallet policy data model and API.
   - Store policy ID, owner wallet, agent public key, scopes, caps, categories, expiry, status, and audit events.
   - Never store owner private keys.
   - Store encrypted session material only if the user explicitly chooses a Curyo-hosted agent wallet product and counsel approves that custody model.

4. Add submit-page Agent tab and settings management.
   - Submit page: choose Manual or Agent, preview spend, select policy, and launch an agent ask.
   - Settings: create, pause, revoke, rotate, and inspect agent budgets.
   - Show active allowance, daily spend, pending reservations, and recent submissions.

5. Convert MCP and SDK asks to non-custodial execution.
   - Quote returns cost and transaction plan.
   - Ask either executes through a scoped smart-wallet/session key or returns calls for the user's wallet.
   - Existing `curyo_ask_humans` should reject paid asks without a non-custodial funding policy.

6. Add optional relayer and x402-compatible protocol funding.
   - If x402 returns, do not set `payTo` to an operator wallet.
   - Prefer escrow-bound authorization plus permissionless relay, or a protocol contract call that receives funds and submits atomically.
   - Keep Curyo as coordinator and indexer, not bounty custodian.

7. Test and migrate.
   - Foundry tests for escrow funding, permit or authorization replay protection, caps, and event attribution.
   - Next.js node tests for route rejection, policy lifecycle, and transaction-plan generation.
   - Playwright coverage for submit Agent tab, budget visibility, revoke flow, and manual fallback.
   - Migration notes for old x402/MCP users and redeployed contract addresses.

## Legal Document Updates To Review With Counsel

- Terms: users remain responsible for wallet security, session keys, agent credentials, and all actions authorized under their policies.
- Terms: bounty funds are sent by the user or authorized agent wallet directly to protocol smart contracts; the interface operator does not custody bounty funds.
- Terms: protocol escrow is autonomous smart-contract infrastructure and may hold funds according to published protocol rules.
- Risk disclosures: smart-contract risk, stablecoin risk, wallet provider risk, third-party on-ramp risk, user-agent automation risk, and irreversible transactions.
- Privacy policy: disclose agent policy metadata, audit logs, callback URLs, wallet addresses, and public on-chain transaction data.
- Agent terms or acceptable-use policy: require agents to use explicit user authorization, clear spend caps, stable client request IDs, and revocation support.
