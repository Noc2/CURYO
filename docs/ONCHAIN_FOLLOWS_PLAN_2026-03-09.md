# On-Chain Follows Plan

Status: **Draft** | Last updated: 2026-03-09

This document covers the next step after making `ProfileRegistry` the first-class profile source of truth: moving the follow graph on-chain.

This revision folds in a gas-focused design review. The earlier draft stored both follower and following arrays on-chain. That is not the cheapest design for Curyo's actual product needs.

---

## Current State

Profiles are now first-class on-chain data:

- profile reads come from `ProfileRegistry`
- Ponder indexes `ProfileRegistry` events
- the old DB-backed `/api/username` write flow is removed

Follows are still off-chain:

- write path: `packages/nextjs/app/api/follows/profiles/route.ts`
- challenge issuance: `packages/nextjs/app/api/follows/profiles/challenge/route.ts`
- storage: `packages/nextjs/lib/social/profileFollows.ts`
- local table: `followed_profiles`
- frontend hook: `packages/nextjs/hooks/useFollowedProfiles.ts`

That means follows are not portable across frontends today.

---

## Recommendation

Use a dedicated on-chain `FollowRegistry` contract instead of extending `ProfileRegistry`.

### Why a separate contract

- `ProfileRegistry` should stay focused on profile identity and name/image ownership.
- Follow relationships are high-churn social graph data and will grow much faster than profile metadata.
- A separate registry keeps the upgrade and storage risk smaller for the existing profile contract.
- Frontends already integrate with multiple contracts, so one more registry is operationally acceptable.

### Why not extend `ProfileRegistry`

It is possible to append follow mappings to `ProfileRegistry`, but that couples profile metadata and social graph state into one upgrade path. For mainnet, that is a larger blast radius than necessary.

### Gas-first conclusion

If the goal is to make follows portable across frontends, you do not need to store the full graph twice on-chain.

The cheapest practical design for Curyo is:

- store only the follow edge membership on-chain
- emit follow/unfollow events
- let Ponder reconstruct follower lists, following lists, and counts off-chain

That still gives every frontend a shared on-chain source of truth for writes, without paying to persist both sides of the graph in contract storage.

The current product mainly needs:

- `isFollowing(viewer, target)` for button state
- the viewer's followed set for "Following Only" filters

Those do not require mirrored `followers[]` and `following[]` arrays in contract storage.

---

## Target Contract Surface

Add a new upgradeable registry, for example:

- `packages/foundry/contracts/FollowRegistry.sol`
- `packages/foundry/contracts/interfaces/IFollowRegistry.sol`

### Core state

#### Recommended v1

- `mapping(address => mapping(address => bool)) private _isFollowing;`

That is the minimum state required for on-chain truth and replay-safe follow writes.

Do not store in v1:

- `followers[]`
- `following[]`
- follower index mappings
- following index mappings
- on-chain follower/following counters
- timestamps per follow edge

Instead:

- emit events for every follow/unfollow
- let Ponder maintain the enumerated graph and counts

#### Optional v2, only if direct on-chain pagination becomes necessary

If you later decide that wallets/frontends must enumerate a user's followed set directly via RPC, add only:

- `mapping(address => address[]) private _following;`
- `mapping(address => mapping(address => uint256)) private _followingIndexPlusOne;`

Use `indexPlusOne != 0` as membership and remove the separate `_isFollowing` mapping entirely in that variant.

Do not mirror `followers[]` on-chain unless another on-chain contract truly needs follower enumeration.

### Core events

- `event ProfileFollowed(address indexed follower, address indexed followed);`
- `event ProfileUnfollowed(address indexed follower, address indexed followed);`

### Core errors

- `error InvalidAddress();`
- `error SelfFollow();`
- `error AlreadyFollowing();`
- `error NotFollowing();`

### Core functions

- `function follow(address target) external;`
- `function unfollow(address target) external;`
- `function isFollowing(address follower, address target) external view returns (bool);`

Do not add pagination functions in v1. Frontends should read enumerated follow data from Ponder.

Optional v2 only if you add on-chain `following[]` storage:

- `function getFollowingPaginated(address follower, uint256 offset, uint256 limit) external view returns (address[] memory addresses, uint256 total);`

Avoid `getFollowersPaginated()` unless you intentionally accept the extra storage cost of mirroring the graph.

### Contract implementation notes

- Prefer custom errors over revert strings.
- Prefer `external` functions and `calldata` parameters where possible.
- Do not inherit `ReentrancyGuard` if follow/unfollow make no external calls.
- If the contract only needs one governance owner plus UUPS upgrade authorization, `Ownable2StepUpgradeable` is leaner than `AccessControlUpgradeable`. Use `AccessControlUpgradeable` only if you genuinely need multiple runtime roles.
- If you later add on-chain `following[]` pagination, use swap-and-pop on unfollow.
- Avoid OpenZeppelin `EnumerableSet` for the hot path unless benchmarking shows the convenience is worth it. Its set copies for `values()` are explicitly unbounded.

