# Curyo Gas Sponsorship Plan

## Goal

Ship a user experience where:

- Curyo keeps `EOA` wallets as the canonical user identity.
- Users on Celo-compatible wallets can pay gas in `CELO`, `USDC`, or `USDT` when supported.
- Users on wallets with weaker Celo support, especially `MetaMask`, can still complete key actions through selective gas sponsorship.
- `cREP` remains a reputation/staking asset rather than becoming the thing that funds gas.

This document reflects a second pass over both the current repository and the latest official Celo/OpenZeppelin documentation.

## Double-Checked Findings

### 1. Celo fee abstraction already solves part of the problem

Celo supports paying gas with allowlisted ERC-20 fee currencies through the `feeCurrency` transaction field, without requiring account abstraction, paymasters, or relayers. This is the best default path for supported wallets.

Important implications:

- `USDC` / `USDT` gas is a wallet capability problem, not a protocol problem.
- Transactions using non-CELO fee currencies cost roughly `50k` extra gas.
- Celo documentation notes that some network docs are still catching up after the L2 transition on `March 26, 2025`, so all wallet behavior must still be validated on `celoSepolia` before production rollout.

### 2. MetaMask is still the main compatibility constraint

MetaMask on Celo falls back to paying gas in `CELO`. It should not be treated as a reliable `USDC` / `USDT` fee-abstraction wallet.

Operational implication:

- A universal user experience still needs a `CELO-funded fallback`, which is where selective sponsorship fits.

### 3. Curyo is strongly EOA-address-centric today

The current protocol uses plain addresses as the core identity surface:

- [VoterIdNFT.sol](/Users/davidhawig/source/curyo-release/packages/foundry/contracts/VoterIdNFT.sol)
- [HumanFaucet.sol](/Users/davidhawig/source/curyo-release/packages/foundry/contracts/HumanFaucet.sol)
- [ProfileRegistry.sol](/Users/davidhawig/source/curyo-release/packages/foundry/contracts/ProfileRegistry.sol)
- [ContentRegistry.sol](/Users/davidhawig/source/curyo-release/packages/foundry/contracts/ContentRegistry.sol)
- [RoundVotingEngine.sol](/Users/davidhawig/source/curyo-release/packages/foundry/contracts/RoundVotingEngine.sol)
- [FrontendRegistry.sol](/Users/davidhawig/source/curyo-release/packages/foundry/contracts/FrontendRegistry.sol)
- [CategoryRegistry.sol](/Users/davidhawig/source/curyo-release/packages/foundry/contracts/CategoryRegistry.sol)

That makes an `EOA-first` architecture a natural fit. It preserves:

- Voter ID ownership
- submitter identity
- profile ownership
- current delegation rules
- existing UX assumptions around wallet addresses

### 4. Sponsored voting cannot reuse the current `transferAndCall` flow as-is

The normal vote path in [useRoundVote.ts](/Users/davidhawig/source/curyo-release/packages/nextjs/hooks/useRoundVote.ts) uses `cREP.transferAndCall(...)`, while [RoundVotingEngine.sol](/Users/davidhawig/source/curyo-release/packages/foundry/contracts/RoundVotingEngine.sol) also supports a direct `commitVote(...)` path backed by `safeTransferFrom`.

That means selective sponsorship for voting should use a new `permit`-backed entrypoint, not try to relay the existing `transferAndCall(...)` path.

### 5. viem already understands Celo fee currencies

The installed `viem` types in this repo already expose Celo `feeCurrency` support:

- `packages/nextjs/node_modules/viem/_types/celo/types.d.ts`
- `packages/nextjs/node_modules/viem/_types/chains/definitions/celoSepolia.d.ts`

That means fee-abstraction support should fit the current frontend stack in:

- [wagmiConfig.tsx](/Users/davidhawig/source/curyo-release/packages/nextjs/services/web3/wagmiConfig.tsx)
- [wagmiConnectors.tsx](/Users/davidhawig/source/curyo-release/packages/nextjs/services/web3/wagmiConnectors.tsx)
- [useScaffoldWriteContract.ts](/Users/davidhawig/source/curyo-release/packages/nextjs/hooks/scaffold-eth/useScaffoldWriteContract.ts)

### 6. OpenZeppelin support exists, but there is one important nuance

