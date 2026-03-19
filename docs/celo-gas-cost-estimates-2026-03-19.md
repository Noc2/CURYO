# Curyo Celo Gas Cost Estimates

Verified on March 19, 2026.

This document estimates the gas cost of the most important Curyo transactions on Celo and converts those costs into `CELO` and `USD`.

The most important result is that the current vote path is cheap in absolute dollar terms on Celo, but it is still the heaviest common user action. The UX friction is more about extra signatures and transaction count than raw dollar cost.

## Executive summary

- A normal Curyo vote is about `678k` gas without a frontend code and about `715k` gas with an approved frontend code.
- At the pricing snapshot used here, that is about `$0.00199` to `$0.00210` per vote.
- The current content submit flow is cheaper in gas than a vote, but it is still two transactions today: `approve` plus `submitContent`.
- Reward claims are cheap: about `$0.00019` to `$0.00020`.
- Keeper operations are also cheap in dollar terms. Reveal is about `$0.00034`, and settle is about `$0.00090`.

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
- Dollar figures cover gas only. They do **not** include the cREP stake itself.
- The benchmark vote stake was `5 cREP`, but gas cost is driven mainly by storage writes and control flow, not by whether the stake is `1`, `5`, or `100` cREP.

## Current user-facing transactions

| Transaction | Current path | Measured gas | Cost in CELO | Cost in USD | Notes |
| --- | --- | ---: | ---: | ---: | --- |
| Voter ID mint | `VoterIdNFT.mint(...)` | `128,282` | `0.00320705` | `$0.00037616` | Minted by the authorized verification/minter flow |
| Set delegate | `VoterIdNFT.setDelegate(...)` | `52,250` | `0.00130625` | `$0.00015321` | Lets a hot wallet act for a Voter ID holder |
| Submit approval | `cREP.approve(ContentRegistry, 10 cREP)` | `27,345` | `0.00068362` | `$0.00008018` | First half of current submit UX |
| Submit content | `ContentRegistry.submitContent(...)` | `506,661` | `0.01266652` | `$0.00148569` | Second half of current submit UX |
| Submit content total | `approve + submitContent` | `534,006` | `0.01335015` | `$0.00156588` | Best estimate for the current frontend submit flow |
| Vote | `cREP.transferAndCall(...)` | `677,802` | `0.01694505` | `$0.00198754` | Current frontend vote flow without frontend fee attribution |
| Vote with approved frontend code | `cREP.transferAndCall(...)` | `715,068` | `0.01787670` | `$0.00209681` | Better estimate for production if Curyo routes votes through an approved frontend |
| Claim voter reward | `RoundRewardDistributor.claimReward(...)` | `68,614` | `0.00171535` | `$0.00020120` | Winner payout or loser rebate claim |
| Claim submitter reward | `RoundRewardDistributor.claimSubmitterReward(...)` | `63,896` | `0.00159740` | `$0.00018736` | Submitter’s 10% share |

## Keeper and protocol operations

These are not typical end-user actions, but they matter for operating cost.

| Transaction | Measured gas | Cost in CELO | Cost in USD | Notes |
| --- | ---: | ---: | ---: | --- |
| Reveal vote | `117,593` | `0.00293983` | `$0.00034482` | `revealVoteByCommitKey(...)` |
| Settle round | `308,359` | `0.00770897` | `$0.00090421` | `settleRound(...)` |

## Frontend operator transactions

| Transaction | Measured gas | Cost in CELO | Cost in USD | Notes |
| --- | ---: | ---: | ---: | --- |
| Frontend stake approval | `27,288` | `0.00068220` | `$0.00008002` | `approve` before register |
| Frontend register | `197,939` | `0.00494847` | `$0.00058042` | `FrontendRegistry.register()` only |
| Frontend register total | `225,227` | `0.00563067` | `$0.00066044` | `approve + register` |
| Frontend claim fees | `18,242` | `0.00045605` | `$0.00005349` | `FrontendRegistry.claimFees()` |

## What matters most for voting

### 1. Vote is the heaviest common user action

Using the current frontend path:

- vote without frontend code: `677,802` gas
- vote with approved frontend code: `715,068` gas

At the snapshot used here:

- vote without frontend code: about `$0.00199`
- vote with approved frontend code: about `$0.00210`

That makes voting slightly more expensive than the full current submit flow, even though submit still requires two separate transactions.

### 2. Frontend attribution adds some cost, but not much

Adding an approved frontend code increased the vote benchmark by:

- `37,266` gas
- `0.00093165 CELO`
- about `$0.00010928`

That is real, but still tiny in dollar terms.

### 3. The bigger UX issue is transaction shape, not chain fee

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

Examples:

- vote without frontend code plus fee-currency overhead: about `727,802` gas, `0.01819505 CELO`, `$0.00213415`
- vote with approved frontend code plus fee-currency overhead: about `765,068` gas, `0.01912670 CELO`, `$0.00224343`
- current submit flow if both `approve` and `submitContent` pay via fee currency: about `634,006` gas, `0.01585015 CELO`, `$0.00185911`

So fee-currency support does increase gas, but the dollar impact is still small.

## Conclusions

- Gas cost is not a launch blocker for Curyo on Celo. Even the benchmarked vote path is around two-tenths of a cent.
- The vote path is the most important cost to watch because it is both frequent and the heaviest recurring user action.
- The current submit flow should be optimized mainly to remove the second transaction, not because the gas bill is large.
- Reward claims and frontend fee claims are very cheap, so sponsoring them would be inexpensive if Curyo chooses to.
- If Curyo uses approved frontend codes in production, the realistic vote estimate is closer to `715k` gas than `678k`.

## Sources

- [`packages/foundry/test/GasEstimatesReport.t.sol`](../packages/foundry/test/GasEstimatesReport.t.sol)
- [`packages/nextjs/hooks/useRoundVote.ts`](../packages/nextjs/hooks/useRoundVote.ts)
- [`packages/nextjs/app/submit/page.tsx`](../packages/nextjs/app/submit/page.tsx)
- [`docs/GAS_SPONSORSHIP_PLAN.md`](./GAS_SPONSORSHIP_PLAN.md)
- [Celo Docs: ERC-20 transaction fees](https://docs.celo.org/what-is-celo/about-celo-l1/protocol/transaction/erc20-transaction-fees)
- [CoinMarketCap: CELO price](https://coinmarketcap.com/currencies/celo/)
- [CeloScan mainnet transaction example with 25 gwei gas price](https://celoscan.io/tx/0x26843bb0a3f22b4481a9d6c2cc927f88a531afde3738c98600ee8f525fad73f4)