---

## Behavioral Decisions

### Self-follow

Keep self-follow forbidden.

### Duplicate follow

Revert on duplicate follow and on unfollow of a non-followed address. That keeps behavior explicit and easier to test.

### Profile requirement

Do not require the target address to already have a profile.

Reason:

- the current UX follows curator addresses, not only fully configured profiles
- many leaderboard/voting participants may not have set a profile yet

### Voter ID requirement

Do not require a Voter ID for follow/unfollow in v1 unless spam becomes a real problem.

Reason:

- follows are lightweight preference state
- the current product allows wallet-based follow behavior already
- adding a Voter ID gate would be a product change, not just a storage migration

---

## App Changes

### Next.js

Replace the current signed-message API flow in:

- `packages/nextjs/hooks/useFollowedProfiles.ts`

With a contract-based flow:

- read the viewer's followed set from Ponder
- read `isFollowing(viewer, target)` from contract or from indexed follow state
- write `follow(target)` / `unfollow(target)` via wallet transaction

Delete after migration:

- `packages/nextjs/app/api/follows/profiles/route.ts`
- `packages/nextjs/app/api/follows/profiles/challenge/route.ts`
- `packages/nextjs/lib/social/profileFollows.ts`
- `followed_profiles` table from `packages/nextjs/lib/db/schema.ts`
- follow-specific signed-action helper usage

### Ponder

Add a new indexer file, for example:

- `packages/ponder/src/FollowRegistry.ts`

Index:

- follow edges
- follower counts
- following counts

Add API endpoints such as:

- `GET /following/:address`
- `GET /followers/:address`
- optional `GET /follow-state?follower=...&target=...`

This is the main enumeration layer. It replaces the need to persist follower and following arrays in contract storage.

### MCP

Once indexed, expose follow graph reads in the MCP package so agents can query curator neighborhoods directly.

---

## Migration Constraint

There is no trustless migration of the current DB-backed follows to on-chain follows.

The current follow state lives in a server database and is not backed by on-chain user consent for a follow transaction. That means you cannot safely bulk-recreate follows on-chain on behalf of users.

Practical options:

1. Accept a clean reset when on-chain follows launch.
2. Keep the old DB follows visible for a temporary transition window, but make new writes on-chain only.
3. Offer a user-driven migration UI that reads old follows and asks the user to re-follow on-chain in batches.

Recommendation:

- launch with option 3 if time allows
- otherwise accept a reset and keep the rollout simple

---

## Contract Testing

Add Foundry coverage for:

- follow succeeds
- self-follow reverts
- duplicate follow reverts
- unfollow succeeds
- unfollow missing edge reverts
- upgrade preserves follow graph state if the contract is UUPS

Only add pagination and swap-and-pop tests if you choose the optional v2 enumerable design.

---

## Frontend Testing

Add coverage for:

- follow button submits a transaction instead of a signed message
- optimistic follow state reconciles with on-chain result
- following-only filters still work on leaderboard, vote, and public profile pages
- follower/following counts update after confirmed transactions

---

## Rollout Order

1. Ship the profile unification first.
2. Add `FollowRegistry` and Foundry tests.
3. Add Ponder indexing and read APIs.
4. Switch `useFollowedProfiles` to on-chain reads/writes.
5. Remove DB-backed follow APIs and schema.
6. Decide whether to keep a temporary migration UI for legacy follows.

---

## Mainnet Readiness Gate

Do not launch on-chain follows unless all of the following are true:

- contract storage layout is reviewed
- the storage design is explicitly chosen:
  - minimal mapping-only v1, or
  - enumerable `following[]` v2
- if enumerable `following[]` is chosen, pagination behavior is tested
- Ponder indexing is live and stable
- the UI no longer depends on `followed_profiles`
- the migration/reset decision is explicit

---

## Why this is the gas-efficient choice

The EVM cost model strongly favors avoiding unnecessary storage writes:

- a new storage slot written from zero to non-zero is expensive
- cold storage accesses are extra expensive on first touch in a transaction
- storage clears no longer refund enough gas to justify writing duplicate state and deleting it later

That means the biggest optimization is architectural:

- do not write the same follow edge into multiple arrays, counters, and reverse indexes unless on-chain consumers truly need them

References:

- Solidity storage layout: https://docs.soliditylang.org/en/latest/internals/layout_in_storage.html
- Solidity mappings are not iterable: https://docs.soliditylang.org/en/latest/types.html#mapping-types
- EIP-2200 `SSTORE` metering: https://eips.ethereum.org/EIPS/eip-2200
- EIP-2929 cold storage access costs: https://eips.ethereum.org/EIPS/eip-2929
- EIP-3529 reduced refunds: https://eips.ethereum.org/EIPS/eip-3529
- OpenZeppelin `EnumerableSet` notes: https://docs.openzeppelin.com/contracts/5.x/api/utils#EnumerableSet