The repo already includes:

- `ERC2771ContextUpgradeable`
- `ERC2771ForwarderUpgradeable`

in `openzeppelin-contracts-upgradeable`.

However, [ERC2771ContextUpgradeable.sol](/Users/davidhawig/source/curyo-release/packages/foundry/lib/openzeppelin-contracts-upgradeable/contracts/metatx/ERC2771ContextUpgradeable.sol) stores the trusted forwarder as an `immutable` constructor value by default.

That is fine for a fixed forwarder, but not ideal if Curyo wants forwarder rotation without a contract upgrade.

Recommended adjustment:

- build a small shared Curyo base that inherits `ERC2771ContextUpgradeable`
- override `trustedForwarder()` to return a storage-backed address
- manage that address through governance/config role

This avoids baking operational rigidity into the first deployment.

## Recommended Architecture

Use two transaction lanes:

### Lane A: Wallet-paid transactions

Default path for wallets that support Celo fee abstraction well.

- User signs and sends directly.
- Gas can be paid in `CELO`, `USDC`, or `USDT` depending on wallet and chain support.
- This path should remain the default when possible because it is simpler, cheaper to operate, and avoids relayer trust assumptions.

### Lane B: Selectively sponsored transactions

Fallback path for wallets like MetaMask or for onboarding-sensitive actions where Curyo wants to remove all gas friction.

- User still signs as the same `EOA`.
- A trusted forwarder / relayer pays `CELO` for the network transaction.
- Contracts recover the original user via `_msgSender()`.
- Sponsorship is limited to a whitelist of actions and policy rules.

## Design Principles

1. Keep the user identity as the `EOA`.
2. Use `Celo fee abstraction` before using protocol sponsorship.
3. Use sponsorship only where it materially improves conversion or retention.
4. Use `CELO` as the sponsor wallet asset, not `cREP`.
5. Do not sell `cREP` to fund gas.
6. Prefer `ERC20Permit` over pre-approval flows for sponsored stake-moving actions.

## Scope Recommendation

### In v1

Include:

- fee-currency selection for direct user-paid transactions
- selective sponsorship for simple non-staking actions
- permit-backed sponsorship for a narrow set of high-friction staking actions

### Out of v1

Defer:

- full ERC-4337 smart-account migration
- paymaster / bundler architecture
- gasless faucet claims
- sponsored category submission
- protocol-native gas-credit accounting on-chain

## Contract Plan

### 1. Add a shared sponsored-context base

Create a reusable contract base in `packages/foundry/contracts/` that:

- extends `ERC2771ContextUpgradeable`
- stores `trustedForwarder` in storage
- exposes `setTrustedForwarder(address)` behind governance/config access
- overrides:
  - `trustedForwarder()`
  - `_msgSender()`
  - `_msgData()`
  - `_contextSuffixLength()` if required by inheritance

Reason:

- avoids the immutable-forwarder limitation
- keeps future forwarder rotation simple

### 2. Add ERC-2771 support to the upgradeable user-facing contracts

Update:

- [ProfileRegistry.sol](/Users/davidhawig/source/curyo-release/packages/foundry/contracts/ProfileRegistry.sol)
- [ContentRegistry.sol](/Users/davidhawig/source/curyo-release/packages/foundry/contracts/ContentRegistry.sol)
- [RoundVotingEngine.sol](/Users/davidhawig/source/curyo-release/packages/foundry/contracts/RoundVotingEngine.sol)
- [RoundRewardDistributor.sol](/Users/davidhawig/source/curyo-release/packages/foundry/contracts/RoundRewardDistributor.sol)
- [FrontendRegistry.sol](/Users/davidhawig/source/curyo-release/packages/foundry/contracts/FrontendRegistry.sol)

For each, replace identity-sensitive `msg.sender` usage with `_msgSender()` where appropriate.

Examples:

- profile owner checks
- reward claimant
- frontend fee claimant
- submitter checks
- vote caller identity

### 3. Do not put `CategoryRegistry` in the first sponsorship wave

[CategoryRegistry.sol](/Users/davidhawig/source/curyo-release/packages/foundry/contracts/CategoryRegistry.sol) is non-upgradeable and also requires the caller to be the actual holder identity.

Because nothing is deployed yet, it could be adapted later if needed. But it is not a good first sponsorship target because:

- it is rare
- it is high-stake (`100 cREP`)
- it introduces extra governance/proposal complexity

Recommendation:

- keep it on normal direct transactions in v1
- revisit only after the sponsor system is stable

### 4. Keep `HumanFaucet` outside the first sponsorship wave

[HumanFaucet.sol](/Users/davidhawig/source/curyo-release/packages/foundry/contracts/HumanFaucet.sol) is special because the proof flow derives the user address from verification output and interacts with `SelfVerificationRoot`.

It is better to keep that flow simple in v1:

- wallet pays with `CELO` or supported fee currency
- no sponsorship until the rest of the pipeline is proven

### 5. Add permit-backed sponsored entrypoints for staking actions

[CuryoReputation.sol](/Users/davidhawig/source/curyo-release/packages/foundry/contracts/CuryoReputation.sol) already supports `ERC20Permit`.

Use that to add:

- `commitVoteWithPermit(...)` in [RoundVotingEngine.sol](/Users/davidhawig/source/curyo-release/packages/foundry/contracts/RoundVotingEngine.sol)
- `submitContentWithPermit(...)` in [ContentRegistry.sol](/Users/davidhawig/source/curyo-release/packages/foundry/contracts/ContentRegistry.sol)
- `registerWithPermit(...)` in [FrontendRegistry.sol](/Users/davidhawig/source/curyo-release/packages/foundry/contracts/FrontendRegistry.sol)
- `topUpStakeWithPermit(...)` in [FrontendRegistry.sol](/Users/davidhawig/source/curyo-release/packages/foundry/contracts/FrontendRegistry.sol)
- optionally `reviveContentWithPermit(...)` in [ContentRegistry.sol](/Users/davidhawig/source/curyo-release/packages/foundry/contracts/ContentRegistry.sol)

Each permit-backed entrypoint should:

- use `_msgSender()` as the user
- consume a permit signature for just the required amount
- call `permit(...)`
- pull the exact stake via `transferFrom(...)`
- reuse existing internal logic

This avoids needing to redesign the token contract.

## Frontend Plan

### 1. Add explicit fee-currency configuration

Create a new module such as:

- `packages/nextjs/lib/celo/feeCurrencies.ts`

It should define:

- chain IDs where fee abstraction is enabled
- token vs adapter addresses per chain
- display labels
- decimals
- per-wallet support notes

### 2. Add a shared gas mode hook

Create:

- `useGasPaymentMode`

Suggested modes:

- `celo`
- `usdc`
- `usdt`
- `sponsored`

This hook should evaluate:

- selected network
- connected wallet
- whether the wallet appears to support fee-currency writes
- sponsor eligibility

### 3. Extend write helpers to accept Celo fee metadata

Update the frontend write pipeline so selected direct transactions can include:

- `feeCurrency`
- any chain-specific tx type/options Celo requires

This likely belongs in a narrow helper instead of changing every caller manually.

Potential integration points:

- [useScaffoldWriteContract.ts](/Users/davidhawig/source/curyo-release/packages/nextjs/hooks/scaffold-eth/useScaffoldWriteContract.ts)
- [useRoundVote.ts](/Users/davidhawig/source/curyo-release/packages/nextjs/hooks/useRoundVote.ts)

### 4. Split the UI into simple user choices

Recommended UX:

- supported wallet: `Pay with CELO`, `Pay with USDC`, `Pay with USDT`
- unsupported wallet: `Pay with CELO`, `Use sponsored gas` if eligible

Do not show unsupported options.

### 5. Keep the current direct vote flow as the normal path

The existing [useRoundVote.ts](/Users/davidhawig/source/curyo-release/packages/nextjs/hooks/useRoundVote.ts) `transferAndCall(...)` path should remain the primary direct path.

Add a second sponsored vote path that uses:

- relayed request
- permit-backed `commitVoteWithPermit(...)`

That keeps the current UX working while enabling a clean fallback.

## Sponsorship Service Plan

### 1. Build a dedicated sponsor service package

Create a new service package such as:

- `packages/sponsor`

Do not run relayer nonce management inside transient Next.js route handlers.

Responsibilities:

