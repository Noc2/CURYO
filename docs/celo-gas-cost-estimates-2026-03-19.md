# Curyo Celo Gas Cost Estimates

Verified on March 19, 2026. Updated later the same day after the March 19 gas-optimization pass.

This document estimates the gas cost of the most important Curyo transactions on Celo and converts those costs into `CELO` and `USD`.

The most important result is that the optimized vote path is still cheap in absolute dollar terms on Celo, and it is materially cheaper than the earlier March 19 baseline. The UX friction is still more about signatures and transaction count than raw dollar cost.

## Executive summary

- A normal Curyo vote is now about `489k` gas without a frontend code and about `506k` gas with an approved frontend code.
- At the pricing snapshot used here, that is about `$0.00143` to `$0.00148` per vote.
- Versus the earlier March 19 baseline, vote gas is down about `27.9%` without frontend attribution and `29.2%` with frontend attribution.
- The current content submit flow is still two transactions today, but it fell from `534,006` gas to `466,689` gas total for `approve + submitContent`.
- Keeper operations also improved materially. Reveal fell from `117,593` gas to `54,108`, and settle fell from `308,359` gas to `248,898`.
- Reward-claim numbers remain cheap, but they were not re-benchmarked in this update.

## Pricing assumptions

USD values below use a dated snapshot, not a permanent truth:

- `CELO price`: `$0.117293`
- `Gas price`: `25 gwei`

Formula:

- `CELO cost = gasUsed * 25 gwei`
- `USD cost = CELO cost * $0.117293`

Equivalent shortcut at this snapshot:

- `1 gas ~= 0.000000025 CELO`
- `1 gas ~= $0.000000002932325`
- `50,000 gas ~= 0.00125 CELO ~= $0.00014662`

## Method

The gas figures come from repo-local Foundry benchmarks in:

- [`packages/foundry/test/GasEstimatesReport.t.sol`](../packages/foundry/test/GasEstimatesReport.t.sol)

Command used:

```bash
cd packages/foundry
forge test --match-path test/GasEstimatesReport.t.sol -vv
```

Notes:

- These are benchmarked against the current Curyo contracts and current frontend transaction paths.
- Gas was measured around the target call only, excluding setup work.
- The vote benchmark uses the real `transferAndCall(...)` path that the frontend uses today.
- The submit benchmark reflects the current two-transaction UI flow: `approve` then `submitContent`.
- The `before` numbers in the comparison section are the pre-optimization March 19 baseline from the earlier version of this document.
- The `after` numbers are the post-optimization measurements from the current repo state after implementing storage packing and vote-path write reductions.
- The updated numbers were cross-checked against [`packages/foundry/test/GasBudget.t.sol`](../packages/foundry/test/GasBudget.t.sol).
- Dollar figures cover gas only. They do **not** include the cREP stake itself.
- The benchmark vote stake was `5 cREP`, but gas cost is driven mainly by storage writes and control flow, not by whether the stake is `1`, `5`, or `100` cREP.
- Transactions that are not shown in the before/after table below were not re-benchmarked in this update and should be treated as the earlier March 19 snapshot.

## Before vs after optimization pass

These rows compare the original March 19 baseline with the optimized contracts now in the repo, using the same `CELO` and gas-price assumptions.

| Transaction | Before gas | After gas | Delta gas | Change | Before USD | After USD | Delta USD |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Submit approval | `27,345` | `27,345` | `0` | `0.00%` | `$0.00008018` | `$0.00008018` | `$0.00000000` |
| Submit content | `506,661` | `439,344` | `-67,317` | `-13.29%` | `$0.00148569` | `$0.00128830` | `-$0.00019740` |
| Submit content total | `534,006` | `466,689` | `-67,317` | `-12.61%` | `$0.00156588` | `$0.00136848` | `-$0.00019740` |
| Vote | `677,802` | `488,624` | `-189,178` | `-27.91%` | `$0.00198754` | `$0.00143280` | `-$0.00055473` |
| Vote with approved frontend code | `715,068` | `506,014` | `-209,054` | `-29.24%` | `$0.00209681` | `$0.00148380` | `-$0.00061301` |
| Reveal vote | `117,593` | `54,108` | `-63,485` | `-53.99%` | `$0.00034482` | `$0.00015866` | `-$0.00018616` |
| Settle round | `308,359` | `248,898` | `-59,461` | `-19.28%` | `$0.00090421` | `$0.00072985` | `-$0.00017436` |

## Current user-facing transactions

These are the post-optimization estimates for the current repo state. Rows that were not rerun in this update are kept from the earlier March 19 benchmark snapshot.

| Transaction | Current path | Measured gas | Cost in CELO | Cost in USD | Notes |
| --- | --- | ---: | ---: | ---: | --- |
| Voter ID mint | `VoterIdNFT.mint(...)` | `128,282` | `0.00320705` | `$0.00037616` | Earlier March 19 snapshot; not rerun in this update |
| Set delegate | `VoterIdNFT.setDelegate(...)` | `52,250` | `0.00130625` | `$0.00015321` | Earlier March 19 snapshot; not rerun in this update |
| Submit approval | `cREP.approve(ContentRegistry, 10 cREP)` | `27,345` | `0.00068362` | `$0.00008018` | First half of current submit UX |
| Submit content | `ContentRegistry.submitContent(...)` | `439,344` | `0.01098360` | `$0.00128830` | Second half of current submit UX after optimization |
| Submit content total | `approve + submitContent` | `466,689` | `0.01166722` | `$0.00136848` | Best estimate for the current frontend submit flow |
| Vote | `cREP.transferAndCall(...)` | `488,624` | `0.01221560` | `$0.00143280` | Current frontend vote flow without frontend fee attribution |
| Vote with approved frontend code | `cREP.transferAndCall(...)` | `506,014` | `0.01265035` | `$0.00148380` | Better estimate for production if Curyo routes votes through an approved frontend |
| Claim voter reward | `RoundRewardDistributor.claimReward(...)` | `68,614` | `0.00171535` | `$0.00020120` | Earlier March 19 snapshot; not rerun in this update |
| Claim submitter reward | `RoundRewardDistributor.claimSubmitterReward(...)` | `63,896` | `0.00159740` | `$0.00018736` | Earlier March 19 snapshot; not rerun in this update |

