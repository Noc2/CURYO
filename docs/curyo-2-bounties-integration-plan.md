# Curyo 2.0 Bountied Questions Integration Plan

Date: 2026-04-15

Status: Product, contract, frontend, indexing, and documentation integration plan. This is not legal advice.

## Purpose

This plan turns the Curyo 2.0 bounty research into an implementation roadmap. It assumes the next Curyo version will redeploy contracts instead of upgrading the current deployment in place. That lets the protocol clean up the content model for bountied questions while reusing as much of the current frontend, cREP voting, commit-reveal, indexing, and documentation structure as possible.

The target product is not a prediction market. Curyo 2.0 should pay verified humans for question-scoped review participation. Stablecoin bounties should not create tradable yes/no positions, outcome-weighted stablecoin rewards, odds, or a winner-takes-pot flow.

## Core Decisions

- Redeploy contracts for Curyo 2.0, so contract names, storage layout, and event schemas can be adjusted intentionally.
- Keep cREP as the outcome-risk layer: voters can still lose cREP when they vote on the losing side of a settled round.
- Add stablecoin bounties as a separate question-scoped escrow layer.
- Pay stablecoin bounty rewards for valid participation only at launch. Do not add a stablecoin coherence, correctness, or winning-side bonus.
- Fund only specific questions. Do not route bounty funds into the protocol-wide Participation Reward Pool.
- Use Celo USDC as the only launch settlement asset. Do not support USDT initially.
- Show bounty amounts as USD in primary product surfaces, with receipts and details disclosing that funds are settled in USDC on Celo.
- Keep question results framed as community judgment or confidence, not guaranteed truth.

## Implementation Phases

1. Define the Curyo 2.0 product and data model.
2. Implement the redeployed contract surface.
3. Extend Ponder, API routes, and generated ABIs.
4. Reuse and refactor frontend submit, voting, bounty funding, and reward claiming flows.
5. Update docs, READMEs, whitepaper content, tests, and deployment playbooks.
6. Launch on testnet with monitoring, pause controls, and no hard bounty caps.

## Product Model

Curyo 2.0 should treat each submitted item as a question with optional supporting content, rather than a platform-bound content URL.

Recommended question fields:

- Question: the binary judgment voters answer with thumbs up or thumbs down.
- Link: an optional source, listing, image, YouTube video, product page, hotel page, documentation page, or other evidence URL.
- Category: the review domain or question frame, not a source-platform registry entry.
- Description: context, review instructions, conflict disclosures, and criteria for interpreting the question.
- Tags: optional subcategories or routing hints for discovery.
- Bounty: optional USD-denominated Celo USDC funding attached during submission.

Text-only subjective questions should be valid. A link should be optional, not required. Image links and YouTube links should be supported first for media-backed questions; broader video uploads or arbitrary hosted media should wait for a separate moderation and storage review.

The submitter should understand that Curyo reports stake-backed voter judgment at vote time. For subjective use cases like product ratings, hotel ratings, aesthetics, trust, or usefulness, that is the core value. For future events or fact-based outcomes, submitter copy should clarify that Curyo is not guaranteeing future correctness and that prediction markets or oracle systems may be better tools.

## Categories

Curyo 2.0 should launch with governance-created categories. The first deployment should seed a useful default category set so the product is immediately usable without requiring users to create categories during onboarding.

Recommended default categories:

- Products.
- Hotels and travel.
- Restaurants and local places.
- Design and aesthetics.
- Apps and websites.
- AI answers.
- Documentation and developer help.
- Media and images.
- Trust and safety.
- General opinion.

Later governance can add, rename, pause, or retire categories based on actual demand and moderation load.

## USD-First Bounty UX

Prediction-market products often make the primary experience feel dollar-denominated while settlement details live one layer deeper. Curyo should borrow that clarity without copying prediction-market mechanics.

Launch UX rules:

- Use `$` labels in high-level product surfaces: `$125 bounty`, `Add $50`, `Claim $3.25`.
- Disclose exact settlement in details, receipts, exports, and support surfaces: `125 USDC on Celo`.
- Do not add an internal USD account balance at launch.
- Do not add swaps or multi-token routing at launch.
- Do not call USDC bank USD. Product copy can use dollar labels, but docs and receipts should make the USDC settlement asset clear.
- Keep all contract accounting in USDC units and all legal/tax records token-specific.

