# thirdweb Implementation Plan

Checked on: March 19, 2026

Related decision doc:

- [THIRDWEB_CELO_PLAN.md](./THIRDWEB_CELO_PLAN.md)

## Scope

Implement a `thirdweb-first` wallet and transaction layer for Curyo on `Celo` and `Celo Sepolia`.

Required behavior:

1. Use `thirdweb` as the primary wallet UX.
2. Use `EIP-7702` with `sponsorGas` as the primary transaction path.
3. Use `Celo fee abstraction` as the fallback when sponsorship is unavailable.
4. Fall back to normal `CELO` transactions when neither sponsorship nor fee-currency support is available.

Out of scope:

1. custom relayer service
2. custom sponsor policy engine
3. `EIP-2771` contract migration
4. permit-backed sponsored entrypoints
5. any custom sponsorship infrastructure outside thirdweb

## Repo Fit

Current state:

- wallet connection is centered on `RainbowKit` and `wagmi`
- app providers live in [ScaffoldEthAppWithProviders.tsx](../packages/nextjs/components/ScaffoldEthAppWithProviders.tsx)
- connect UI lives in [RainbowKitCustomConnectButton/index.tsx](../packages/nextjs/components/scaffold-eth/RainbowKitCustomConnectButton/index.tsx)
- wallet connectors live in [wagmiConnectors.tsx](../packages/nextjs/services/web3/wagmiConnectors.tsx)
- general write flow lives in [useScaffoldWriteContract.ts](../packages/nextjs/hooks/scaffold-eth/useScaffoldWriteContract.ts)
- vote commit flow lives in [useRoundVote.ts](../packages/nextjs/hooks/useRoundVote.ts)
- supported production chains are already constrained to `Celo` / `Celo Sepolia` in [public.ts](../packages/nextjs/utils/env/public.ts)
- `Self.xyz` is already Celo-only in [SelfVerifyButton.tsx](../packages/nextjs/components/governance/SelfVerifyButton.tsx)

Important consequence:

- We do **not** need a protocol redesign first.
- The first implementation work is mostly in `provider`, `connect`, and `transaction execution`.

## Architecture

### Primary path

`thirdweb in-app wallet -> EIP-7702 -> sponsorGas`

This should be the default onboarding and transaction path.

### External-wallet path

`thirdweb external wallet -> EIP-7702 / sendCalls when supported`

This should be treated as a best-effort path, not a guaranteed product promise until validated.

### Fallback path

1. direct wallet transaction with Celo `feeCurrency`
2. direct wallet transaction with `CELO`

## Packages and Config

### Add dependencies

Add to [packages/nextjs/package.json](../packages/nextjs/package.json):

- `thirdweb`
- `@thirdweb-dev/wagmi-adapter`

Reason:

- `thirdweb` provides `ThirdwebProvider`, `ConnectButton`, in-app wallets, and sponsored `7702` execution.
- the adapter lets Curyo keep much of the existing `wagmi` read stack while replacing the wallet layer.

### Add env vars

Add public env support for:

- `NEXT_PUBLIC_THIRDWEB_CLIENT_ID`

Optional later:

- `NEXT_PUBLIC_THIRDWEB_CHAIN_ENV` if you want explicit environment switching logic

Files:

- [public.ts](../packages/nextjs/utils/env/public.ts)

## Implementation Phases

### Phase 1: Provider Spike

Goal:

- Add thirdweb to the app without removing wagmi yet.

Tasks:

1. Create a new client module:
   - `packages/nextjs/services/thirdweb/client.ts`
2. Initialize `createThirdwebClient({ clientId })`
3. Wrap the app with `ThirdwebProvider`
4. Keep `WagmiProvider`, `QueryClientProvider`, and the rest of the app tree intact

Primary file:

- [ScaffoldEthAppWithProviders.tsx](../packages/nextjs/components/ScaffoldEthAppWithProviders.tsx)

Target outcome:

- thirdweb is available everywhere in the app
- existing wagmi reads still work

### Phase 2: Wallet UX Replacement

Goal:

- Replace RainbowKit as the primary wallet surface

