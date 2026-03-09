# Self-Reveal Fallback Integration Plan

Status: Proposed  
Last updated: 2026-03-09

## Summary

This document proposes a low-risk, user-hidden backup flow that lets a voter reveal their own vote if they do not want to rely on the default keeper path.

The recommendation is:

- keep the current tlock-based automatic reveal flow as the default UX
- add a small, low-prominence `Reveal my vote` link near the existing cREP voting status UI
- send users to a dedicated fallback page that performs local post-epoch decryption from the on-chain ciphertext and submits the existing `revealVoteByCommitKey()` transaction directly from the connected wallet
- avoid storing vote secrets in `localStorage` by default
- avoid new contract functions, relayers, meta-transactions, or delegated reveal signatures in v1

This improves liveness and user control without changing protocol semantics or adding new trust assumptions.

## Goals

- Preserve the current "commit once, keeper reveals automatically" happy path.
- Give users an explicit fallback if they do not trust the keeper or the keeper appears delayed.
- Avoid introducing new contract-level risk before mainnet.
- Avoid putting `(isUp, salt)` into browser storage by default.
- Keep the backup flow mostly hidden and only show it when relevant.

## Non-Goals

- This does not solve the ciphertext-binding trust gap in `commitVote()`.
- This does not redesign round economics or settlement rules.
- This does not introduce delegated reveal signatures or relayer infrastructure in v1.
- This does not replace the keeper as the primary reveal path.

## Current State

The protocol already supports self-reveal.

- `revealVoteByCommitKey()` in `packages/foundry/contracts/RoundVotingEngine.sol` is permissionless.
- The keeper uses the same public function after decrypting ciphertext off-chain.
- The frontend does not currently expose a production manual reveal flow.

This means the missing piece is primarily a product integration, not a protocol rewrite.

## Recommended v1 Design

### User Experience

The fallback should be discoverable only when it is relevant.

- Do not add a new top-level navigation item.
- Add a small secondary link next to the existing voting-stake status in `packages/nextjs/components/scaffold-eth/RainbowKitCustomConnectButton/AddressInfoDropdown.tsx`.
- Show the link only when:
  - the connected wallet has unrevealed votes, and
  - at least one vote is revealable now or is close enough to reveal that the user may care

Suggested copy:

- `Reveal my vote`
- helper text on the destination page: `Advanced fallback if automatic reveal seems delayed.`

### Route

Add a hidden route, for example:

- `/vote/reveal`

Requirements:

- wallet connection required
- no indexable navigation entry
- no broad promotional copy
- route can be opened directly from the small wallet-status link

### Data Flow

Use existing indexed and on-chain data. Do not add a server endpoint.

1. Read the user's open-round unrevealed votes from Ponder using the existing `/votes` path.
2. For each candidate vote:
   - read `voterCommitHash(contentId, roundId, voter)` from `RoundVotingEngine`
   - compute `commitKey = keccak256(abi.encodePacked(voter, commitHash))`
   - read `getCommit(contentId, roundId, commitKey)` to obtain:
     - `ciphertext`
     - `revealableAfter`
     - `revealed`
3. If `block.timestamp < revealableAfter`, mark the vote as not yet revealable.
4. If revealable, decrypt the ciphertext locally in the browser using the same drand/tlock flow used for vote creation and keeper decryption.
5. Submit `revealVoteByCommitKey(contentId, roundId, commitKey, isUp, salt)` directly from the user's connected wallet.

This keeps all sensitive reveal material local to the browser session and avoids any backend trust.

## Why This Design

### No New Contract Surface

The safest near-term option is to reuse the existing protocol path.

Benefits:

- no ABI changes
- no upgrade risk in `RoundVotingEngine`
- no new signature replay or relayer abuse surface
- no reward-accounting or settlement changes

### No Default Secret Persistence

Do not store `(isUp, salt)` in `localStorage` by default.

Reason:

- OWASP's HTML5 Security Cheat Sheet recommends avoiding sensitive data in local storage because one XSS flaw can expose all of it.
- The current app already has a strict CSP, but the safer design is to avoid long-lived browser-stored reveal secrets unless there is a strong need.

Instead:

- derive reveal data on demand by decrypting the on-chain ciphertext after `revealableAfter`
- keep secrets in memory only for the current reveal session

### No Relay or Meta-Transaction in v1

Do not add `revealVoteBySig(...)`, ERC-2771, or a trusted relayer in the first version.

Reason:

- EIP-712 authorization flows require careful replay, nonce, and deadline handling
- ERC-2771 integrations have a materially larger review surface
- this fallback does not need them because the user already has a connected wallet

The first version should optimize for minimal new risk, not maximal convenience.

## Detailed Product Plan

### Phase 1: Hidden Fallback UI

#### Wallet Status Entry Point

Update `AddressInfoDropdown` so that when `hasPendingReveals` is true, the voting status line includes a subtle text link.

Suggested behavior:

- if `earliestReveal` exists: show only countdown
- if `hasPendingReveals` is true: show `pending reveal · Reveal my vote`

This keeps the entry point near the user's cREP voting stake without making it a primary workflow.

#### Reveal Page

Create a dedicated client page with:

- connected wallet summary
- short explanation that the keeper remains the normal path
- table of revealable unrevealed votes
- per-row actions:
  - `Decrypt locally`
  - `Reveal`
- optional `Reveal all ready votes` action

Each row should show:

- content identifier / title if available
- round id
- stake
- revealable time
- current status:
  - `waiting for epoch end`
  - `ready to decrypt`
  - `revealed`
  - `already handled by keeper`

#### Post-Reveal Behavior

After a successful reveal:

- refresh the vote list
- treat `AlreadyRevealed` as benign, because the keeper may have raced the same reveal
- do not auto-call `settleRound()` in v1

