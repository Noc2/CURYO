# RoundVotingEngine Contract Size Research

Date: 2026-03-12

## Summary

`RoundVotingEngine` is currently too large for both the repo's local `30000`-byte deployment guard and the standard EVM runtime limit from EIP-170 (`24576` bytes).

Current measured sizes from `forge build --sizes`:

- `RoundVotingEngine`: `33020` bytes runtime
- `ContentRegistry`: `28283` bytes runtime

Two conclusions came out of this pass:

1. Compiler tuning alone will not solve this. The best low-effort compiler-only variant I measured only saved about `116` bytes.
2. The biggest wins come from removing non-core ABI surface and picking one single-transaction vote path instead of keeping both.

## Primary-source guidance

Relevant references:

- EIP-170 code size limit: https://eips.ethereum.org/EIPS/eip-170
- Solidity optimizer docs: https://docs.soliditylang.org/en/latest/internals/optimizer.html
- Solidity contracts/libraries docs: https://docs.soliditylang.org/en/latest/contracts.html

What matters here:

- EIP-170 caps deployed runtime bytecode at `0x6000` = `24576` bytes.
- Solidity's optimizer `runs` setting is a tradeoff between deployment size and runtime gas. Lower runs can reduce size, but not always by much.
- Internal library functions and free functions are compiled into the calling contract. If we want real bytecode relief from helper logic, it has to move behind an external/public contract or library boundary.

## Local measurements

### Baseline

From the current repo:

- `RoundVotingEngine`: `33020`
- `ContentRegistry`: `28283`

The repo also explicitly enforces a `30000` local cap in `packages/foundry/Makefile`, but that is still looser than EIP-170.

### Compiler-only experiments

Measured on a reduced `RoundVotingEngine.sol` build:

- Baseline target build: `33020`
- `--optimizer-runs 1`: `32957`
- `--no-metadata`: `32967`
- `--optimizer-runs 1 --no-metadata`: `32904`

Conclusion: compiler settings are worth keeping tight, but they are not the fix.

## Code-removal experiments

These were measured on a temporary copy of the contract to estimate impact before touching the repo.

### 1. Remove `commitVoteWithPermit(...)`

Result:

- `29353` bytes
- Savings: about `3667` bytes

Why this matters:

- `commitVoteWithPermit(...)` is currently not used by the runtime app flow.
- Repo references are limited to docs and contract tests.
- This is one of the single largest isolated removals.

### 2. Remove engine claim wrappers

Removed:

- `claimFrontendFee(...)`
- `claimParticipationReward(...)`

Result:

- `28058` bytes
- Savings: about `4962` bytes

Why this matters:

- The actual claiming logic already lives in `RoundRewardDistributor`.
- The app does not appear to use these engine-level claim wrappers in runtime code.
- Keeping them in the engine duplicates external call/ABI surface that can live on the distributor instead.

### 3. Remove legacy/backfill plus duplicated view surface

Removed bundle:

- `backfillParticipationRewardSnapshot(...)`
- `getRound(...)`
- `getCommit(...)`
- `getRoundCommitHashes(...)`
- `getRoundConfig(...)`
- `getRoundVoterCount(...)`
- `getRoundVoter(...)`
- `getContentCommitCount(...)`
- `hasUnrevealedVotes(...)`

Result:

- `31186` bytes
- Savings: about `1834` bytes

Why this matters:

- Several of these duplicate already-generated public getters such as `rounds(...)`, `commits(...)`, `contentCommitCount(...)`, and `currentRoundId(...)`.
- `backfillParticipationRewardSnapshot(...)` is explicitly a one-time legacy governance backfill path. For a fresh deployment, it is a strong removal candidate.

### 4. Keep current `transferAndCall` UI, remove permit, plus cleanup bundle

Removed:

- `commitVoteWithPermit(...)`
- engine claim wrappers
- legacy/backfill + duplicated view surface bundle

Result:

- `27121` bytes

This gets below the repo's local `30000` cap, but still not below EIP-170.

### 5. Switch to permit-based single-tx voting, remove ERC-1363 receive path, plus cleanup bundle

Removed:

- `IERC1363Receiver` inheritance/import
- `onTransferReceived(...)`
- engine claim wrappers
- legacy/backfill + duplicated view surface bundle

Kept:

- `commitVoteWithPermit(...)`

Result:

- `23033` bytes

This gets `RoundVotingEngine` under EIP-170 while preserving a single-transaction vote path.

## Recommended reduction plan

### Priority 1: Stop carrying both single-tx vote paths

Pick one:

- Keep `transferAndCall` and delete `commitVoteWithPermit`, or
- Keep `commitVoteWithPermit` and delete `onTransferReceived` / `IERC1363Receiver`

Recommendation:

- Prefer the permit path if the goal is getting under EIP-170 without a deeper refactor.

Reason:

- The runtime app already uses `transferAndCall`, but permit is also a viable single-tx UX and the contract already has the tested code path.
- The measured "keep permit, remove ERC-1363 path" variant is the cleanest path I found to get under the real EVM size limit.

### Priority 2: Remove engine-level claim wrappers

Move callers to `RoundRewardDistributor` directly:

- frontend fee claims
- participation reward claims

This is high-value size reduction and does not remove core protocol logic.

### Priority 3: Prune ABI convenience functions from the engine

Best removal candidates:

- `backfillParticipationRewardSnapshot(...)` for fresh deployments
- `getRound(...)` in favor of `rounds(...)`
- `getCommit(...)` in favor of `commits(...)`
- `getContentCommitCount(...)` in favor of `contentCommitCount(...)`
- `hasUnrevealedVotes(...)` if callers can derive this off-chain

The keeper and tests would need follow-up updates if we also remove:

- `getRoundCommitHashes(...)`
- `getRoundConfig(...)`
- `getRoundVoterCount(...)`
- `getRoundVoter(...)`

### Priority 4: If needed after that, move helper logic behind a true external boundary

If we still want to preserve the current external surface, the next meaningful lever is structural extraction:

- move settlement side-effect helpers to a dedicated settlement helper contract
- move more reward bridge logic out of the engine
- only rely on external/public library/helper contracts for code that should not live in the engine bytecode

Internal libraries alone will not help much because their code is still compiled into the engine.

## Practical recommendation for this repo

If the goal is "minimum product disruption with the best chance of passing mainnet size limits", the best sequence is:

1. Remove engine claim wrappers and point callers to `RoundRewardDistributor`.
2. Remove the legacy backfill function and duplicated getters.
3. Replace the app's `transferAndCall` vote flow with `commitVoteWithPermit(...)`.
4. Remove `IERC1363Receiver` and `onTransferReceived(...)`.

Based on the measured variants, that should get `RoundVotingEngine` below EIP-170 without touching the core settlement algorithm.

## Important follow-up

`ContentRegistry` is also above EIP-170 at `28283` bytes. Even if `RoundVotingEngine` is fixed, `ContentRegistry` still needs its own size pass before mainnet deployment on a standard EVM network.
