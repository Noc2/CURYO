# Curyo Gas Optimization Research

Verified on March 19, 2026.

This document reviews whether Curyo's smart contracts can reduce gas costs further, with special focus on the vote path on Celo.

Bottom line: yes, there is still room to reduce gas, especially in `RoundVotingEngine._commitVote(...)`, but the remaining wins are mostly contract-design wins rather than compiler-flag wins. The strongest near-term opportunities are removing redundant vote-path state writes. The biggest submit-path wins require product tradeoffs around URL canonicalization and metadata logging.

This document mixes:

- measured facts from the current repo-local gas benchmarks
- code-level inferences from the current contracts
- official Solidity and OpenZeppelin guidance where compiler or upgradeability behavior matters

## Executive summary

- The main recurring user cost is still voting: about `677,802` gas without frontend attribution and `715,068` gas with an approved frontend.
- The compiler-level low-hanging fruit is already mostly taken. The repo already uses `via_ir = true`, `optimizer = true`, `optimizer_runs = 100`, `evm_version = "cancun"`, custom errors, and `ReentrancyGuardTransient`.
- The best remaining vote optimizations are likely in redundant storage writes and duplicated bookkeeping:
  - `hasCommitted`
  - `commitHashByKey`
  - `contentCommitCount`
  - Voter ID per-round stake tracking
- The best remaining submit optimizations are likely:
  - moving more canonicalization off-chain
  - reducing the `ContentSubmitted` event payload
- A realistic near-term goal is to shave tens of thousands of gas from votes without changing the product model. Larger savings are possible, but they require meaningful product or upgradeability tradeoffs.

## Current hotspots

Measured from the current repo:

- Vote via `transferAndCall(...)`: `677,802` gas
- Vote with approved frontend attribution: `715,068` gas
- Submit flow total: `534,006` gas
- `submitContent(...)` itself: `506,661` gas
- Reveal: `117,593` gas
- Settle: `308,359` gas

Supporting local signals:

- `forge test --match-contract GasBudgetTest` passes on the current branch.
- `forge test --match-contract GasBudgetTest --gas-report` still shows the same relative hotspots:
  - `ContentRegistry.submitContent`: avg `424,735`, median `495,680`, max `506,174`
  - `SubmissionCanonicalizer.resolveCategoryAndSubmissionKey`: avg `55,798`, median `64,386`, max `72,810`
  - `ContentRegistry.updateActivity`: avg `2,695`
  - `RoundVotingEngine.revealVoteByCommitKey`: avg `129,353`
  - `RoundVotingEngine.settleRound`: avg `293,015`

The key takeaway is that vote and submit are still the places where extra engineering effort has the best payoff.

## What Is Already Optimized

Several standard gas levers are already in place:

- `packages/foundry/foundry.toml` already enables `via_ir`, the optimizer, and `cancun`.
- The contracts already use custom errors in many hot paths.
- The upgradeable contracts already use `ReentrancyGuardTransient`, which OpenZeppelin documents as the transient-storage variant of `ReentrancyGuard`.
- `ContentRegistry` already avoids storing full user metadata on-chain in state. It stores `contentHash` and emits metadata in events instead.
- The frontend vote flow already uses a one-transaction `transferAndCall(...)` path instead of `approve + commitVote`.

Because of that, further savings probably will not come from generic "turn on optimizer" advice. They will come from removing state writes, external calls, or log bytes.

## Prioritized Opportunities

### 1. Remove `hasCommitted` and use `voterCommitHash != 0`

Current behavior in `RoundVotingEngine`:

- commit-time duplicate protection checks `hasCommitted[contentId][roundId][voter]`
- the same commit also writes `voterCommitHash[contentId][roundId][voter] = commitHash`

That means the vote path stores two separate "this voter already committed in this round" signals.

Why it likely helps:

- duplicate-vote tracking can be consolidated onto state that is already persisted
- one dedicated mapping write disappears
- the vote path is the hottest recurring user action

Expected impact:

- medium
- likely a meaningful per-vote savings in the "tens of thousands of gas across several low-risk changes" bucket

Risk and caveat:

- if this change uses `bytes32(0)` as the sentinel for "not committed", the code should explicitly reject a zero `commitHash`
- that is a very small semantic change, but it keeps the sentinel rule explicit instead of implicit

Assessment:

- high-confidence candidate
- one of the best first experiments

### 2. Remove `commitHashByKey` and recover the hash at reveal time

Current behavior:

- commit writes `commitHashByKey[contentId][roundId][commitKey] = commitHash`
- `revealVoteByCommitKey(...)` appears to be the only consumer of that mapping

Because each stored `Commit` already contains `voter`, and the engine already stores `voterCommitHash[contentId][roundId][voter]`, the reveal path may be able to recover the same commit hash without a dedicated `commitHashByKey` write.

Why it likely helps:

- removes another vote-time mapping write
- moves some cost from vote to reveal, which is usually the right direction because vote is the more important user-facing action

Expected impact:

- medium
- likely one of the cleaner ways to cut vote gas without changing core game theory

Risk and caveat:

- reveal becomes slightly more expensive
- the implementation must check that the retrieved commit really exists before trusting the recovered hash

Assessment:

- high-confidence candidate
- especially attractive because the mapping currently looks single-purpose

### 3. Replace `contentCommitCount` with a cheaper "has any commits" signal

Current behavior:

- every vote increments `contentCommitCount[contentId]`
- `ContentRegistry.cancelContent(...)` only needs to know whether the count is zero or non-zero

That means the protocol pays a write on every vote for a value that is currently used mostly as a boolean gate.

Possible alternatives:

- derive the answer from existing round state
- store a one-time `hasAnyCommit[contentId]` flag instead of a counter

Why it likely helps:

- avoids repeated vote-time writes after the first commit
- better matches the actual read-side requirement

Expected impact:

- medium
- probably not as valuable as removing `hasCommitted` or `commitHashByKey`, but still worthwhile

Risk and caveat:

- interface and tests would need updates
- if product logic truly needs the exact count in the future, this would remove that convenience

Assessment:

- good candidate if the product only cares about zero vs non-zero

### 4. Remove redundant Voter ID stake tracking if one-vote-per-token remains

Current behavior when `VoterIdNFT` is configured:

- the engine rejects duplicate token voting with `hasTokenIdCommitted[contentId][roundId][voterId]`
- the engine also reads `voterIdNFT.getEpochContentStake(...)`
- the engine then writes `voterIdNFT.recordStake(...)`
- stake amount is already bounded by `MAX_STAKE`

If one token can only commit once per round, the separate per-token stake accumulator appears redundant for commit enforcement. In the current codebase, it looks more like auxiliary state than essential consensus state.

Why it likely helps:

- removes one external read on vote
- removes one external write on vote
- removes one storage write inside `VoterIdNFT`

Expected impact:

- medium to high when Voter ID is enabled
- likely one of the larger single vote-path wins after the redundant-engine mappings

Risk and caveat:

- frontend code currently exposes `getEpochContentStake(...)` and `getRemainingStakeCapacity(...)`
- docs and ABI consumers would need to change
- if that stake tracking is used for analytics or future identity policy, removing it has product impact

Assessment:

- strong gas candidate
- medium product/API risk rather than pure contract risk

### 5. Stop updating `lastActivityAt` on every vote, and derive it from events off-chain

Current behavior:

- every vote ends with `registry.updateActivity(contentId)`
- `ContentRegistry` notes that this is for UI-facing activity and does not move the dormancy anchor

That means every vote pays an extra cross-contract call and storage write for data that may be more naturally maintained by the indexer.

Why it likely helps:

- removes a vote-time callback
- removes a non-critical storage write from the hottest path

Expected impact:

- small to medium
- probably not enough on its own, but sensible if the indexer can own this field

Risk and caveat:

- UI and API behavior must be updated together
- on-chain `lastActivityAt` would stop meaning "latest vote or content action"

Assessment:

- good cleanup candidate if the product is comfortable moving this concern off-chain

### 6. Treat frontend attribution as optional if gas matters more than on-chain monetization detail

Measured fact:

- approved frontend attribution currently adds about `37,266` gas to a vote

That is not huge in dollar terms on Celo, but it is large enough to matter if the goal is specifically to reduce raw vote gas.

Possible directions:

- make frontend attribution optional
- only enable it in revenue-critical flows
- defer some attribution logic to later phases or off-chain accounting

Expected impact:

- known per-vote savings of roughly `37k` gas when attribution is absent

Risk and caveat:

- this is a direct protocol/business tradeoff
- it affects fee accounting and frontend incentives, not just engineering

Assessment:

- effective, but this is a product decision first

### 7. Move more submit canonicalization off-chain

Measured fact:

- `SubmissionCanonicalizer.resolveCategoryAndSubmissionKey(...)` averages about `55.8k` gas in the local gas report

Current behavior:

- `submitContent(...)` performs URL validation
- calls the canonicalizer
- calls the category registry
- derives and checks canonical keys on-chain

Why it likely helps:

- canonical string parsing is expensive
- the submit path is already heavy

Possible direction:

- accept a precomputed `submissionKey` and resolved category from the client or backend
- keep only cheap on-chain verification

Expected impact:

- medium to high on submit
- no direct improvement to voting

Risk and caveat:

- off-chain normalization bugs could create duplicate-content edge cases
- this needs a strong shared test vector suite so frontend, backend, and contracts all agree

Assessment:

- probably the biggest submit-only optimization lever
- not a good fit unless the team is comfortable shifting trust and complexity off-chain

### 8. Reduce the `ContentSubmitted` event payload

Current behavior:

- `ContentSubmitted` emits `url`, `title`, `description`, and `tags`

Even though those strings are not stored in contract state, they still cost gas as event data.

Possible directions:

- emit only `contentHash` and compact identifiers
- emit a pointer or URI instead of full metadata
- move full metadata capture to an indexer or storage layer outside the contract