The page is a reveal fallback, not a full round-management console.

### Phase 2: Optional Recovery Export

This should be explicitly deferred unless real usage shows it is needed.

If later added, it should be:

- opt-in only
- clearly labeled advanced
- export-based, not default background persistence
- ideally encrypted before download

Do not auto-persist reveal packages in browser storage as the default behavior.

## Technical Plan

### Frontend Hooks

Add a dedicated hook, for example:

- `packages/nextjs/hooks/useManualReveal.ts`

Responsibilities:

- fetch unrevealed votes for the connected address
- call `voterCommitHash(...)`
- derive `commitKey`
- read `getCommit(...)`
- decrypt ciphertext locally after epoch end
- submit `revealVoteByCommitKey(...)`
- normalize expected race conditions such as `AlreadyRevealed`

### Reuse Existing Pieces

Use:

- `packages/nextjs/hooks/useActiveVotesWithDeadlines.ts`
- `packages/nextjs/utils/tlock.ts`
- `packages/contracts/src/abis/RoundVotingEngineAbi.ts`

Add browser-safe local decryption alongside the current encryption helper rather than inventing a separate cryptographic path.

### CSP / Network

`packages/nextjs/next.config.ts` already permits drand endpoints in `connect-src`.

That means the fallback page should not require CSP changes if it uses the same drand infrastructure as the existing vote-encryption flow.

### No Backend Endpoint

Do not add:

- `/api/reveal`
- server-stored salts
- server-triggered reveal jobs

The user should reveal directly from their own wallet using the existing public contract function.

## Security Review

### New Risks Avoided

The recommended design intentionally avoids several new risks:

- no contract upgrade risk
- no new replayable signature authorization
- no relayer trust assumptions
- no long-lived secret persistence by default
- no server-side custody of reveal material

### Residual Risks

#### Browser XSS

If the frontend had an XSS bug, in-memory reveal data for the current page session could still be exposed.

Mitigation:

- keep the page hidden and specialized
- do not store reveal secrets in `localStorage`
- keep the strict CSP

#### drand Dependency

This fallback still depends on drand/tlock decryption unless the user retained the original reveal data themselves.

That is acceptable because the purpose of this feature is to avoid reliance on the default keeper, not to replace drand.

#### Keeper Race Conditions

The keeper may reveal the vote between local decryption and transaction submission.

Mitigation:

- treat `AlreadyRevealed` as a successful terminal outcome in the UI

#### User Confusion

If the fallback is too visible, users may believe it is required.

Mitigation:

- hide the route from main navigation
- only expose the small link when the account actually has pending reveals
- make the page copy explicit that this is an advanced backup path

## Testing Plan

### Frontend / Hook Tests

Add unit coverage for:

- deriving `commitKey` from `voterCommitHash`
- handling not-yet-revealable votes
- local decryption success and failure
- benign handling of `AlreadyRevealed`

### E2E Tests

Add at least one Playwright or integration scenario:

1. commit a vote
2. stop or bypass the keeper
3. wait until the vote becomes revealable
4. open the hidden reveal page from the wallet status link
5. locally decrypt and reveal the vote
6. verify the vote is now revealed on-chain / indexed

### Security Regression Checks

Confirm:

- no new API routes were added
- no reveal secrets are written to `localStorage` by default
- no new CSP relaxations were introduced

## Documentation Plan

### Update Public Docs for Accuracy

Current whitepaper copy in `packages/nextjs/scripts/whitepaper/content.ts` states that the frontend already persists reveal data in `localStorage` and offers a manual reveal option.

That should be corrected now because it overstates the current product.

Replace it with language that says:

- protocol-level self-reveal is already possible
- the current default UX is keeper-driven automatic reveal
- a dedicated fallback page is the planned product integration
- the preferred design avoids default local-storage persistence of reveal secrets

### Readiness Tracking

Update `docs/MAINNET_READINESS.md` to reference this plan as the chosen near-term liveness and user-control mitigation.

Important:

- this plan does not close the ciphertext-binding item by itself
- the readiness item should remain open until either the trust model is documented sufficiently or the protocol is redesigned

## Effort Estimate

Because this plan avoids contract changes, the scope is moderate.

Estimated effort:

- hidden route + hook + wallet-status entry point: 2-3 days
- local decryption integration and UI polish: 1-2 days
- tests and docs: 1-2 days

Total:

- roughly 1 week of focused work

This is significantly cheaper and lower risk than:

- optimistic reveal + challenge
- classic mandatory self-reveal redesign
- keeper-attested reveals
- zk reveal verification

## Follow-Up Work Not Included Here

This fallback should be paired with separate economic work if the goal is to reduce selective non-reveal incentives:

- commit-count-based cancellation rules
- stronger penalties for unrevealed votes
- optional small loser rebate for revealed losing votes

That is a separate protocol decision and should not be bundled into this low-risk UI fallback.

## Sources

- `packages/foundry/contracts/RoundVotingEngine.sol`
- `packages/keeper/src/keeper.ts`
- `packages/nextjs/hooks/useRoundVote.ts`
- `packages/nextjs/hooks/useActiveVotesWithDeadlines.ts`
- `packages/nextjs/components/scaffold-eth/RainbowKitCustomConnectButton/AddressInfoDropdown.tsx`
- OWASP HTML5 Security Cheat Sheet: <https://cheatsheetseries.owasp.org/cheatsheets/HTML5_Security_Cheat_Sheet.html>
- ENS commit-reveal reference: <https://docs.ens.domains/registry/eth/>
- Ethereum Research on last-revealer attacks: <https://ethresear.ch/t/limiting-last-revealer-attacks-in-beacon-chain-randomness/3705>
- EIP-712 security considerations: <https://eips.ethereum.org/EIPS/eip-712>