Reference patterns: [Polymarket positions](https://docs.polymarket.com/concepts/positions-tokens), [Limitless docs](https://docs.limitless.exchange/), and [Kalshi orderbook API](https://docs.kalshi.com/api-reference/market/get-market-orderbook).

## Submit Flow

The current `/submit` route can remain the entry point, but the form should change from platform/content submission to question submission.

Recommended changes:

- Rename the visible flow from "Submit Content" to "Submit Question" or similar product copy.
- Replace the title field with a question field, while preserving existing validation patterns for length and required content.
- Keep the URL/link input as optional, but remove approved-platform domain matching from the user journey.
- Keep description and category selection, but reinterpret category as the review domain or question frame.
- Remove the Platform tab from `/submit#category`; platform onboarding should not be part of the first Curyo 2.0 submit flow.
- Consider retaining frontend registration elsewhere if it remains part of the protocol economy.
- Keep Voter ID gating, terms acceptance, preview/reservation, transaction status, and post-submit routing patterns.
- Add an optional "Add bounty" step or panel after the question details are valid.

The optional bounty panel should support:

- Token: fixed to Celo USDC at launch. Do not show a USDT option in v1.
- Amount: entered and displayed as USD, then submitted as USDC smallest units.
- Required voters: minimum number of valid revealed voters before the bounty can pay. Protocol minimum is 3.
- Required settled rounds: number of settled question rounds that must complete before payout unlocks. Protocol minimum is 1.
- Refund/expiry expectation: short copy explaining when funds are refundable or claimable.

The default UI preset should be stronger than the protocol minimum. A sensible first default is 5 required voters and 2 settled rounds, with lower custom values allowed down to 3 voters and 1 settled round. Higher-value bounties should show product guidance nudging submitters toward more voters and more rounds, without enforcing a hard bounty cap.

Question creation and bounty funding can be two transactions at launch:

1. Submit the question.
2. Approve and fund the bounty.

That avoids making the question submit transaction depend on ERC20 allowance state. The UI can still make it feel like one flow by taking the user directly into the bounty funding step after the question is created.

## Frontend Reuse

Most of the current frontend should be reusable with narrower changes:

- Reuse the submit form shell, Voter ID checks, terms acceptance, URL input, validation toasts, and transaction lifecycle UI in `ContentSubmissionSection`.
- Reuse feed cards and embedded link previews for linked evidence.
- Reuse current voting controls, commit-reveal status, round timers, and cREP stake controls.
- Reuse claim and reward surfaces, but add a stablecoin bounty reward type distinct from cREP claims.
- Reuse deployed-contract config patterns, generated ABIs, and typed contract hooks after the new contracts are added.

Areas that should change:

- Remove submit-time platform/category domain enforcement.
- Rename content-centric copy where it confuses question semantics.
- Update API and TypeScript models so feed items expose question text, link, description, category/frame, and bounty summary.
- Keep internal `contentId` naming only if it reduces churn; otherwise use `questionId` at new API boundaries and contract events.

## Feed Rendering

The feed should evolve from the current media-card emphasis toward a Twitter-like question feed that can handle text-first submissions gracefully.

Recommended rendering rules:

- If the question has a supported image link, render the image preview.
- If the question has a supported YouTube link, render the YouTube preview.
- If the question has a regular link with available metadata, render a compact link preview.
- If the question has no image or media preview, render the description text in the body area instead of showing an empty image placeholder.
- Keep the question itself as the primary text, with description/context below it.
- Keep bounty badges, category, rating, round status, and vote actions visible without making text-only cards feel broken or sparse.
- Make text-only cards layout-stable on mobile and dense laptop feed surfaces.

## Vote Card Changes

Voting surfaces should make bounty funding visible without crowding the dense voting UI.

Recommended changes:

- Show a compact bounty badge on each voting card, for example "$125 bounty".
- Place the badge near the title, current rating, or round status so voters see why a question is prioritized.
- Do not let the badge resize the card between loading and loaded states; reserve stable space for it.
- In the existing "more" or details surface, add an "Add bounty" action.
- The "Add bounty" action should open a modal with USD amount, required voters, and required settled rounds.
- The modal should hide token selection at launch and state that bounties are funded and paid in USDC on Celo.
- The modal should explain that stablecoin rewards are participation-only and question-scoped.
- The modal should surface USDC allowance, approval, funding, and failure states separately.

Expanded details, receipts, and claim rows should disclose the exact token, for example "Backed by 125 USDC on Celo." Primary feed and card copy can use "$" to reduce token-specific clutter.

The feed should still rank content by the protocol's normal discovery logic, but bounty size can become an additional ranking or filter signal once abuse controls are in place.

## Reward UX

Stablecoin bounty rewards should be shown separately from cREP rewards.

Recommended changes:

- Add claimable USDC bounty rows to the rewards or profile claim area.
- Show the source question, token, amount, and claim status.
- Use USD as the primary label, with USDC on Celo shown in details and receipts.
- Explain that stablecoin reward eligibility is based on valid reveal participation, not whether the voter chose the settled side.
- Preserve cREP outcome-risk messaging so voters understand that a wrong cREP vote can still reduce their future participation power.

## Contract Architecture

Because Curyo 2.0 contracts will be redeployed, the contract surface can use question-first names without preserving old storage layout. The implementation should still preserve the proven separation between submission, voting, and pull-based reward claims.

Recommended contracts:

- `QuestionRegistry`: replacement or renamed evolution of `ContentRegistry`. Stores question metadata, linked content, description, category/frame, submitter, lifecycle status, and rating state.
- `RoundVotingEngine`: reused as the cREP judgment layer with minimal semantic changes. It still handles commit, reveal, settlement, cREP stake accounting, rating updates, cancelled rounds, tied rounds, and reveal-failed rounds.
- `QuestionBountyEscrow`: new stablecoin custody contract for question-scoped bounty deposits, top-ups, token allowlist config, refund rules, and pause controls.
- `QuestionBountyDistributor`: optional separate pull-claim contract. This can be folded into `QuestionBountyEscrow` if bytecode size is manageable, but keeping it separate mirrors the current `RoundRewardDistributor` pattern.
- `ProtocolConfig`: add bounty contract addresses only where shared address lookup is useful. Avoid making the voting engine responsible for stablecoin custody.

Stablecoin transfer logic should not be added to `RoundVotingEngine.settleRound`. Settlement is already the highest-risk path and the current codebase already extracts settlement accounting into libraries to keep runtime size under control. The stablecoin layer should read settled round state and voter reveal state, then let eligible voters claim through a pull path.

## Bounty Contract Model

Each bounty should be scoped to one question. Top-ups with different terms should create a new bounty rather than mutating the economic rules of an existing bounty.

Recommended bounty fields:

- `questionId` or `contentId`: the funded question.
- `token`: Celo USDC address at launch. The field can stay in the contract for future allowlisted tokens, but only USDC should be enabled in v1.
- `funder`: original funder.
- `amount`: total received token amount credited to the bounty.
- `remainingAmount`: unclaimed or refundable token amount.
- `requiredVoters`: minimum valid revealed voters for a round to qualify. Must be at least 3.
- `requiredSettledRounds`: number of qualifying settled rounds funded by the bounty. Must be at least 1.
- `startRoundId`: first round eligible for this bounty.
- `expiry`: deadline after which unmet bounties can be refunded.
- `refundMode`: v1 should prefer explicit refund on expiry or cancellation, not automatic rollover.
- `eligibilityConfigVersion`: Self.xyz and jurisdiction/sanctions policy version required for claims.
- `paused` or global pause state: separate funding pause from claim/refund availability.

Recommended functions:

- `setTokenAllowed(address token, bool allowed, uint8 decimals, string symbol)`.
- `createBounty(uint256 questionId, address token, uint256 amount, uint32 requiredVoters, uint32 requiredSettledRounds, uint64 expiry)`.
- `addBounty(uint256 questionId, address token, uint256 amount, uint32 requiredVoters, uint32 requiredSettledRounds, uint64 expiry)`.
- `claimBountyReward(uint256 bountyId, uint256 roundId)`.
- `refundExpiredBounty(uint256 bountyId)`.
- `pauseFunding(bool paused)`.
- `pauseClaims(bool paused)`, only if legal or emergency review requires it. Prefer keeping claims and refunds available when possible.

If batched claims are added, they should enforce a small maximum batch length. Do not add an unbounded loop over rounds, voters, or bounties.

Recommended events:

- `BountyCreated`.
- `BountyFunded`.
- `BountyRoundQualified`.
- `BountyRewardClaimed`.
- `BountyRefunded`.
- `BountyTokenAllowed`.
- `BountyFundingPaused`.
- `BountyClaimsPaused`.

## Bounty Payout Rules

The launch payout model should be deliberately simple:

1. A bounty starts at the next round after funding is finalized. It should not apply retroactively to a round that already has commits.
2. A round qualifies only if it reaches the normal cREP settlement path, has at least `requiredVoters` revealed votes, and is at or after the bounty start round.
3. Tied, cancelled, and reveal-failed rounds do not qualify at launch.
4. Each qualifying round receives `amount / requiredSettledRounds`, with the final qualifying round receiving dust.
5. Every voter who committed and revealed in that qualifying round can claim an equal share of that round allocation.
6. Vote direction does not matter.
7. Stablecoin rewards never depend on winning side at launch.
8. cREP rewards, losses, rebates, and participation rewards remain governed by the existing round settlement model.

This per-round model avoids unbounded on-chain iteration and avoids needing a unique-voter set across many rounds in v1. `claimBountyReward(bountyId, roundId)` can verify the caller's revealed commit through the voting engine and the stored round state, then transfer the user's share if it has not already been claimed.

Claim identity should resolve to the underlying Voter ID, not just the current wallet address. The claim key should be `claimed[bountyId][roundId][voterId]` or equivalent, so a voter cannot claim twice by rotating delegated wallets. The voting engine should snapshot the Voter ID used for the eligible commit or reveal. A delegated wallet should be able to claim only if it can prove it is authorized for the same Voter ID that produced the eligible vote, or if the Voter ID holder explicitly signs a payout authorization.

Recommended refund and cancellation behavior:

- If the question is cancelled before the bounty qualifies, the funder can refund.
- If expiry passes before enough qualifying rounds complete, the funder can refund the unallocated remainder.
- If a round qualifies, its allocated rewards stay claimable by eligible voters.
- Do not auto-roll bounties into future questions or the global Participation Reward Pool.
- Dust should remain with the final claimant for a qualifying round, or be sweepable only after a long governance-controlled timeout.

## USDC Support And USD Display

Curyo 2.0 should launch with Celo USDC as the only stablecoin bounty asset. USDT should not be supported initially.

The product should still feel USD-native in normal use:

- Feed, vote cards, submit forms, and bounty modals should show primary amounts as `$125 bounty`, `Add $50`, or `Claim $3.25`.
- Details, receipts, exports, and support surfaces should disclose `125 USDC on Celo`.
- Contract and indexer accounting should always use exact USDC token units.
- If USDC is paused, depegs materially, or becomes unavailable, the UI should stop treating the balance as a generic `$` amount and show exact token state until governance chooses a new policy.

The current Celo token contract docs list these token addresses:

| Network | Token | Address |
| --- | --- | --- |
| Celo Mainnet | USDC | `0xcebA9300f2b948710d2653dD7B07f33A8B32118C` |
| Celo Sepolia | USDC | `0x01C5C0122039549AD1493B8220cABEdD739BC44E` |

Source: [Celo token contracts](https://docs.celo.org/tooling/contracts/token-contracts).

Implementation rules:

- Use the Celo USDC ERC20 token addresses for deposits and claims. Do not use Celo fee-currency adapter addresses for bounty custody.
- Use OpenZeppelin `SafeERC20` for all token transfers.
- Store all bounty accounting in the token's smallest unit.
- Keep token decimals for display and validation, not for core accounting.
- Measure the actual received balance delta on deposit and credit the actual received amount.
- Do not support USDT, arbitrary ERC20 tokens, fee-on-transfer tokens, rebasing tokens, bridged lookalike tokens, or user-provided token addresses in v1.
- Add a local USDC mock token for Anvil and Foundry tests.
- Keep future USDT or multi-token support behind a separate product, legal, and governance decision.

Source: [OpenZeppelin SafeERC20 docs](https://docs.openzeppelin.com/contracts/5.x/api/token/erc20#SafeERC20).

## Eligibility And Compliance Controls

Stablecoin funding and claims should require a bounty-specific eligibility gate.

Recommended controls:

- Require Voter ID for voting, and require bounty claim eligibility at claim time.
- Version the Self.xyz eligibility configuration so bounty participation can require a newer OFAC and excluded-country policy than older Voter IDs.
- Apply stablecoin eligibility checks to bounty funding and bounty claims.
- Add contract pause controls for new funding and claim emergencies, with claims/refunds kept available by default where possible.
- Do not enforce hard bounty caps at launch. Use eligibility checks, public bounty terms, monitoring, and emergency pause controls instead.
- Preserve transaction records needed for user tax reporting: token, amount, date, question, and claim transaction.
- Resolve bounty claims through the underlying Voter ID holder so delegated wallets remain safe without enabling duplicate claims across wallets.

Self.xyz should be treated as an important control layer, not a complete stablecoin compliance answer. Wallet screening, issuer controls, country rules, and legal review still need their own workstream.

## Security Review Notes

This section captures security issues found during plan review and turns them into implementation requirements.

### Bounty Eligibility Snapshot

The bounty should not apply to a round that already has commits. If a bounty can be attached to the current round, funders and voters can disagree about whether earlier voters were eligible, and funders can selectively fund after observing round activity. The contract should set `startRoundId` to the next round after the bounty deposit is finalized.

Round qualification should be snapshotted once:

- Store the round allocation.
- Store the eligible revealed voter count.
- Store the qualifying round state.
- Store whether the round has already been qualified for that bounty.

Claims should read the snapshot. They should not recompute a mutable denominator on every claim.

### Voter ID Claim Safety

Claims should key off the Voter ID that was eligible during the vote, not just `msg.sender`.

Requirements:

- Snapshot the Voter ID at commit or reveal time.
- Use `claimed[bountyId][roundId][voterId]` or equivalent.
- Reject claims if the caller cannot prove current authority for the snapshotted Voter ID.
- Bind any off-chain payout authorization to chain ID, escrow contract, bounty ID, round ID, Voter ID, payout address, nonce, and deadline.
- Reject replayed authorizations.
- Test delegation changes between commit, reveal, settlement, and claim.

### Self-Funding And Conflict Exclusion

A question submitter, bounty funder, and Voter IDs associated with them should not be eligible to claim that question's bounty unless governance deliberately enables self-review for a category. Otherwise a funder can recycle their own bounty through controlled Voter IDs and distort feed incentives or metrics.

The launch rule should be:

- Submitter Voter ID cannot claim its own question bounty.
- Funder Voter ID cannot claim the bounty it funded.
- If multiple funders add separate bounties to the same question, each funder is excluded only from the bounty they funded unless a stricter category policy applies.
- The UI should disclose funder and submitter conflicts where possible.

### Reentrancy, State Ordering, And Refund Races

The escrow must follow checks-effects-interactions:

- Validate bounty, round, claim authority, eligibility, and pause state first.
- Mark the Voter ID as claimed and update claimed totals before transferring USDC.
- Use `nonReentrant` on deposit, claim, refund, and sweep functions.
- Keep claims pull-based; do not push payments during settlement.
- Ensure refund functions cannot withdraw funds already allocated to qualified rounds.
- Separate unallocated refundable amount from allocated claimable amount.
- Do not let funding pause block already-qualified claims or valid refunds unless an emergency legal pause explicitly requires it.

Sources: [Solidity security considerations](https://docs.solidity.org/en/latest/security-considerations.html), [OpenZeppelin security utilities](https://docs.openzeppelin.com/contracts/5.x/api/utils#ReentrancyGuard), and [OpenZeppelin SafeERC20](https://docs.openzeppelin.com/contracts/5.x/api/token/erc20#SafeERC20).

### No Hard Bounty Caps

No hard bounty caps is a product decision, but it increases security and abuse blast radius. The launch plan should compensate without silently reintroducing a cap:

- Show stronger warnings and recommended parameters for larger bounties.
- Monitor large bounty creation, rapid repeated funding, and funder/voter clustering.
- Keep emergency pause for new funding.
- Keep token allowlist to Celo USDC only.
- Preserve full on-chain and indexed records for funder, submitter, Voter ID claim key, token amount, and question.
- Treat large-bounty categories such as trust and safety, public allegations, or financial claims as moderation-sensitive.

### Media And Link Handling

Text-only questions are safe only if rendered as plain text. Media and link previews add web security risk.

Implementation requirements:

- Render question and description as escaped plain text unless a separately audited markdown renderer is introduced.
- Do not render arbitrary HTML from metadata.
- Do not iframe arbitrary URLs. YouTube embeds should be restricted to recognized YouTube hosts and preferably privacy-enhanced embed URLs.
- Do not server-fetch arbitrary URLs without SSRF controls. If a preview fetcher is needed, block private IP ranges, localhost, link-local addresses, non-HTTP(S) schemes, redirects to blocked destinations, oversized responses, and unexpected content types.
- Do not inline user-controlled SVG as an image preview.
- Set strict content security policy rules for embeds and images.
- Cache only sanitized metadata and avoid storing untrusted preview HTML.

Source: [OWASP SSRF overview](https://owasp.org/www-community/attacks/Server_Side_Request_Forgery).

### Indexer Trust Boundary

Ponder and API responses should improve UX, not become the source of truth for claims. The contract must recompute or verify every claim-critical fact on chain:

- Bounty exists and is funded.
- Round qualifies.
- Voter ID was eligible for the round.
- Claim has not already happened.
- Reward amount is bounded by the escrow's remaining allocated amount.

The UI can display indexed amounts, but the transaction path should tolerate stale or reorged API data and surface contract reverts clearly.

## Ponder And API Plan

Ponder should index bounties directly rather than deriving them ad hoc in the frontend.

Recommended schema additions:

- `question_media`: optional media kind, normalized URL, preview metadata, and render strategy for text-only, image, YouTube, and link-preview cards.
- `bounty`: bounty terms, funding state, token, question/content ID, funder, amount, remaining amount, required voters, required settled rounds, expiry, status.
- `bounty_deposit`: original funding and top-up events.
- `bounty_round`: per-round qualification, round allocation, revealed voter count, claimed count, and claimed amount.
- `bounty_claim`: voter claims by bounty, round, and Voter ID.
- `bounty_refund`: funder refunds and cancelled/expired bounty recovery.
- `bounty_token`: allowlisted token metadata by chain.

Recommended API additions:

- Add active bounty summaries to content/feed items.
- Add media render metadata so cards can choose image preview, YouTube preview, compact link preview, or description text.
- Add exact USDC token amounts so the UI can show USD-primary labels and USDC details.
- Add bounty terms for the More section and modal review screen.
- Add user-specific claimable bounty rewards to existing reward aggregation.
- Add refundability and expiry state for funder views.

Suggested feed item fields:

```ts
type BountySummary = {
  id: string;
  token: `0x${string}`;
  symbol: "USDC";
  usdLabel: string;
  amountRemaining: string;
  activeAmount: string;
  requiredVoters: number;
  requiredSettledRounds: number;
  qualifiedRounds: number;
};
```

Question feed responses should include `activeBounties`, a formatted `totalBountyLabel` such as `$125`, media render metadata, and user-specific `claimableBounties` where available.

## Deployment And Generated Artifacts

The Curyo 2.0 deployment script should deploy the new contract surface in one pass and export all artifacts needed by Next.js, Ponder, keeper, bot, and SDK packages.

Deployment updates:

- Deploy `QuestionRegistry` or updated `ContentRegistry`.
- Deploy `QuestionBountyEscrow` and optional `QuestionBountyDistributor`.
- Wire the voting engine, registry, bounty escrow, reward distributor, participation pool, and protocol config.
- Seed the governance-created default categories in the first deployment.
- Initialize the Celo USDC allowlist address for Celo mainnet and Celo Sepolia.
- Deploy a local mock USDC for Anvil.
- Export ABIs for the new bounty contracts.
- Update generated deployed-contract files and start block metadata.
- Update Ponder env vars and config for the new contracts.
- Update thirdweb contract typing and any sponsored transaction allowlist decisions.

Stablecoin approval and bounty funding should not be sponsored at launch. The existing sponsored/free transaction logic should remain conservative and can continue covering known cREP and registry flows only.

## Implementation Commit Sequence

The implementation should stay split into narrow commits. A recommended sequence:

1. `contracts: introduce question registry model`
   - Rename or evolve content metadata into question/link/description/category/frame.
   - Remove platform-domain coupling from question submission.
   - Allow text-only questions and optional image, YouTube, and link metadata.
   - Seed governance-created default categories during the first deployment.
   - Preserve cREP submitter stake, lifecycle, rating state, and voting engine integration.

2. `contracts: add question bounty escrow`
   - Add Celo USDC escrow, bounty creation, per-round qualification, pull-based claims, refunds, pause controls, and events.
   - Enforce `requiredVoters >= 3` and `requiredSettledRounds >= 1`.
   - Start bounties at the next round after funding finalizes, never retroactively on an active round.
   - Snapshot qualified round allocation and eligible revealed voter count before claims.
   - Key claims by underlying Voter ID so delegated wallets cannot double-claim.
   - Exclude submitter and funder Voter IDs from claiming their own bounty unless a future category policy explicitly allows it.
   - Add Foundry unit tests for token allowlist, deposit accounting, claim rules, Voter ID claim identity, self-funding exclusion, and refund paths.

3. `contracts: wire curyo 2 deployment`
   - Update deployment scripts, local mocks, protocol config wiring, ABI export, deployed contract metadata, and contract-size checks.
   - Add Celo mainnet and Celo Sepolia USDC allowlist initialization.

4. `ponder: index question bounties`
   - Add bounty schema tables, event handlers, contract config, tests, and API fields.
   - Include active bounty summaries and user claim state in feed/reward responses.

5. `nextjs: convert submit flow to questions`
   - Reuse the submit page and form shell.
   - Remove the Platform tab and platform-domain validation.
   - Change fields to question, optional link, category/frame, description, and tags.
   - Support text-only questions plus image and YouTube links initially.
   - Render text as escaped plain text and restrict YouTube embeds to recognized YouTube hosts.

6. `nextjs: add bounty funding UI`
   - Add optional bounty funding after submission.
   - Add USD amount input, required voter input, required settled round input, and USDC approve/deposit flow.
   - Default new bounties to 5 required voters and 2 settled rounds, while allowing custom values down to 3 voters and 1 settled round.

7. `nextjs: show and fund bounties from vote cards`
   - Add compact bounty badges to feed/vote cards.
   - Render text-only feed cards with the description body instead of an empty image area.
   - Render image and YouTube previews when those links are available.
   - Add SSRF and content-type controls to any server-side preview fetcher.
   - Add "Add bounty" in the More section and open the funding modal from there.
   - Add responsive coverage for dense laptop and mobile vote surfaces.

8. `nextjs: add stablecoin bounty claims`
   - Extend claimable reward types and claim-all behavior for USDC bounty participation rewards.
   - Keep cREP and stablecoin rewards visually and semantically separate.

9. `sdk/bot/keeper: expose bounty helpers`
   - Add SDK reads for questions, bounty summaries, and claimable bounty rewards.
   - Add bot support only if automated bounty monitoring is needed.
   - Add keeper support only if bounty qualification snapshots, retries, or repair jobs become necessary.

10. `docs: update curyo 2 documentation`
    - Update READMEs, app docs, legal copy, whitepaper source, and regenerated whitepaper PDF.

## Test Plan

Foundry tests:

- USDC mock deposits.
- Invalid token rejection.
- Actual-received accounting on deposit.
- Bounty creation with required voters and required settled rounds.
- Rejection for bounties below 3 required voters.
- Rejection for bounties below 1 required settled round.
- Bounty starts at the next round after funding finalizes and does not apply to active rounds with existing commits.
- Qualified round snapshot stores allocation and eligible revealed count before claims.
- Multiple bounties on one question.
- Top-ups with distinct terms.
- Claim by revealed winning voter.
- Claim by revealed losing voter.
- Rejection for unrevealed voter.
- Double-claim prevention.
- Double-claim prevention across delegated wallets for the same Voter ID.
- Submitter Voter ID cannot claim its own question bounty.
- Funder Voter ID cannot claim the bounty it funded.
- Tied, cancelled, and reveal-failed rounds not qualifying at launch.
- Expiry refund.
- Question cancellation refund.
- Refund cannot withdraw allocated claimable funds.
- Funding pause and claim/refund behavior.
- Reentrancy-style malicious token mock cannot double-claim or corrupt accounting, even though production token allowlist is Celo USDC only.
- Solvency invariant: escrow token balance must cover remaining claimable and refundable amounts.

Ponder tests:

- Index `BountyCreated`, `BountyFunded`, `BountyRoundQualified`, `BountyRewardClaimed`, `BountyRefunded`, and token allowlist events.
- Rebuild active bounty aggregate after reorg-safe event replay.
- Return USDC amounts and USD labels in feed responses.
- Return user claimable bounty rewards.

Next.js tests:

- Submit question without a bounty.
- Submit text-only subjective question.
- Submit question with image link.
- Submit question with YouTube link.
- Submit question and continue into optional bounty funding.
- Remove platform-domain validation without weakening generic URL safety checks.
- Escape question and description text; do not render untrusted HTML.
- Render bounty badges on vote cards without layout shift.
- Render description text in feed cards when no media preview is present.
- Render image and YouTube previews when media links are present.
- Reject non-YouTube iframe/embed URLs.
- Block unsafe preview URLs, including private IPs, localhost, link-local addresses, non-HTTP(S) schemes, oversized responses, and unexpected content types.
- Open the Add Bounty modal from the More section.
- Handle USDC allowance and deposit.
- Default bounty form to 5 required voters and 2 settled rounds.
- Allow custom bounty values down to 3 voters and 1 settled round.
- Confirm no USDT or generic token selector appears in the launch funding UI.
- Show stablecoin bounty reward claims separately from cREP.

End-to-end tests:

- Submit question, fund USDC bounty, vote, reveal, settle, and claim stablecoin reward.
- Submit a text-only question and verify the feed renders description text instead of an empty image.
- Submit an image link and a YouTube link and verify previews render.
- Submit HTML/script-like text and verify it renders as inert text.
- Verify a voter on the losing cREP side can still claim the stablecoin participation reward after revealing.
- Verify an unrevealed voter cannot claim.
- Verify a delegated wallet can claim only for the underlying eligible Voter ID and cannot double-claim across wallets.
- Verify submitter and funder Voter IDs cannot claim excluded bounties.
- Verify a bounty funded mid-round only starts with the following round.
- Verify required voters and required settled rounds block payout until satisfied.
- Verify refund after expiry or cancellation.
- Check mobile and laptop layouts for bounty badges, More modal, and claim rows.

Suggested validation commands:

- `yarn foundry:compile`
- `yarn foundry:test`
- `yarn workspace @curyo/foundry check:sizes`
- `yarn contracts:check-types`
- `yarn contracts:test`
- `yarn ponder:codegen`
- `yarn workspace @curyo/ponder test`
- `yarn next:test`
- `yarn next:check-types`
- `yarn workspace @curyo/nextjs whitepaper`
- `yarn workspace @curyo/nextjs e2e:ci:lifecycle`

## Documentation And Whitepaper Updates

The implementation should update documentation in the same PR series, not after launch.

Repository docs:

- `README.md`: explain Curyo 2.0 as bountied questions and summarize the new package responsibilities.
- `docs/curyo-2-bounties-research.md`: keep the research memo aligned with final decisions if the plan changes.
- `docs/curyo-2-bounties-integration-plan.md`: update as implementation decisions land.
- `packages/foundry/README.md`: document `QuestionRegistry`, bounty escrow/distributor, Celo USDC allowlist, deployment config, and test commands.
- `packages/ponder/README.md`: document bounty tables, handlers, API fields, and env vars.
- `packages/nextjs/README.md`: document text-only questions, image and YouTube link previews, submit, bounty funding, reward claim, and whitepaper generation flows.
- `packages/sdk/README.md`: document question and bounty helper APIs.
- `packages/bot/README.md`: update only if bots can submit, monitor, or claim bounties.
- `packages/keeper/README.md`: update only if keeper gets bounty qualification or repair duties.

App docs:

- `packages/nextjs/app/docs/how-it-works/page.tsx`: explain question submission, cREP voting, and stablecoin bounty participation rewards.
- `packages/nextjs/app/docs/smart-contracts/page.tsx`: add new contracts, token allowlist, Voter ID based claim model, and pause/refund controls.
- `packages/nextjs/app/docs/tokenomics/page.tsx`: clarify that stablecoin bounties are external question-scoped funds, not cREP emissions or the global Participation Reward Pool.
- `packages/nextjs/app/docs/governance/page.tsx`: document default category creation, token allowlist governance, no hard bounty caps, Self.xyz eligibility config, and emergency controls.
- `packages/nextjs/app/docs/frontend-codes/page.tsx`: update only if frontend fee or registration behavior changes after removing platform submission from `/submit`.
- `packages/nextjs/app/legal/terms/page.tsx`: add stablecoin bounty, prohibited-use, tax-record, and jurisdiction eligibility language for legal review.

Whitepaper:

- Update `packages/nextjs/scripts/whitepaper/summary.ts`.
- Update `packages/nextjs/scripts/whitepaper/sections.ts`.
- Update `packages/nextjs/scripts/whitepaper/content.ts` if metadata, deck, or section assembly changes.
- Update `packages/nextjs/lib/docs/whitepaperContent.test.ts`.
- Regenerate `packages/nextjs/public/curyo-whitepaper.pdf` with `yarn workspace @curyo/nextjs whitepaper`.
- Do not edit the generated PDF by hand.

## Rollout Plan

Recommended rollout:

1. Implement contracts and Foundry tests locally against Anvil.
2. Add Ponder indexing and API responses against local deployment artifacts.
3. Convert submit and vote card UI behind a Curyo 2.0 feature branch or feature flag.
4. Add USDC mocks for local e2e.
5. Deploy to Celo Sepolia with default categories seeded and no hard bounty caps.
6. Run a controlled testnet pilot with known voters and small bounties.
7. Review moderation, compliance, claim, refund, and layout issues.
8. Freeze contract interfaces for audit.
9. Deploy to Celo mainnet with allowlisted Celo USDC only and no hard bounty caps.
10. Keep monitoring bounty sizes, issuer risk, and moderation workload after launch.

Launch guardrails:

- No hard bounty caps.
- No arbitrary ERC20 tokens.
- No USDT at launch.
- No stablecoin coherence bonus.
- No future-event or market-like category promotion.
- No secondary trading or transfer of yes/no exposure.
- Claims are pull-based.
- Claims resolve through the underlying Voter ID.
- Funding and claiming require bounty eligibility checks.
- Emergency pause for new bounty funding.
- Public docs explain that consensus is not truth.

## Settled Product Decisions

- Text-only subjective questions are valid.
- Image links and YouTube links are supported media inputs at launch.
- The feed should render description text when no media preview exists.
- Categories are governance-created, with a default category set seeded in the first deployment.
- Stablecoin bounty rewards use equal per-round splits at launch.
- The protocol minimum is 3 required voters and 1 required settled round.
- The bounty creation UI should default higher than the protocol minimum, initially 5 required voters and 2 settled rounds.
- No hard bounty caps at launch.
- Claims resolve through the underlying Voter ID holder so delegated wallets can be supported safely.
