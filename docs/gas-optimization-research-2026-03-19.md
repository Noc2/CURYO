# Curyo Gas Optimization Research

Verified on March 19, 2026.

This document reviews whether Curyo's smart contracts can reduce gas costs further, with special focus on the vote path on Celo.

Bottom line after a second pass: yes, there is still room to reduce gas, and because these contracts are not deployed yet, some of the best opportunities are now pre-launch structural changes that do not change the user-facing UX. The biggest practical wins are still in `RoundVotingEngine._commitVote(...)`, but storage packing and bytecode-size cleanup are now higher priority than the first draft suggested.

This document mixes:

- measured facts from the current repo-local gas benchmarks
- code-level inferences from the current contracts
- official Solidity and OpenZeppelin guidance where compiler or upgradeability behavior matters

## Executive summary

- The main recurring user cost is still voting: about `677,802` gas without frontend attribution and `715,068` gas with frontend attribution.
- The compiler-level low-hanging fruit is only partially taken. The repo already uses `via_ir = true`, `optimizer = true`, `optimizer_runs = 100`, `evm_version = "cancun"`, and `ReentrancyGuardTransient`, but there is still room in optimizer tuning, remaining revert strings, and especially storage layout.
- The best remaining vote optimizations that preserve the current one-transaction voting UX are:
  - pre-launch storage packing of `Round`, `Commit`, and `RoundConfig`
  - `hasCommitted`
  - `commitHashByKey`
  - `contentCommitCount`
  - Voter ID per-round stake tracking
- The best remaining submit optimizations that do not change product behavior are pre-launch storage packing plus converting hot-path revert strings to custom errors.
- The biggest submit-only wins from off-chain canonicalization and smaller event payloads are real, but they do change data-flow and indexer assumptions, so they should not be the first moves if the goal is "make it cheaper without changing anything."
- A realistic near-term goal is to reduce vote gas by tens of thousands through storage and bookkeeping cleanup while preserving the current frontend flow.

## Current hotspots

Measured from the current repo:

- Vote via `transferAndCall(...)`: `677,802` gas
- Vote with frontend attribution: `715,068` gas
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

## Second-Pass Findings

The first draft was directionally right, but the second pass changed the priority order in a few important ways.

### 1. Pre-launch storage packing is now a top recommendation, not a future migration idea

Because the contracts are not deployed yet, storage layout is not frozen. That materially changes the tradeoff.

Local `forge inspect ... storage-layout --json` output shows the current struct sizes are still large:

| Struct | Current size | Current slots | Why it matters |
| --- | ---: | ---: | --- |
| `RoundLib.Round` | `448` bytes | `14` slots | Touched by commit, reveal, and settle |
| `RoundLib.Commit` | `192` bytes | `6` slots | Written on every vote |
| `RoundLib.RoundConfig` | `128` bytes | `4` slots | Read in hot paths and snapshotted per round |
| `ContentRegistry.Content` | `288` bytes | `9` slots | Written on submit and updated during lifecycle changes |
| `FrontendRegistry.Frontend` | `160` bytes | `5` slots | Written on register, claim, slash, and deregister |

The codebase already gives strong bounds for packing:

- `CuryoReputation.MAX_SUPPLY = 100_000_000e6`, so total token quantities fit comfortably inside `uint64`
- `RoundVotingEngine.MAX_STAKE = 100e6`
- `setConfig(...)` caps `maxVoters` at `10,000`, so round counters do not need `uint256`
- timestamps fit comfortably inside `uint48`

That means several hot structs can be shrunk aggressively before launch without changing the user-facing protocol behavior.

### 2. `RoundVotingEngine` code size now looks like a pre-launch issue

The repo already contains size-related hints:

- `packages/foundry/contracts/RoundVotingEngine.sol` says `computeCurrentEpochEnd` was removed "to fit size limit"
- `packages/foundry/contracts/libraries/SubmitterStakeLib.sol` says it was linked externally to keep the engine below EIP-170
- local deploys should enforce the same EIP-170 runtime limit as real deployments, so localhost success should not be treated as evidence that oversized bytecode is safe to ship

Local bytecode checks currently show:

