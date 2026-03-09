# On-Chain Follows Plan

Status: **Draft** | Last updated: 2026-03-09

This document covers the next step after making `ProfileRegistry` the first-class profile source of truth: moving the follow graph on-chain.

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

---

## Target Contract Surface

Add a new upgradeable registry, for example:

- `packages/foundry/contracts/FollowRegistry.sol`
- `packages/foundry/contracts/interfaces/IFollowRegistry.sol`

### Core state

- `mapping(address => mapping(address => bool)) private _isFollowing;`
- `mapping(address => address[]) private _following;`
- `mapping(address => mapping(address => uint256)) private _followingIndexPlusOne;`
- `mapping(address => address[]) private _followers;`
- `mapping(address => mapping(address => uint256)) private _followersIndexPlusOne;`
- `mapping(address => uint256) public followingCount;`
- `mapping(address => uint256) public followerCount;`

The index-plus-one mappings are needed for O(1) unfollow via swap-and-pop.

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
- `function getFollowingCount(address follower) external view returns (uint256);`
- `function getFollowerCount(address target) external view returns (uint256);`
- `function getFollowingPaginated(address follower, uint256 offset, uint256 limit) external view returns (address[] memory addresses, uint256 total);`
- `function getFollowersPaginated(address target, uint256 offset, uint256 limit) external view returns (address[] memory addresses, uint256 total);`

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

- read `isFollowing` / `getFollowingPaginated` via Ponder-first or RPC fallback
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
- counts update correctly
- paginated follower/following reads work
- swap-and-pop removal preserves set integrity
- upgrade preserves follow graph state if the contract is UUPS

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
- follow/unfollow pagination behavior is tested
- Ponder indexing is live and stable
- the UI no longer depends on `followed_profiles`
- the migration/reset decision is explicit