Tasks:

1. Build a new wallet module:
   - `packages/nextjs/components/wallet/ThirdwebConnectButton.tsx`
2. Start with:
   - `inAppWallet({ executionMode: { mode: "EIP7702", sponsorGas: true } })`
   - external MetaMask option
   - WalletConnect-compatible fallback if needed
3. Replace usages of `RainbowKitCustomConnectButton`
4. Keep the visible button text and general UI style aligned with the current brand

Files to update:

- [RainbowKitCustomConnectButton/index.tsx](../packages/nextjs/components/scaffold-eth/RainbowKitCustomConnectButton/index.tsx)
- [Header.tsx](../packages/nextjs/components/Header.tsx)
- [governance/page.tsx](../packages/nextjs/app/governance/page.tsx)
- [settings/page.tsx](../packages/nextjs/app/settings/page.tsx)
- [submit/page.tsx](../packages/nextjs/app/submit/page.tsx)
- [VotingQuestionCard.tsx](../packages/nextjs/components/shared/VotingQuestionCard.tsx)
- [ManualRevealPage.tsx](../packages/nextjs/components/vote/ManualRevealPage.tsx)

Migration rule:

- Do not remove RainbowKit internals until the new connect flow reaches feature parity.

### Phase 3: Wallet State Bridge

Goal:

- Make the rest of the app consume thirdweb-backed wallet state cleanly

Tasks:

1. Create a small wallet state bridge hook:
   - `useCuryoWallet`
2. Expose:
   - `address`
   - `chainId`
   - `isConnected`
   - `isThirdwebInApp`
   - `supportsSponsoredCalls`
   - `supportsFeeCurrencyFallback`
3. Use this hook to gradually replace direct assumptions about RainbowKit-only state

Files likely affected:

- [useTargetNetwork.ts](../packages/nextjs/hooks/scaffold-eth/useTargetNetwork.ts)
- [useScaffoldWriteContract.ts](../packages/nextjs/hooks/scaffold-eth/useScaffoldWriteContract.ts)
- wallet-aware UI surfaces in `Header`, `governance`, `settings`, and `submit`

### Phase 4: Capability Detection

Goal:

- Never promise sponsorship when the current wallet/session cannot actually do it

Tasks:

1. Create:
   - `packages/nextjs/hooks/useWalletExecutionCapabilities.ts`
2. Detect:
   - thirdweb in-app 7702 capability
   - external-wallet `sendCalls` capability
   - whether the chain is `Celo` / `Celo Sepolia`
3. Return a ranked execution mode:
   - `sponsored_7702`
   - `external_send_calls`
   - `fee_currency`
   - `direct_celo`

Product rule:

- If the wallet cannot do sponsored execution, the UI should degrade quietly to fallback mode.
- Do not show “gasless” copy unless the active capability actually supports it.

### Phase 5: Transaction Executor

Goal:

- Centralize transaction sending so all write flows use the same decision logic

Tasks:

1. Create:
   - `packages/nextjs/lib/transactions/executeCuryoWrite.ts`
   or
   - `packages/nextjs/hooks/useCuryoTransactionExecutor.ts`
2. Decision order:
   - sponsored `7702`
   - external-wallet `sendCalls` when available
   - direct `feeCurrency`
   - direct `CELO`
3. Add common error normalization and capability fallback handling

This is the key implementation step because it keeps the rest of the app from branching wallet logic everywhere.

### Phase 6: Migrate High-Value Write Flows

Migrate in this order:

1. generic contract writes in [useScaffoldWriteContract.ts](../packages/nextjs/hooks/scaffold-eth/useScaffoldWriteContract.ts)
2. profile writes
3. reward claims
4. vote commit in [useRoundVote.ts](../packages/nextjs/hooks/useRoundVote.ts)
5. submission flow
6. frontend registration / top-up

Reason:

- profile and claim flows are easier validation targets
- vote commit is the most important path, but it is also the most critical to preserve correctly

### Phase 7: Celo Fee Currency Fallback

Goal:

- Preserve a strong fallback path without custom sponsorship

Tasks:

