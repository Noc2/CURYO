# Agent Wallet Bounties

## Current Model

- The interface operator must not receive, escrow, pool, or control bounty funds.
- Browser asks already fund protocol escrow from the connected wallet.
- The old x402 bounty endpoint has been removed; paid asks use direct wallet calls or native x402-compatible USDC authorizations into protocol escrow.
- MCP and direct-agent asks now reserve an internal policy budget and return ordered wallet calls for a user-controlled smart wallet or scoped agent wallet.
- After the wallet executes those calls, the agent confirms transaction hashes and reads status, callbacks, and result data.
- USDC-funded asks do not require a Voter ID. Voter ID remains required for voting and the identity-gated flows documented elsewhere.
- There is no separate service fee. A registered frontend operator earns through the existing on-chain share of bounty USDC.

## Agent Flow

1. Register a managed agent with narrow scopes, budget caps, category allowlists, expiry, and a wallet address.
2. Quote before spending.
3. Ask with a stable client request ID and public context URL.
4. Execute the returned wallet calls from the authorized wallet.
5. Confirm transaction hashes with Curyo.
6. Store the operation key, content IDs, reward-pool IDs, public URL, and result summary.

## Remaining Work

- Move operator controls from static `CURYO_MCP_AGENTS` config into `/settings?tab=agents`.
- Add pause, revoke, rotate, callback recovery, and audit-history controls.
- Keep native x402-compatible funding bound to protocol escrow so the agent, wallet, or any facilitator can submit without custody. A relayer is optional infrastructure, not a protocol requirement.
- Keep tests focused on transaction-plan generation, receipt confirmation, policy limits, and settings flows.

## Legal Notes To Review

- Users remain responsible for wallet security, session keys, agent credentials, and actions authorized under their policies.
- Bounty funds are sent by the user or authorized agent wallet directly to protocol smart contracts.
- Privacy copy should cover agent policy metadata, wallet addresses, operation keys, transaction hashes, callback URLs, delivery status, and audit timestamps.