- `RoundVotingEngine` deployed bytecode at `optimizer_runs = 100`: about `26,508` bytes
- `RoundVotingEngine` deployed bytecode at `optimizer_runs = 10,000`: about `31,421` bytes
- `ContentRegistry` deployed bytecode at `optimizer_runs = 100`: about `15,369` bytes

EIP-170's runtime code limit is `24,576` bytes, so the engine appears to be above the normal EVM contract-size ceiling in its current shape. That makes structural cleanup more urgent than the first draft suggested.

### 3. Higher `optimizer_runs` helps a little, but not enough to be the first move

Sample benchmark results from the current codebase:

| Test | `optimizer_runs = 100` | `optimizer_runs = 10,000` | Delta |
| --- | ---: | ---: | ---: |
| `commitVote` | `659,947` | `659,435` | `-512` |
| `submitContent` | `491,419` | `487,571` | `-3,848` |
| `revealVoteByCommitKey` | `94,457` | `94,271` | `-186` |
| `settleRound` | `312,243` | `311,546` | `-697` |

That is a real improvement, but it is small compared with the likely savings from packing and redundant-write removal, and it worsens the engine's runtime size.

### 4. `commitHashByKey` is more removable than the first draft implied

The first draft said the reveal path could recover the stored hash from other state.

After re-checking `RoundVotingEngine._revealVoteInternal(...)`, the cleaner version is:

- compute `expectedHash = keccak256(abi.encodePacked(isUp, salt, contentId, keccak256(commit.ciphertext)))`
- verify `commitKey == keccak256(abi.encodePacked(commit.voter, expectedHash))`

That means `commitHashByKey` can likely be removed without relying on `voterCommitHash` for the reveal path at all.

### 5. Custom errors are only partially adopted in the hot contracts

`RoundVotingEngine` already uses custom errors heavily, but `ContentRegistry` and `FrontendRegistry` still contain many revert strings, including in hot or semi-hot paths.

Because Solidity now supports custom errors as a gas-efficient pattern, converting remaining revert strings in hot code is still a worthwhile secondary cleanup, especially for bytecode size.

## What Is Already Optimized

Several standard gas levers are already in place:

- `packages/foundry/foundry.toml` already enables `via_ir`, the optimizer, and `cancun`.
- `RoundVotingEngine` already uses custom errors in many hot paths, even though the broader codebase still has remaining revert strings.
- The upgradeable contracts already use `ReentrancyGuardTransient`, which OpenZeppelin documents as the transient-storage variant of `ReentrancyGuard`.
- `ContentRegistry` already avoids storing full user metadata on-chain in state. It stores `contentHash` and emits metadata in events instead.
- The frontend vote flow already uses a one-transaction `transferAndCall(...)` path instead of `approve + commitVote`.

Because of that, further savings probably will not come from generic "turn on optimizer" advice. They will come from removing state writes, external calls, or log bytes.

## Prioritized Opportunities

### Highest leverage: Pack hot structs before deployment

Because the contracts are not deployed yet, storage packing is no longer a migration-risk item. It is one of the strongest no-UX-change optimizations available.

The current bounds support much smaller types:

- timestamps: `uint48`
- voter counters: `uint16` or `uint32`
- token amounts: `uint64`
- config values like `epochDuration`, `maxDuration`, `minVoters`, `maxVoters`: small fixed-width integers

The best packing targets are:

- `RoundLib.Round`
- `RoundLib.Commit`
- `RoundLib.RoundConfig`
- `ContentRegistry.Content`
- `FrontendRegistry.Frontend`

Why it likely helps:

- these structs dominate hot-path storage reads and writes
- `Round` and `Commit` are on the vote, reveal, and settle path
- this also helps with the engine's current code-size pressure because smaller field widths and simpler layouts tend to reduce surrounding logic

Expected impact:

- high
- likely the largest single no-UX-change gas lever remaining before launch

Risk and caveat:

- this is still real engineering work because autogenerated getters, tests, TypeScript ABIs, and any tuple decoders must be updated
- bounds should be documented in comments so future governance changes do not silently overflow packed fields

Assessment:

- top recommendation before deployment

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

Because each stored `Commit` already contains `voter` and `ciphertext`, the reveal path can likely:

- recompute `expectedHash` from `(isUp, salt, contentId, keccak256(ciphertext))`
- verify that `commitKey == keccak256(abi.encodePacked(commit.voter, expectedHash))`

That makes a dedicated `commitHashByKey` mapping look unnecessary.

Why it likely helps:

- removes another vote-time mapping write
- moves some cost from vote to reveal, which is usually the right direction because vote is the more important user-facing action

Expected impact:

- medium
- likely one of the cleaner ways to cut vote gas without changing core game theory

Risk and caveat:

- reveal becomes slightly more expensive
- the implementation must check that the retrieved commit really exists before trusting the recomputed hash

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

- frontend attribution currently adds about `37,266` gas to a vote

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

### 9. If packing is deferred past launch, it becomes a migration project

At a raw storage level, `RoundLib.Round` and `ContentRegistry.Content` still have room for packing and reshaping. Before launch, that is a normal optimization task. After launch, it becomes much harder.

Why this is not a normal optimization task:

- these are UUPS-upgradeable contracts
- OpenZeppelin's upgrade docs explicitly warn that changing state-variable order or type can break storage compatibility

That means the same "reorder fields and use smaller ints" change is reasonable now, but risky later. If it is deferred until after deployment, it should be treated as a migration project with explicit storage planning, not as a routine cleanup.

Expected impact:

- potentially high

Risk and caveat:

- highest risk in this document
- easy to break storage layout
- likely requires new namespaced storage or a migration-oriented redesign

Assessment:

- do it before launch if the team wants the benefit
- do not leave it for "later" unless there is a strong reason

### 10. Compiler and optimizer tuning are worth benchmarking, but only after size cleanup

Current state:

- the repo compiles with Solc `0.8.28`
- `via_ir` is enabled
- Solidity `0.8.34` fixes a `via-ir` transient-storage clearing bug affecting `0.8.28` through `0.8.33`
- increasing `optimizer_runs` from `100` to `10,000` slightly improved sampled runtime gas, but made `RoundVotingEngine` even larger

Local code search did not find `delete` on transient state, so this project does not appear to match the bug pattern directly. Still, a compiler upgrade is worth considering for safety and for minor optimizer improvements.

Expected impact:

- low
- likely incremental, not structural

Risk and caveat:

- requires a full test pass and bytecode review
- do not treat higher `optimizer_runs` as a free gas win while the engine is already above the normal EIP-170 limit

Assessment:

- benchmark it after structural size reductions land
- do not expect it to replace contract-level optimization work

### 11. Reconsider UUPS proxies if upgradeability is not a launch requirement

This codebase currently deploys the major contracts behind `ERC1967Proxy` and keeps `_authorizeUpgrade(...)` hooks across the core system.

If Curyo is still pre-launch and governance is comfortable shipping immutable v1 contracts, removing the proxy layer is one of the few no-UX-change architectural changes that can reduce runtime gas on every call.

Why it likely helps:

- every proxied external call pays delegatecall and fallback overhead
- implementation contracts also carry upgrade-related code and storage scaffolding

Expected impact:

- medium
- not likely as large as storage packing, but larger than most micro-optimizations

Risk and caveat:

- this is an operational and governance choice, not a pure gas choice
- it removes the easiest upgrade path
- the project would need stronger deployment confidence and a cleaner migration story for future versions

Assessment:

- worth an explicit pre-launch decision
- not the first optimization patch, but too important to ignore

## Recommended Order Of Work

If the goal is "reduce gas without changing the user-facing flow", the order I would use is:

1. Pack `Round`, `Commit`, `RoundConfig`, `Content`, and `Frontend` before deployment.
2. Remove `commitHashByKey`.
3. Remove `hasCommitted` by consolidating on existing commit state.
4. Replace `contentCommitCount` with a zero/non-zero signal or derived check.
5. Convert remaining hot-path revert strings to custom errors.
6. Re-check bytecode size against EIP-170 after steps 1 through 5.
7. Only then benchmark higher `optimizer_runs` or a compiler upgrade.
8. Revisit Voter ID stake tracking if the product does not truly need it on-chain.
9. Revisit proxy removal only if governance is comfortable with a non-upgradeable v1.
10. Leave off-chain canonicalization, metadata-log slimming, and frontend-attribution changes for later unless the team is willing to change data-flow or business semantics.

