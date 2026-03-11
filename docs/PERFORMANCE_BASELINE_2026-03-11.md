# Performance And Gas Baseline

Date: 2026-03-11

This note records the current pre-mainnet gas and frontend-performance baseline so regressions can be measured against a concrete reference instead of one-off local impressions.

## Contract Gas Budgets

Hot-path gas is now enforced by [GasBudget.t.sol](/Users/davidhawig/source/curyo-release/packages/foundry/test/GasBudget.t.sol). The suite measures the live call and fails if it exceeds the agreed ceiling.

| Path | Measured gas | Budget |
|------|--------------|--------|
| `submitContent` | `370,274` | `400,000` |
| `commitVote` | `655,680` | `800,000` |
| `revealVoteByCommitKey` | `149,853` | `320,000` |
| `settleRound` | `308,056` | `475,000` |
| `processUnrevealedVotes` | `123,376` | `250,000` |
| `cancelExpiredRound` | `32,198` | `60,000` |
| `claimReward` | `72,991` | `190,000` |
| `claimParticipationReward` | `123,419` | `240,000` |
| `claimFrontendFee` | `138,206` | `250,000` |

Current conclusion: no mainnet-blocking gas rewrite is indicated for the core round lifecycle. The main requirement is to keep these budgets enforced in CI and tighten them only after repeated stable runs. The existing unit-test workflow already runs `forge test`, so this suite is part of the normal contract gate without adding a separate job.

## Frontend Polling Pass

The highest-noise Discover/Vote/Governance/Profile pollers now pause when the tab is hidden by using [usePageVisibility.ts](/Users/davidhawig/source/curyo-release/packages/nextjs/hooks/usePageVisibility.ts).

Updated hooks:

- [useContentFeedQuery.ts](/Users/davidhawig/source/curyo-release/packages/nextjs/hooks/useContentFeedQuery.ts)
- [useVoteHistoryQuery.ts](/Users/davidhawig/source/curyo-release/packages/nextjs/hooks/useVoteHistoryQuery.ts)
- [useRecentUserVotes.ts](/Users/davidhawig/source/curyo-release/packages/nextjs/hooks/useRecentUserVotes.ts)
- [useDiscoverSignals.ts](/Users/davidhawig/source/curyo-release/packages/nextjs/hooks/useDiscoverSignals.ts)
- [useGovernance.ts](/Users/davidhawig/source/curyo-release/packages/nextjs/hooks/useGovernance.ts)
- [PublicProfileView.tsx](/Users/davidhawig/source/curyo-release/packages/nextjs/components/profile/PublicProfileView.tsx)
- [useParticipationRate.ts](/Users/davidhawig/source/curyo-release/packages/nextjs/hooks/useParticipationRate.ts)
- [useVoterAccuracy.ts](/Users/davidhawig/source/curyo-release/packages/nextjs/hooks/useVoterAccuracy.ts)

Current conclusion: the main user-facing polling surfaces now stop their periodic Ponder/RPC refresh loop when backgrounded. Any further extension should be based on measured idle-traffic hotspots rather than a blanket repo-wide sweep.

## Frontend Bundle Pass

A production analyzer build was run with production-safe env overrides so the bundle reports could be emitted without weakening the existing environment validation.

Generated reports:

- `packages/nextjs/.next/analyze/client.html`
- `packages/nextjs/.next/analyze/nodejs.html`
- `packages/nextjs/.next/analyze/edge.html`

Production build output with production-safe env:

| Route | Route size | First Load JS |
|------|------------|---------------|
| `/vote` | `63.4 KB` | `646 KB` |
| `/governance` | `154 KB` | `708 KB` |
| `/profiles/[address]` | `8.89 KB` | `410 KB` |
| `/submit` | `7.69 KB` | `595 KB` |
| `/settings/notifications` | `4.8 KB` | `384 KB` |
| `/` | `3.32 KB` | `404 KB` |

Shared first-load baseline:

- shared by all routes: `105 KB`

Largest emitted shared client chunks observed in `.next/static/chunks`:

- `main-app.js`: `7.3 MB`
- `reown_appkit_dist_esm_exports_core_js`: `9.4 MB`
- `base-org_account_dist_index_js`: `9.9 MB`
- `safe-apps-provider_dist_index_js`: `3.9 MB`
- `walletconnect_ethereum-provider_dist_index_es_js`: `2.1 MB`
- `metamask-sdk_js`: `1.9 MB`

These are emitted chunk sizes, not transfer sizes. Use the analyzer HTML for parsed/gzip detail when deciding what to split or lazy-load.

## Build-Time Findings

The production build now succeeds with production-safe env overrides, but the pass surfaced useful issues along the way:

1. Production builds fail fast if `NEXT_PUBLIC_PONDER_URL` still points to localhost.
2. Production builds fail fast if `NEXT_PUBLIC_TARGET_NETWORKS` is missing.
3. Next 15 production builds in this repo needed a minimal compatibility [pages/_document.tsx](/Users/davidhawig/source/curyo-release/packages/nextjs/pages/_document.tsx) entry and nullable `useSearchParams()` / `usePathname()` guards in app-router client code.

Current conclusion: the env validation is doing the right thing and should stay strict. The compatibility fixes are now in place, `yarn workspace @curyo/nextjs build` succeeds when the required production env is provided, and the same production-build path is now exercised in [lint.yaml](/Users/davidhawig/source/curyo-release/.github/workflows/lint.yaml).

## Recommended Next Pass

1. Review the wallet/provider shared chunks in the analyzer and decide whether connection tooling can be lazy-loaded off the critical Discover path.
2. If bundle size becomes a release concern, upload the analyzer HTML as a CI artifact on failure or on a scheduled job so the shared-wallet chunks can be tracked over time.
3. Extend visibility-aware polling only when profiling shows a remaining idle-traffic hotspot.