## Keeper and protocol operations

These are not typical end-user actions, but they matter for operating cost.

| Transaction | Measured gas | Cost in CELO | Cost in USD | Notes |
| --- | ---: | ---: | ---: | --- |
| Reveal vote | `54,108` | `0.00135270` | `$0.00015866` | `revealVoteByCommitKey(...)` after optimization |
| Settle round | `248,898` | `0.00622245` | `$0.00072985` | `settleRound(...)` after optimization |

## Frontend operator transactions

| Transaction | Measured gas | Cost in CELO | Cost in USD | Notes |
| --- | ---: | ---: | ---: | --- |
| Frontend stake approval | `27,288` | `0.00068220` | `$0.00008002` | `approve` before register |
| Frontend register | `197,939` | `0.00494847` | `$0.00058042` | `FrontendRegistry.register()` only |
| Frontend register total | `225,227` | `0.00563067` | `$0.00066044` | `approve + register` |
| Frontend claim fees | `18,242` | `0.00045605` | `$0.00005349` | `FrontendRegistry.claimFees()` |

## What matters most for voting

### 1. Vote is the heaviest common user action

Using the optimized frontend path:

- vote without frontend code: `488,624` gas
- vote with approved frontend code: `506,014` gas

At the snapshot used here:

- vote without frontend code: about `$0.00143`
- vote with approved frontend code: about `$0.00148`

Voting is still the heaviest recurring user action, but it is now much closer to the current submit flow than it was before optimization.

### 2. The optimization pass materially reduced the heaviest paths

Compared with the earlier March 19 baseline:

- vote without frontend attribution fell by `189,178` gas, about `27.9%`
- vote with approved frontend attribution fell by `209,054` gas, about `29.2%`
- submit flow fell by `67,317` gas, about `12.6%`
- reveal fell by `63,485` gas, about `54.0%`
- settle fell by `59,461` gas, about `19.3%`

These savings are small in dollar terms on Celo, but they are real and worth taking because voting and reveal happen frequently.

### 3. Frontend attribution still adds some cost, but less than before

Adding an approved frontend code increased the vote benchmark by:

- `17,390` gas
- `0.00043475 CELO`
- about `$0.00005099`

That is real, but still tiny in dollar terms.

### 4. The bigger UX issue is transaction shape, not chain fee

For users, the most noticeable friction is likely:

- extra wallet confirmations
- waiting for the sequencer between `approve` and `submitContent`
- the need to keep a little CELO available

Not the raw gas charge itself.

## Celo fee-currency note

Curyo already documents that using non-CELO fee currencies on Celo costs roughly `50k` extra gas per transaction:

- [`docs/GAS_SPONSORSHIP_PLAN.md`](./GAS_SPONSORSHIP_PLAN.md)

At the pricing snapshot used here, that overhead is about:

- `0.00125 CELO`
- `$0.00014662`

Examples with the optimized measurements:

- vote without frontend code plus fee-currency overhead: about `538,624` gas, `0.01346560 CELO`, `$0.00157942`
- vote with approved frontend code plus fee-currency overhead: about `556,014` gas, `0.01390035 CELO`, `$0.00163041`
- current submit flow if both `approve` and `submitContent` pay via fee currency: about `566,689` gas, `0.01416722 CELO`, `$0.00166172`

So fee-currency support does increase gas, but the dollar impact is still small.

## Conclusions

- Gas cost is not a launch blocker for Curyo on Celo. Even the optimized vote path is still around fifteen-hundredths of a cent.
- The optimization pass produced meaningful savings on the hottest paths while preserving the current one-transaction voting flow.
- The vote path is still the most important cost to watch because it is both frequent and the heaviest recurring user action.
- The current submit flow should still be optimized mainly to remove the second transaction, not because the gas bill is large.
- Reward claims and frontend fee claims remain very cheap, so sponsoring them would still be inexpensive if Curyo chooses to.
- If Curyo uses approved frontend codes in production, the realistic current vote estimate is now closer to `506k` gas than `715k`.

## Sources

- [`packages/foundry/test/GasEstimatesReport.t.sol`](../packages/foundry/test/GasEstimatesReport.t.sol)
- [`packages/nextjs/hooks/useRoundVote.ts`](../packages/nextjs/hooks/useRoundVote.ts)
- [`packages/nextjs/app/submit/page.tsx`](../packages/nextjs/app/submit/page.tsx)
- [`docs/GAS_SPONSORSHIP_PLAN.md`](./GAS_SPONSORSHIP_PLAN.md)
- [Celo Docs: ERC-20 transaction fees](https://docs.celo.org/what-is-celo/about-celo-l1/protocol/transaction/erc20-transaction-fees)
- [CoinMarketCap: CELO price](https://coinmarketcap.com/currencies/celo/)
- [CeloScan mainnet transaction example with 25 gwei gas price](https://celoscan.io/tx/0x26843bb0a3f22b4481a9d6c2cc927f88a531afde3738c98600ee8f525fad73f4)
