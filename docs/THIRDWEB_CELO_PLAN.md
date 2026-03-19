# thirdweb + Celo Plan for Curyo

Checked on: March 19, 2026

## Recommendation

Adopt a `thirdweb-first` wallet and gasless strategy on Celo, but do **not** implement the full custom gas sponsorship plan immediately.

Second-pass conclusion:

- The overall direction still looks right.
- The main remaining risk is `external wallet capability coverage`, not the basic thirdweb/Celo fit.
- Because of that, the plan should stay `validation-first`, not `migration-first`.

Recommended production path:

1. Use `thirdweb` as the primary wallet UX.
2. Use `EIP-7702` with `sponsorGas` as the primary transaction path.
3. Keep `Celo fee abstraction` as the fallback for unsupported wallets or unsupported wallet capabilities.
4. Defer custom `EIP-2771` / relayer / permit sponsorship work unless real-world testing on `celoSepolia` shows that MetaMask or other external wallets cannot reliably use the `7702 / sendCalls` path.

This is the best fit for Curyo because the protocol is still strongly `EOA-address-centric`, and `EIP-7702` preserves the user address while still enabling sponsored transactions.

## Double-Checked Findings

### 1. thirdweb can sponsor gas without forcing a custom relayer stack

thirdweb’s current gas sponsorship docs say they support sponsored transactions for both `EIP-7702` and `ERC-4337`, and they recommend `EIP-7702`.

Important implication:

- If Curyo uses thirdweb’s `EIP-7702` path, most of the infrastructure work in `docs/GAS_SPONSORSHIP_PLAN.md` is no longer needed for v1.

### 2. Celo support for sponsored EIP-7702 is live in thirdweb

thirdweb announced sponsored `EIP-7702` support for `Celo` on **October 20, 2025**.

Important implication:

- This is not a theoretical future path. It is the current path to validate first on `celoSepolia`.

### 3. External wallets like MetaMask may use the 7702 path too

thirdweb’s `next-gen smart accounts` changelog says that external wallets such as `MetaMask` and `Coinbase Wallet` can use the same `EIP-7702` capabilities through `EIP-5792 sendCalls`.

Important implication:

- A MetaMask user may still benefit from sponsored gas through thirdweb without Curyo implementing `EIP-2771`, **if** the wallet/browser/chain combination supports that path in practice.
- This must be validated on `celoSepolia`. It should be treated as a feature test, not as a guaranteed assumption across all user environments.

### 3a. External-wallet sponsorship is capability-dependent

thirdweb’s `sendCalls` docs say the feature works with:

- all thirdweb wallets
- and only `certain injected wallets`

They also say that when `sendCalls` is unsupported, calls fall back to `individual transactions`.

Important implication:

- `MetaMask gasless on Celo` should not be treated as guaranteed just because MetaMask can connect.
- In unsupported environments, the app may need to fall back to direct wallet transactions instead of sponsorship.
- This is the strongest reason to keep `Celo fee abstraction + CELO fallback` in the architecture.

### 4. thirdweb Engine relayers are a different path with different requirements

thirdweb’s Engine relayer docs explicitly require the target contract to support:

- `EIP-2771`
- or `EIP-2612 permit`

Important implication:

- My earlier note was correct for the `relayer` path.
- It is **not** the only gasless path in thirdweb anymore.
- If Curyo standardizes on `7702 / sendCalls`, the custom contract-side sponsorship work can be deferred.

### 5. Celo native fee abstraction is still useful

Celo docs still say:

- wallets can pay gas with `feeCurrency` when the wallet supports Celo fee abstraction
- non Celo-optimized wallets still need `CELO`

Important implication:

- thirdweb does not make Celo fee abstraction useless.
- It remains the cleanest fallback for unsupported wallets or unsupported `sendCalls` environments.

### 6. Curyo’s current architecture fits EIP-7702 much better than ERC-4337 smart accounts

Current repo findings:

- [packages/nextjs/services/web3/wagmiConnectors.tsx](../packages/nextjs/services/web3/wagmiConnectors.tsx) is still `RainbowKit` / `wagmi` / external-wallet based.
- [packages/nextjs/components/scaffold-eth/RainbowKitCustomConnectButton/index.tsx](../packages/nextjs/components/scaffold-eth/RainbowKitCustomConnectButton/index.tsx) is still the main connect entry point.
- [packages/nextjs/utils/env/public.ts](../packages/nextjs/utils/env/public.ts) already constrains production chains to `Celo` / `Celo Sepolia`.
- [packages/nextjs/components/governance/SelfVerifyButton.tsx](../packages/nextjs/components/governance/SelfVerifyButton.tsx) is explicitly `Celo` / `Celo Sepolia` only.
- [packages/nextjs/hooks/useRoundVote.ts](../packages/nextjs/hooks/useRoundVote.ts) still submits votes through `cREP.transferAndCall(...)`.

Important implication:

- `EIP-7702` is attractive because the user stays the same address, so identity-sensitive surfaces like `Voter ID`, `Self.xyz`, `profiles`, `submissions`, and `votes` remain conceptually stable.
- A broad `ERC-4337 smart account` rollout would be much more disruptive because the connected wallet becomes an admin of a separate smart account address.