- hold relayer key funded with `CELO`
- verify user signatures
- verify forward requests
- enforce sponsor policy
- estimate gas and reject oversized requests
- serialize nonce handling
- broadcast transactions
- store sponsorship usage and outcomes

### 2. Define a strict sponsor policy engine

The sponsor service should implement:

- selector allowlist
- max stake limits
- per-user daily caps
- per-user weekly caps
- cooldowns
- gas ceiling per action
- global pause switch
- allow / deny by chain

### 3. Use a single trusted forwarder

Deploy one forwarder contract for sponsored EOA actions.

Recommended default:

- non-upgradeable forwarder deployment is fine
- target contracts should be able to rotate the trusted forwarder via storage

### 4. Keep accounting off-chain in v1

Track:

- sponsored tx count
- sponsored gas spent
- sponsorship category
- user eligibility state

in your backend / app database first.

No on-chain gas-credit contract is required in v1.

## Recommended Sponsorship Scope

### Phase 1: simple claims and profile actions

Sponsor:

- profile updates
- avatar color changes
- reward claims
- frontend fee claims

Why first:

- no token approval complexity
- immediate UX win
- low abuse surface

### Phase 2: sponsored submission

Add:

- `submitContentWithPermit(...)`

Why second:

- submission is high-friction and user-visible
- permit removes the extra approval transaction

### Phase 3: sponsored voting

Add:

- `commitVoteWithPermit(...)`

Why third:

- highest volume
- most operational exposure
- easiest place to burn sponsor budget if policy is weak

### Phase 4: optional frontend registration support

Add:

- `registerWithPermit(...)`
- `topUpStakeWithPermit(...)`

This can wait until the sponsor system is stable because it is infrequent and high-value.

## Deployment Plan

Because nothing is deployed yet, this should be built into the first deployment rather than retrofitted later.

### Contracts

- add storage-backed ERC-2771 support before first deploy
- add permit-backed entrypoints before first deploy
- generate ABIs and deployed metadata once these signatures settle

### Frontend

- build fee mode support before mainnet launch
- keep the direct path fully working even if sponsorship is down

### Service

- deploy sponsor service with a dedicated `CELO` relayer wallet
- monitor nonce health, gas usage, and failure rates

## Testing Plan

### Contract tests

Add Foundry coverage for:

- trusted forwarder calls preserve user identity
- non-forwarded calls still work unchanged
- invalid signer reverts
- expired forward request reverts
- replay protection
- permit replay / expired permit
- sponsored vote uses the right voter identity
- Voter ID and delegation invariants still hold under `_msgSender()`

### Frontend / integration tests

Add coverage for:

- direct `CELO` transaction
- direct `USDC` fee-currency transaction on `celoSepolia`
- MetaMask fallback path
- sponsored profile update
- sponsored reward claim
- sponsored content submission
- sponsored vote

### Pre-launch compatibility matrix

Explicitly verify on `celoSepolia`:

- MetaMask extension
- MetaMask mobile if targeted
- WalletConnect wallet that supports fee abstraction
- at least one Celo-native wallet if you plan to recommend one

## Comparison: 4337-first Curyo

This plan intentionally favors `EOA + Celo fee abstraction + selective sponsorship`, but because Curyo is still pre-deployment it is worth making the alternative explicit.

### What `4337-first Curyo` would mean

A `4337-first` version of Curyo would treat the user's smart account as the primary protocol account from the beginning.

That would usually imply:

- smart account is the wallet that holds `cREP`
- smart account is the address that owns the Voter ID or acts as the canonical protocol address
- voting, submission, profile updates, and claims all route through a bundler/paymaster stack
- gasless UX is a first-class assumption rather than a selective fallback

### Advantages of `4337-first Curyo`

- Cleaner universal gasless UX. Instead of mixing fee-currency support, CELO fallback, and sponsorship rules, the product can present one main transaction path.
- Better batching potential. Multi-step flows such as approve-and-act or permit-and-act can be wrapped into a more coherent account abstraction pipeline.
- More future flexibility. Session keys, delegated permissions, automated actions, and richer recovery models fit more naturally into a smart-account world.
- Less distinction between "supported wallets" and "unsupported wallets" at the product layer if the smart-account stack is consistently adopted.
- More coherent long-term sponsor architecture if Curyo expects gasless interactions to become the default for most actions.

### Disadvantages of `4337-first Curyo`