## Practical Recommendation For Curyo

Because the contracts are not deployed yet, the best next step is now a pre-launch optimization branch, not just a tiny cleanup patch.

The clearest next steps are:

1. Do a storage-packing pass first.
   Focus on `RoundLib.Round`, `RoundLib.Commit`, `RoundLib.RoundConfig`, `ContentRegistry.Content`, and `FrontendRegistry.Frontend`. This is the biggest no-UX-change gas lever and also the best answer to the current engine bytecode-size problem.
2. In the same branch, remove the three cleanest redundant writes.
   Remove `commitHashByKey`, collapse `hasCommitted`, and replace `contentCommitCount` with a zero/non-zero design.
3. Convert remaining hot-path revert strings to custom errors.
   This is most relevant in `ContentRegistry` and `FrontendRegistry`. The win is smaller, but it also helps bytecode size.
4. Re-run gas and bytecode-size benchmarks after those structural changes.
   At that point, re-check whether higher `optimizer_runs` is now worth locking in.

If Curyo wants to preserve the current one-transaction vote UX and current product behavior, those four steps are the best path I see.

I would not start with off-chain canonicalization, smaller metadata events, or dropping frontend attribution. Those can help, but they change more than the internal optimizations above do.

## Sources

Repo-local sources:

- [`docs/celo-gas-cost-estimates-2026-03-19.md`](./celo-gas-cost-estimates-2026-03-19.md)
- [`packages/foundry/test/GasEstimatesReport.t.sol`](../packages/foundry/test/GasEstimatesReport.t.sol)
- [`packages/foundry/test/GasBudget.t.sol`](../packages/foundry/test/GasBudget.t.sol)
- [`packages/foundry/Makefile`](../packages/foundry/Makefile)
- [`packages/foundry/contracts/CuryoReputation.sol`](../packages/foundry/contracts/CuryoReputation.sol)
- [`packages/foundry/contracts/RoundVotingEngine.sol`](../packages/foundry/contracts/RoundVotingEngine.sol)
- [`packages/foundry/contracts/ContentRegistry.sol`](../packages/foundry/contracts/ContentRegistry.sol)
- [`packages/foundry/contracts/FrontendRegistry.sol`](../packages/foundry/contracts/FrontendRegistry.sol)
- [`packages/foundry/contracts/SubmissionCanonicalizer.sol`](../packages/foundry/contracts/SubmissionCanonicalizer.sol)
- [`packages/foundry/contracts/VoterIdNFT.sol`](../packages/foundry/contracts/VoterIdNFT.sol)
- [`packages/nextjs/hooks/useVoterIdNFT.ts`](../packages/nextjs/hooks/useVoterIdNFT.ts)

Official references:

- [EIP-170: Contract code size limit (`24576` bytes)](https://eips.ethereum.org/EIPS/eip-170)
- [Solidity docs: Data location (`calldata` avoids copies)](https://docs.soliditylang.org/en/latest/types.html#data-location)
- [Solidity docs: Layout of state variables in storage](https://docs.soliditylang.org/en/latest/internals/layout_in_storage.html)
- [Solidity docs: Custom errors](https://docs.soliditylang.org/en/latest/contracts.html#custom-errors)
- [Solidity blog: A closer look at via-IR](https://soliditylang.org/blog/2024/07/12/a-closer-look-at-via-ir/)
- [Solidity docs: Contracts, transient storage, constants, and immutables](https://docs.soliditylang.org/en/latest/contracts.html)
- [Solidity 0.8.26 release announcement](https://soliditylang.org/blog/2024/05/21/solidity-0.8.26-release-announcement/)
- [Solidity 0.8.34 release announcement](https://www.soliditylang.org/blog/2026/02/18/solidity-0.8.34-release-announcement/)
- [OpenZeppelin docs: `ReentrancyGuardTransient`](https://docs.openzeppelin.com/contracts/5.x/api/utils)
- [OpenZeppelin docs: Writing upgradeable contracts](https://docs.openzeppelin.com/upgrades-plugins/writing-upgradeable)