Expected impact:

- medium to high on submit, depending on average metadata size

Risk and caveat:

- indexers and consumers lose the fully self-contained event payload
- this is a product and data-availability tradeoff, not just an engineering tradeoff

Assessment:

- attractive if submit gas becomes a real UX concern
- probably unnecessary if the current submit cost is already acceptable

### 9. Repack `Round` and `Content` storage only as a v2 migration project

At a raw storage level, `RoundLib.Round` and `ContentRegistry.Content` still have room for packing and reshaping. In a fresh deployment, that could reduce some slot writes.

Why this is not a normal optimization task:

- these are UUPS-upgradeable contracts
- OpenZeppelin's upgrade docs explicitly warn that changing state-variable order or type can break storage compatibility

That means a simple "reorder fields and use smaller ints" upgrade is risky. Any serious packing change should be treated as a migration project with explicit storage planning, not as a routine gas cleanup.

Expected impact:

- potentially high

Risk and caveat:

- highest risk in this document
- easy to break storage layout
- likely requires new namespaced storage or a migration-oriented redesign

Assessment:

- real upside, but not the right first move

### 10. Compiler upgrade is worth benchmarking, but expect incremental gains

Current state:

- the repo compiles with Solc `0.8.28`
- `via_ir` is enabled
- Solidity `0.8.34` fixes a `via-ir` transient-storage clearing bug affecting `0.8.28` through `0.8.33`

Local code search did not find `delete` on transient state, so this project does not appear to match the bug pattern directly. Still, a compiler upgrade is worth considering for safety and for minor optimizer improvements.

Expected impact:

- low
- likely incremental, not structural

Risk and caveat:

- requires a full test pass and bytecode review
- good hygiene, but not the main lever for reducing vote gas

Assessment:

- benchmark it
- do not expect it to replace contract-level optimization work

## Recommended Order Of Work

If the goal is "reduce gas with the best risk-adjusted payoff", the order I would use is:

1. Prototype removal of `hasCommitted`.
2. Prototype removal of `commitHashByKey`.
3. Replace `contentCommitCount` with a boolean or derived check.
4. Decide whether Voter ID stake tracking is still required as on-chain state.
5. Decide whether `updateActivity` should stay on-chain.
6. Revisit frontend attribution only if product is willing to trade off fee accounting for lower vote gas.
7. Revisit canonicalization and metadata logging only if submit gas becomes a real UX problem.
8. Treat storage repacking as a separate migration roadmap, not as a small optimization patch.

## Practical Recommendation For Curyo

The best next step is not a broad refactor. It is a focused benchmark branch that tries the three cleanest vote-path simplifications first:

- remove `hasCommitted`
- remove `commitHashByKey`
- replace `contentCommitCount` with a zero/non-zero flag or derived check

If those three changes produce the expected savings, Curyo likely gets the largest low-risk reduction available today without changing the product model.

After that, the biggest single remaining question is whether the Voter ID stake accumulator is still worth its gas cost. If the answer is no, that change is probably the next best step.

## Sources

Repo-local sources:

- [`docs/celo-gas-cost-estimates-2026-03-19.md`](./celo-gas-cost-estimates-2026-03-19.md)
- [`packages/foundry/test/GasEstimatesReport.t.sol`](../packages/foundry/test/GasEstimatesReport.t.sol)
- [`packages/foundry/test/GasBudget.t.sol`](../packages/foundry/test/GasBudget.t.sol)
- [`packages/foundry/contracts/RoundVotingEngine.sol`](../packages/foundry/contracts/RoundVotingEngine.sol)
- [`packages/foundry/contracts/ContentRegistry.sol`](../packages/foundry/contracts/ContentRegistry.sol)
- [`packages/foundry/contracts/SubmissionCanonicalizer.sol`](../packages/foundry/contracts/SubmissionCanonicalizer.sol)
- [`packages/foundry/contracts/VoterIdNFT.sol`](../packages/foundry/contracts/VoterIdNFT.sol)
- [`packages/nextjs/hooks/useVoterIdNFT.ts`](../packages/nextjs/hooks/useVoterIdNFT.ts)

Official references:

- [Solidity docs: Data location (`calldata` avoids copies)](https://docs.soliditylang.org/en/latest/types.html#data-location)
- [Solidity blog: A closer look at via-IR](https://soliditylang.org/blog/2024/07/12/a-closer-look-at-via-ir/)
- [Solidity docs: Contracts, transient storage, constants, and immutables](https://docs.soliditylang.org/en/latest/contracts.html)
- [Solidity 0.8.34 release announcement](https://www.soliditylang.org/blog/2026/02/18/solidity-0.8.34-release-announcement/)
- [OpenZeppelin docs: `ReentrancyGuardTransient`](https://docs.openzeppelin.com/contracts/5.x/api/utils)
- [OpenZeppelin docs: Writing upgradeable contracts](https://docs.openzeppelin.com/upgrades-plugins/writing-upgradeable)