### 7. The current vote path does not look like a blocker for 7702

Current repo findings:

- [packages/nextjs/hooks/useRoundVote.ts](../packages/nextjs/hooks/useRoundVote.ts) builds a normal `transferAndCall(...)` vote transaction
- [packages/nextjs/hooks/scaffold-eth/useScaffoldWriteContract.ts](../packages/nextjs/hooks/scaffold-eth/useScaffoldWriteContract.ts) already centralizes a large part of direct contract-write execution

Important implication:

- For the `7702` path, the first migration should focus on the wallet execution layer, not on redesigning the voting contracts.
- Contract-side sponsorship work should stay deferred unless testing proves the 7702 path is not enough.

### 8. Self.xyz still appears compatible with the preferred path

Current repo finding:

- [packages/nextjs/components/governance/SelfVerifyButton.tsx](../packages/nextjs/components/governance/SelfVerifyButton.tsx) binds verification to the currently connected address on `Celo` / `Celo Sepolia`

Important implication:

- As long as the connected wallet address remains the canonical user address, the thirdweb `7702` path still fits the current Self.xyz flow.
- This still needs end-to-end testing, but there is no obvious architectural mismatch here.

## Decision Matrix

### Option A: thirdweb in-app wallet + EIP-7702 + sponsorGas

Pros:

- Best onboarding
- Sponsored gas
- Keeps user address
- Best fit for current Curyo identity model

Cons:

- Requires moving the primary connect UX away from RainbowKit
- Requires validation of all critical write flows on `celoSepolia`

Recommendation:

- `Strongly recommended`

### Option B: MetaMask / external wallet + thirdweb EIP-7702 sendCalls

Pros:

- Lets external-wallet users benefit from sponsorship
- Keeps user address
- Avoids contract-side relayer work if it works reliably

Cons:

- Capability depends on wallet support in practice
- Must be feature-detected and tested carefully
- May degrade to plain wallet transactions when sponsorship support is unavailable

Recommendation:

- `Recommended as an opportunistic supported path, but not as the default product promise until validated`

### Option C: thirdweb Engine relayer + EIP-2771 / permit

Pros:

- Broader fallback path for unsupported wallets
- Works even when `sendCalls` / `7702` is unavailable

Cons:

- Requires contract changes
- Requires sponsor policy and relayer operations
- Reintroduces most of the complexity from the original gas sponsorship plan

Recommendation:

- `Defer unless testing proves it is needed`

### Option D: stay on RainbowKit + build the full custom gas sponsorship plan

Pros:

- Full control
- Works without adopting thirdweb as the primary wallet platform

Cons:

- Highest engineering cost
- More operational burden
- Solves a problem thirdweb already solves better for v1

Recommendation:

- `Not recommended for the first production launch`

## Concrete Plan

### Phase 1: Validation Spike

Goal:

- Prove whether `thirdweb + Celo + 7702` covers enough of Curyo that the custom sponsorship plan can be reduced to a fallback-only document.

Validate on `celoSepolia`:

1. In-app wallet with `EIP-7702` and `sponsorGas`
2. MetaMask with `EIP-7702 / sendCalls`
3. Direct fallback transaction path for unsupported wallets
4. Capability detection and downgrade behavior for external wallets

Critical flows to test:

1. `Self.xyz` verification
2. profile create / update
3. vote commit via `transferAndCall`
4. content submission
5. reward claim
6. frontend registration and stake top-up

Success criteria:

- user address stays stable everywhere
- no extra contract changes are needed for the primary path
- MetaMask works on at least one reliable sponsored path on `celoSepolia`
- unsupported external-wallet environments degrade cleanly to direct transactions
- the UI can tell the user when sponsorship is unavailable

### Phase 2: Wallet Layer Migration

Recommended implementation:

1. Add a `ThirdwebProvider` and a project client.
2. Replace the current primary connect UI in [packages/nextjs/components/scaffold-eth/RainbowKitCustomConnectButton/index.tsx](../packages/nextjs/components/scaffold-eth/RainbowKitCustomConnectButton/index.tsx) with `thirdweb` connect UI.
3. Keep `wagmi` for read-heavy hooks and existing query infrastructure.
4. Use thirdweb’s adapter support instead of rewriting all read logic immediately.
5. Keep the current read/query architecture stable while swapping connect and execution first.

Files most likely touched first:

- [packages/nextjs/components/scaffold-eth/RainbowKitCustomConnectButton/index.tsx](../packages/nextjs/components/scaffold-eth/RainbowKitCustomConnectButton/index.tsx)
- [packages/nextjs/services/web3/wagmiConnectors.tsx](../packages/nextjs/services/web3/wagmiConnectors.tsx)
- [packages/nextjs/services/web3/wagmiConfig.tsx](../packages/nextjs/services/web3/wagmiConfig.tsx)

### Phase 3: Transaction Execution Refactor

Goal:

- Keep contract logic the same where possible, and switch the wallet execution path.