1. Add a small Celo fee-currency config module:
   - `packages/nextjs/lib/celo/feeCurrencies.ts`
2. Thread optional `feeCurrency` support into the fallback execution path
3. Use direct `CELO` as the last fallback

Important rule:

- This is fallback-only, not the primary transaction model.

### Phase 8: Cleanup

Only after parity is proven:

1. remove RainbowKit provider usage
2. remove RainbowKit connector config
3. remove old custom connect-button implementation
4. simplify docs and onboarding copy around wallet setup

Files likely cleaned up:

- [ScaffoldEthAppWithProviders.tsx](../packages/nextjs/components/ScaffoldEthAppWithProviders.tsx)
- [wagmiConnectors.tsx](../packages/nextjs/services/web3/wagmiConnectors.tsx)
- [RainbowKitCustomConnectButton/index.tsx](../packages/nextjs/components/scaffold-eth/RainbowKitCustomConnectButton/index.tsx)
- [app/layout.tsx](../packages/nextjs/app/layout.tsx)

## Validation Plan

Run all validation first on `celoSepolia`.

### Wallet matrix

1. thirdweb in-app wallet
2. MetaMask
3. one WalletConnect-style external wallet if supported

### Required flows

1. connect / reconnect
2. chain switching
3. Self.xyz verification
4. create profile
5. edit profile
6. claim rewards
7. vote with `transferAndCall`
8. submit content
9. frontend registration and top-up

### Acceptance criteria

1. the connected address stays the same across UI and onchain identity surfaces
2. in-app wallet uses sponsored `7702`
3. unsupported external-wallet environments fall back cleanly
4. vote commit still succeeds without contract changes
5. Self.xyz still verifies the correct address

## Non-Goals

Do not implement:

1. `ERC-2771`
2. `Engine relayers`
3. `permit` entrypoints
4. sponsor database / quota service
5. custom paymaster or bundler logic

If the thirdweb path fails to cover enough of Curyo, that should be treated as a separate architecture decision later, not folded into this implementation.

## Suggested Milestones

### Milestone 1

- thirdweb provider added
- in-app wallet connect works
- no write flows migrated yet

### Milestone 2

- primary connect UX moved to thirdweb
- wallet state bridge in place
- sponsorship capability detection working

### Milestone 3

- generic writes and profile writes migrated
- claims migrated
- fallback execution path working

### Milestone 4

- voting and submission flows migrated
- `celoSepolia` validation matrix completed

### Milestone 5

- RainbowKit removed
- onboarding copy updated
- docs updated

## Recommended First PR

The first PR should stay small.

Include only:

1. add `thirdweb` dependencies
2. add `ThirdwebProvider`
3. add thirdweb client config
4. add a temporary thirdweb connect button behind a feature flag
5. keep RainbowKit fully intact

This gives Curyo a safe spike path without committing the whole app to the migration in one shot.

## Sources

- [Gas Sponsorship](https://portal.thirdweb.com/wallets/sponsor-gas)
- [In-App Wallets](https://portal.thirdweb.com/react/v5/in-app-wallet/get-started)
- [Build your own UI](https://portal.thirdweb.com/react/v5/in-app-wallet/build-your-own-ui)
- [Account Abstraction](https://portal.thirdweb.com/react/v5/account-abstraction/get-started)
- [Adapters](https://portal.thirdweb.com/react/v5/adapters)
- [Next-Gen Smart Accounts](https://portal.thirdweb.com/changelog/next-gen-smart-accounts)
- [Sponsored EIP-7702 on Celo](https://portal.thirdweb.com/changelog/sponsored-eip-7702-transactions-now-on-celo)
- [Expanding EIP-7702 Chain Support](https://portal.thirdweb.com/changelog/expanding-eip-7702-chain-support)
- [EIP-5792 `useSendCalls`](https://portal.thirdweb.com/references/typescript/latest/eip5792/useSendCalls)
- [EIP-5792 `sendCalls`](https://portal.thirdweb.com/references/typescript/v5/eip5792/sendCalls)
- [Relayers](https://portal.thirdweb.com/engine/v2/features/relayers)
