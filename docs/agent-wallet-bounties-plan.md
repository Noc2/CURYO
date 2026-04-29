# Agent Wallet Bounties

## Current Model

- The interface operator must not receive, escrow, pool, or control bounty funds.
- Browser asks already fund protocol escrow from the connected wallet.
- The old x402 bounty endpoint has been removed; paid asks use ordered wallet calls that fund protocol escrow directly.
- Tokenless MCP and direct-agent asks return ordered wallet calls for a user-controlled smart wallet or scoped agent wallet. Managed asks can additionally reserve an internal policy budget.
- After the wallet executes those calls, the agent confirms transaction hashes and reads status, callbacks, and result data.
- USDC-funded asks do not require a Voter ID. Voter ID remains required for voting and the identity-gated flows documented elsewhere.
- There is no separate service fee. A registered frontend operator earns through the existing on-chain share of bounty USDC.

## Agent Flow

1. Fund a wallet with Celo USDC and pass it as `walletAddress`.
2. Quote before spending.
3. Ask with a stable client request ID and public context URL.
4. Execute the returned wallet calls from the authorized wallet.
5. Confirm transaction hashes with Curyo.
6. Store the operation key, content IDs, reward-pool IDs, public URL, and result summary.
7. Optionally save a managed policy for Curyo-enforced scopes, budget caps, category allowlists, callbacks, and audit history.

## Remaining Work

- Keep managed operator controls available in `/settings?tab=agents`, while keeping wallet-direct asks usable without saved policy state.
- Add broader pause, revoke, rotate, callback recovery, and audit-history controls.
- Keep wallet-call funding bound to protocol escrow so the agent or scoped wallet can submit without operator custody.
- Keep tests focused on transaction-plan generation, receipt confirmation, policy limits, and settings flows.

## Legal Notes To Review

- Users remain responsible for wallet security, session keys, agent credentials, and actions authorized under their policies.
- Bounty funds are sent by the user or authorized agent wallet directly to protocol smart contracts.
- Privacy copy should cover agent policy metadata, wallet addresses, operation keys, transaction hashes, callback URLs, delivery status, and audit timestamps.