Recommended execution priority:

1. `thirdweb 7702 sponsored`
2. `thirdweb sendCalls` when external-wallet capability is present
3. `Celo feeCurrency` direct wallet tx
4. normal `CELO` direct wallet tx

Do this by introducing a shared execution abstraction for writes.

Files likely involved:

- [packages/nextjs/hooks/useRoundVote.ts](../packages/nextjs/hooks/useRoundVote.ts)
- [packages/nextjs/hooks/scaffold-eth/useScaffoldWriteContract.ts](../packages/nextjs/hooks/scaffold-eth/useScaffoldWriteContract.ts)

Implementation note:

- The current vote path in `useRoundVote.ts` already builds the payload for `transferAndCall(...)`.
- Under `7702`, this contract call should remain conceptually valid because the transaction still executes as the user address.
- The first refactor should focus on how the transaction is sent, not on changing `RoundVotingEngine` or `CuryoReputation`.
- Add explicit capability checks before promising gasless MetaMask support in the UI.

### Phase 4: Keep Celo Fee Abstraction as Fallback

Do not remove the Celo-native fallback from the architecture.

Instead:

1. Add fee-currency support for direct wallet transactions where wallet support exists.
2. Use it as the non-thirdweb / unsupported-wallet fallback.

This is especially useful for:

- users who insist on staying with direct external wallets
- environments where MetaMask does not expose the required `sendCalls` capability
- environments where sponsorship is unavailable or intentionally disallowed

### Phase 5: Defer Contract-Side Sponsorship Work

Do **not** implement these in v1 unless Phase 1 proves they are required:

- storage-backed `ERC2771` base
- sponsor service package
- permit-backed sponsored vote / submit / register entrypoints
- full relayer policy engine

These should become a fallback project only if:

1. MetaMask sponsorship through `7702 / sendCalls` is unreliable on Celo
2. critical external-wallet flows cannot be covered by direct Celo fee abstraction
3. gasless external-wallet support is still considered product-critical

## What This Means for `docs/GAS_SPONSORSHIP_PLAN.md`

The current gas sponsorship plan should be treated as:

- a `fallback architecture document`
- not the default implementation plan

The new default should be:

- `thirdweb 7702`
- `Celo fee abstraction fallback`
- `relayer work only if validation forces it`

## Minimal v1 Scope

For launch, I would ship:

1. `thirdweb` as the main connect flow
2. in-app wallet with `EIP-7702` + `sponsorGas`
3. external-wallet capability detection
4. MetaMask validation on `celoSepolia`
5. direct `feeCurrency` fallback where possible
6. direct `CELO` fallback for everything else

I would **not** ship in v1:

1. custom relayer service
2. `EIP-2771` contract migration
3. permit-backed sponsored voting refactor
4. full sponsor policy engine outside thirdweb

## Open Questions

1. Is `thirdweb` acceptable as the primary wallet vendor, or must the app remain mostly wallet-vendor-neutral?
2. Do you want `in-app wallet` onboarding to be the default, or should `MetaMask` remain the first button users see?
3. If MetaMask `7702 / sendCalls` is inconsistent on Celo in practice, is `Celo fee abstraction + CELO fallback` acceptable, or do you still want a gasless fallback for those users?

## Revised Practical Recommendation

If implementation started today, I would do it in this order:

1. Build a tiny spike branch with thirdweb provider + in-app wallet on `celoSepolia`
2. Prove `profile update`, `vote`, and `claim` with `7702 sponsorGas`
3. Add MetaMask and inspect actual wallet capabilities before promising gasless support
4. Only after that decide whether Curyo needs any of the custom sponsorship work from the original gas plan

This is a stricter and better-supported version of the first plan.

## Sources

thirdweb:

- [Gas Sponsorship](https://portal.thirdweb.com/wallets/sponsor-gas)
- [Getting Started with Account Abstraction](https://portal.thirdweb.com/react/v5/account-abstraction/get-started)
- [Next-Gen Smart Accounts](https://portal.thirdweb.com/changelog/next-gen-smart-accounts)
- [Sponsored EIP-7702 Transactions on Celo](https://portal.thirdweb.com/changelog/sponsored-eip-7702-transactions-now-on-celo)
- [Relayers](https://portal.thirdweb.com/engine/v2/features/relayers)
- [Third Party Library Adapters](https://portal.thirdweb.com/wallets/adapters)
- [EIP-5792 `useSendCalls`](https://portal.thirdweb.com/references/typescript/latest/eip5792/useSendCalls)
- [EIP-5792 `sendCalls`](https://portal.thirdweb.com/references/typescript/v5/eip5792/sendCalls)
- [Improved EIP-5792 Support](https://portal.thirdweb.com/changelog/improved-eip-5792-support)
- [Gas Sponsorship Policies](https://portal.thirdweb.com/wallets/sponsorship-policies)

Celo:

- [Implementing Fee Abstraction in Wallets](https://docs.celo.org/tooling/overview/fee-abstraction)
- [Getting CELO for Gas Fees](https://docs.celo.org/home/gas-fees)