- It changes the identity model much earlier. Today Curyo is built around plain addresses across [VoterIdNFT.sol](/Users/davidhawig/source/curyo-release/packages/foundry/contracts/VoterIdNFT.sol), [HumanFaucet.sol](/Users/davidhawig/source/curyo-release/packages/foundry/contracts/HumanFaucet.sol), [ProfileRegistry.sol](/Users/davidhawig/source/curyo-release/packages/foundry/contracts/ProfileRegistry.sol), and [ContentRegistry.sol](/Users/davidhawig/source/curyo-release/packages/foundry/contracts/ContentRegistry.sol). A 4337-first design forces an early decision about whether the smart account is the true user identity.
- It raises the onboarding design burden. Faucet claims, Voter ID minting, delegation, and profile ownership all become design questions rather than staying aligned with the user's EOA.
- It adds more moving parts on day one. Bundler reliability, paymaster policy, user operation simulation, and smart-account deployment all become launch-critical infrastructure rather than optional layers.
- It makes debugging and local development more complex. The current repo already has a straightforward EOA + wagmi + viem model; 4337 would widen the gap between a simple contract write and the production transaction path.
- It does not actually remove economic complexity. Curyo would still need sponsor budgets, abuse controls, transaction policy, and operations around gas funding.
- It is harder to keep some flows simple. For example, [HumanFaucet.sol](/Users/davidhawig/source/curyo-release/packages/foundry/contracts/HumanFaucet.sol) currently derives the claimant address directly from the verification output. That is conceptually cleaner in an EOA-first system.

### Why this document still recommends the EOA-first approach

The EOA-first plan wins on `fit with the current protocol design`.

It preserves:

- address-based identity
- current Voter ID semantics
- existing delegation assumptions
- direct wallet compatibility
- the ability to use Celo-native fee abstraction immediately

It also keeps the architecture layered:

- `fee abstraction` where wallets support it
- `selective sponsorship` where UX needs it
- optional future evolution toward richer smart-account patterns later

### When Curyo should reconsider `4337-first`

Revisit a 4337-first architecture if any of these become true:

- Curyo decides the primary UX promise is "gasless by default for nearly everything"
- the product wants session keys or delegated automation as a core feature
- sponsor coverage grows so broad that selective sponsorship becomes the default path anyway
- identity is intentionally redesigned around smart accounts rather than EOAs
- a future onboarding redesign makes smart-account ownership a better fit for Voter ID and faucet flows

### Summary

`4337-first Curyo` is a valid architecture, especially because the protocol is not deployed yet.

Its main strength is product coherence around gasless UX.

Its main weakness is that it forces Curyo to solve identity, onboarding, and infrastructure complexity all at once.

The `EOA + Celo fee abstraction + selective sponsorship` plan is less elegant in theory, but it is the lower-risk path that matches the current protocol model far better.

## Open Questions To Resolve During Spike

1. Which wallets should Curyo officially label as supporting `USDC` / `USDT` gas on `celoSepolia` and `celo`?
2. Which fee currencies are actually available and smooth on `celoSepolia` right now?
3. Whether sponsorship should require an existing Voter ID for all actions, or allow a small onboarding whitelist before verification.
4. Whether to sponsor `submitContent` only for verified users or for all first-time users.
5. Whether reward claims should always be sponsored because they reduce stuck-value frustration.

## Final Recommendation

The best fit for Curyo is:

- `EOA identity` as the core model
- `Celo fee abstraction` as the default direct path
- `CELO-funded selective sponsorship` as the compatibility and onboarding fallback
- `ERC20Permit` for sponsored stake-moving actions

This architecture preserves the existing protocol design, works with the current codebase, keeps `cREP` out of the gas-funding story, and avoids the complexity of moving the whole product to smart accounts before launch.

## External References

- [Celo fee abstraction overview](https://docs.celo.org/tooling/overview/fee-abstraction)
- [Celo ERC-20 gas fees / feeCurrency](https://docs.celo.org/legacy/protocol/transaction/erc20-transaction-fees)
- [MetaMask on Celo](https://docs.celo.org/tooling/wallets/metamask/use)
- [OpenZeppelin Contracts 5.x metatx changelog](https://docs.openzeppelin.com/contracts/5.x/changelog)
