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
- Support USDC and USDT on Celo from launch through an explicit token allowlist.
- Keep question results framed as community judgment or confidence, not guaranteed truth.

## Implementation Phases

1. Define the Curyo 2.0 product and data model.
2. Implement the redeployed contract surface.
3. Extend Ponder, API routes, and generated ABIs.
4. Reuse and refactor frontend submit, voting, bounty funding, and reward claiming flows.
5. Update docs, READMEs, whitepaper content, tests, and deployment playbooks.
6. Launch on testnet with conservative bounty caps before mainnet.

## Product Model

Curyo 2.0 should treat each submitted item as a question with optional supporting content, rather than a platform-bound content URL.

Recommended question fields:

- Question: the binary judgment voters answer with thumbs up or thumbs down.
- Link: an optional source, listing, image, product page, hotel page, documentation page, or other evidence URL.
- Category: the review domain or question frame, not a source-platform registry entry.
- Description: context, review instructions, conflict disclosures, and criteria for interpreting the question.
- Tags: optional subcategories or routing hints for discovery.
- Bounty: optional USDC or USDT funding attached during submission.

The submitter should understand that Curyo reports stake-backed voter judgment at vote time. For subjective use cases like product ratings, hotel ratings, aesthetics, trust, or usefulness, that is the core value. For future events or fact-based outcomes, submitter copy should clarify that Curyo is not guaranteeing future correctness and that prediction markets or oracle systems may be better tools.

## Submit Flow

The current `/submit` route can remain the entry point, but the form should change from platform/content submission to question submission.

Recommended changes:

- Rename the visible flow from "Submit Content" to "Submit Question" or similar product copy.
- Replace the title field with a question field, while preserving existing validation patterns for length and required content.
- Keep the URL/link input, but remove approved-platform domain matching from the user journey.
- Keep description and category selection, but reinterpret category as the review domain or question frame.
- Remove the Platform tab from `/submit#category`; platform onboarding should not be part of the first Curyo 2.0 submit flow.
- Consider retaining frontend registration elsewhere if it remains part of the protocol economy.
- Keep Voter ID gating, terms acceptance, preview/reservation, transaction status, and post-submit routing patterns.
- Add an optional "Add bounty" step or panel after the question details are valid.

The optional bounty panel should support:

- Token: USDC or USDT.
- Amount: entered in token units and formatted with the token decimals.
- Required voters: minimum number of valid revealed voters before the bounty can pay.
- Required settled rounds: number of settled question rounds that must complete before payout unlocks.
- Refund/expiry expectation: short copy explaining when funds are refundable or claimable.

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

## Vote Card Changes

Voting surfaces should make bounty funding visible without crowding the dense voting UI.

Recommended changes:

- Show a compact bounty badge on each voting card, for example "125 USDC bounty" or a token breakdown if both USDC and USDT are funded.
- Place the badge near the title, current rating, or round status so voters see why a question is prioritized.
- Do not let the badge resize the card between loading and loaded states; reserve stable space for it.
- In the existing "more" or details surface, add an "Add bounty" action.
- The "Add bounty" action should open a modal with token, amount, required voters, and required settled rounds.
- The modal should explain that stablecoin rewards are participation-only and question-scoped.
- The modal should surface allowance, approval, funding, and failure states separately, especially for USDT.

The feed should still rank content by the protocol's normal discovery logic, but bounty size can become an additional ranking or filter signal once abuse controls are in place.

## Reward UX

Stablecoin bounty rewards should be shown separately from cREP rewards.

Recommended changes:

- Add claimable USDC and USDT bounty rows to the rewards or profile claim area.
- Show the source question, token, amount, and claim status.
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
- `token`: allowlisted USDC or USDT address.
- `funder`: original funder.
- `amount`: total received token amount credited to the bounty.
- `remainingAmount`: unclaimed or refundable token amount.
- `requiredVoters`: minimum valid revealed voters for a round to qualify.
- `requiredSettledRounds`: number of qualifying settled rounds funded by the bounty.
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

1. A bounty starts at the current or next round for the question.
2. A round qualifies only if it reaches the normal cREP settlement path, has at least `requiredVoters` revealed votes, and is at or after the bounty start round.
3. Tied, cancelled, and reveal-failed rounds do not qualify at launch.
4. Each qualifying round receives `amount / requiredSettledRounds`, with the final qualifying round receiving dust.
5. Every voter who committed and revealed in that qualifying round can claim an equal share of that round allocation.
6. Vote direction does not matter.
7. Stablecoin rewards never depend on winning side at launch.
8. cREP rewards, losses, rebates, and participation rewards remain governed by the existing round settlement model.

This per-round model avoids unbounded on-chain iteration and avoids needing a unique-voter set across many rounds in v1. `claimBountyReward(bountyId, roundId)` can verify the caller's revealed commit through the voting engine and the stored round state, then transfer the user's share if it has not already been claimed.

Recommended refund and cancellation behavior:

- If the question is cancelled before the bounty qualifies, the funder can refund.
- If expiry passes before enough qualifying rounds complete, the funder can refund the unallocated remainder.
- If a round qualifies, its allocated rewards stay claimable by eligible voters.
- Do not auto-roll bounties into future questions or the global Participation Reward Pool.
- Dust should remain with the final claimant for a qualifying round, or be sweepable only after a long governance-controlled timeout.

## Stablecoin Support On Celo

Curyo 2.0 should support only explicitly allowlisted stablecoins at launch.

The current Celo token contract docs list these token addresses:

| Network | Token | Address |
| --- | --- | --- |
| Celo Mainnet | USDC | `0xcebA9300f2b948710d2653dD7B07f33A8B32118C` |
| Celo Mainnet | USDT | `0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e` |
| Celo Sepolia | USDC | `0x01C5C0122039549AD1493B8220cABEdD739BC44E` |
| Celo Sepolia | USDT | `0xd077A400968890Eacc75cdc901F0356c943e4fDb` |

Source: [Celo token contracts](https://docs.celo.org/tooling/contracts/token-contracts).

Implementation rules:

- Use the ERC20 token addresses for deposits and claims. Do not use Celo fee-currency adapter addresses for bounty custody.
- Use OpenZeppelin `SafeERC20` for all token transfers. Its docs cover tokens that do not return values and provide `forceApprove` for tokens that require resetting allowance to zero, such as USDT.
- Store all bounty accounting in the token's smallest unit.
- Keep token decimals for display and validation, not for core accounting.
- Measure the actual received balance delta on deposit and credit the actual received amount. This protects accounting even if a future allowlisted token behaves unexpectedly.
- Do not support arbitrary ERC20 tokens, fee-on-transfer tokens, rebasing tokens, bridged lookalike tokens, or user-provided token addresses in v1.
- Add local USDC and USDT mock tokens for Anvil and Foundry tests.

Source: [OpenZeppelin SafeERC20 docs](https://docs.openzeppelin.com/contracts/5.x/api/token/erc20#SafeERC20).

## Eligibility And Compliance Controls

Stablecoin funding and claims should require a bounty-specific eligibility gate.

Recommended controls:

- Require Voter ID for voting, and require bounty claim eligibility at claim time.
- Version the Self.xyz eligibility configuration so bounty participation can require a newer OFAC and excluded-country policy than older Voter IDs.
- Apply stablecoin eligibility checks to bounty funding and bounty claims.
- Add contract pause controls for new funding and claim emergencies, with claims/refunds kept available by default where possible.
- Keep bounty caps low at launch until legal, moderation, and issuer-policy risk is better understood.
- Preserve transaction records needed for user tax reporting: token, amount, date, question, and claim transaction.

Self.xyz should be treated as an important control layer, not a complete stablecoin compliance answer. Wallet screening, issuer controls, country rules, and legal review still need their own workstream.

## Ponder And API Plan

Ponder should index bounties directly rather than deriving them ad hoc in the frontend.

Recommended schema additions:

- `bounty`: bounty terms, funding state, token, question/content ID, funder, amount, remaining amount, required voters, required settled rounds, expiry, status.
- `bounty_deposit`: original funding and top-up events.
- `bounty_round`: per-round qualification, round allocation, revealed voter count, claimed count, and claimed amount.
- `bounty_claim`: voter claims by bounty and round.
- `bounty_refund`: funder refunds and cancelled/expired bounty recovery.
- `bounty_token`: allowlisted token metadata by chain.

Recommended API additions:

- Add active bounty summaries to content/feed items.
- Add token breakdowns so the UI can show USDC and USDT separately.
- Add bounty terms for the More section and modal review screen.
- Add user-specific claimable bounty rewards to existing reward aggregation.
- Add refundability and expiry state for funder views.

Suggested feed item fields:

```ts
type BountySummary = {
  id: string;
  token: `0x${string}`;
  symbol: "USDC" | "USDT";
  amountRemaining: string;
  activeAmount: string;
  requiredVoters: number;
  requiredSettledRounds: number;
  qualifiedRounds: number;
};
```

Question feed responses should include `activeBounties`, a formatted `totalBountyLabel`, and user-specific `claimableBounties` where available.

## Deployment And Generated Artifacts

The Curyo 2.0 deployment script should deploy the new contract surface in one pass and export all artifacts needed by Next.js, Ponder, keeper, bot, and SDK packages.

Deployment updates:

- Deploy `QuestionRegistry` or updated `ContentRegistry`.
- Deploy `QuestionBountyEscrow` and optional `QuestionBountyDistributor`.
- Wire the voting engine, registry, bounty escrow, reward distributor, participation pool, and protocol config.
- Initialize USDC and USDT allowlist addresses for Celo mainnet and Celo Sepolia.
- Deploy local mock USDC and USDT for Anvil.
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
   - Preserve cREP submitter stake, lifecycle, rating state, and voting engine integration.

2. `contracts: add question bounty escrow`
   - Add USDC/USDT allowlisted escrow, bounty creation, per-round qualification, pull-based claims, refunds, pause controls, and events.
   - Add Foundry unit tests for token allowlist, deposit accounting, claim rules, and refund paths.

3. `contracts: wire curyo 2 deployment`
   - Update deployment scripts, local mocks, protocol config wiring, ABI export, deployed contract metadata, and contract-size checks.
   - Add Celo mainnet and Celo Sepolia USDC/USDT allowlist initialization.

4. `ponder: index question bounties`
   - Add bounty schema tables, event handlers, contract config, tests, and API fields.
   - Include active bounty summaries and user claim state in feed/reward responses.

5. `nextjs: convert submit flow to questions`
   - Reuse the submit page and form shell.
   - Remove the Platform tab and platform-domain validation.
   - Change fields to question, link, category/frame, description, and tags.

6. `nextjs: add bounty funding UI`
   - Add optional bounty funding after submission.
   - Add token selector, amount input, required voter input, required settled round input, approve/deposit flow, and USDT allowance reset UX.

7. `nextjs: show and fund bounties from vote cards`
   - Add compact bounty badges to feed/vote cards.
   - Add "Add bounty" in the More section and open the funding modal from there.
   - Add responsive coverage for dense laptop and mobile vote surfaces.

8. `nextjs: add stablecoin bounty claims`
   - Extend claimable reward types and claim-all behavior for USDC/USDT bounty participation rewards.
   - Keep cREP and stablecoin rewards visually and semantically separate.

9. `sdk/bot/keeper: expose bounty helpers`
   - Add SDK reads for questions, bounty summaries, and claimable bounty rewards.
   - Add bot support only if automated bounty monitoring is needed.
   - Add keeper support only if bounty qualification snapshots, retries, or repair jobs become necessary.

10. `docs: update curyo 2 documentation`
    - Update READMEs, app docs, legal copy, whitepaper source, and regenerated whitepaper PDF.

## Test Plan

Foundry tests:

- USDC and USDT mock deposits.
- Invalid token rejection.
- Actual-received accounting on deposit.
- Bounty creation with required voters and required settled rounds.
- Multiple bounties on one question.
- Top-ups with distinct terms.
- Claim by revealed winning voter.
- Claim by revealed losing voter.
- Rejection for unrevealed voter.
- Double-claim prevention.
- Tied, cancelled, and reveal-failed rounds not qualifying at launch.
- Expiry refund.
- Question cancellation refund.
- Funding pause and claim/refund behavior.
- Solvency invariant: escrow token balance must cover remaining claimable and refundable amounts.

Ponder tests:

- Index `BountyCreated`, `BountyFunded`, `BountyRoundQualified`, `BountyRewardClaimed`, `BountyRefunded`, and token allowlist events.
- Rebuild active bounty aggregate after reorg-safe event replay.
- Return token breakdowns in feed responses.
- Return user claimable bounty rewards.

Next.js tests:

- Submit question without a bounty.
- Submit question and continue into optional bounty funding.
- Remove platform-domain validation without weakening generic URL safety checks.
- Render bounty badges on vote cards without layout shift.
- Open the Add Bounty modal from the More section.
- Handle USDC allowance and deposit.
- Handle USDT allowance reset before deposit when needed.
- Show stablecoin bounty reward claims separately from cREP.

End-to-end tests:

- Submit question, fund USDC bounty, vote, reveal, settle, and claim stablecoin reward.
- Repeat with USDT.
- Verify a voter on the losing cREP side can still claim the stablecoin participation reward after revealing.
- Verify an unrevealed voter cannot claim.
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
- `packages/foundry/README.md`: document `QuestionRegistry`, bounty escrow/distributor, USDC/USDT allowlist, deployment config, and test commands.
- `packages/ponder/README.md`: document bounty tables, handlers, API fields, and env vars.
- `packages/nextjs/README.md`: document submit, bounty funding, reward claim, and whitepaper generation flows.
- `packages/sdk/README.md`: document question and bounty helper APIs.
- `packages/bot/README.md`: update only if bots can submit, monitor, or claim bounties.
- `packages/keeper/README.md`: update only if keeper gets bounty qualification or repair duties.

App docs:

- `packages/nextjs/app/docs/how-it-works/page.tsx`: explain question submission, cREP voting, and stablecoin bounty participation rewards.
- `packages/nextjs/app/docs/smart-contracts/page.tsx`: add new contracts, token allowlist, claim model, and pause/refund controls.
- `packages/nextjs/app/docs/tokenomics/page.tsx`: clarify that stablecoin bounties are external question-scoped funds, not cREP emissions or the global Participation Reward Pool.
- `packages/nextjs/app/docs/governance/page.tsx`: document token allowlist governance, bounty caps, Self.xyz eligibility config, and emergency controls.
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
4. Add USDC/USDT mocks for local e2e.
5. Deploy to Celo Sepolia with low bounty caps.
6. Run a controlled testnet pilot with known voters and small bounties.
7. Review moderation, compliance, claim, refund, and layout issues.
8. Freeze contract interfaces for audit.
9. Deploy to Celo mainnet with conservative caps and allowlisted USDC/USDT only.
10. Raise caps only after observed claim behavior, issuer risk, and moderation workload are understood.

Launch guardrails:

- Low default bounty cap.
- No arbitrary ERC20 tokens.
- No stablecoin coherence bonus.
- No future-event or market-like category promotion.
- No secondary trading or transfer of yes/no exposure.
- Claims are pull-based.
- Funding and claiming require bounty eligibility checks.
- Emergency pause for new bounty funding.
- Public docs explain that consensus is not truth.

## Open Product Questions

- Should the first submit flow require a link, or allow text-only subjective questions?
- Should question categories be fixed templates, governance-created categories, or a hybrid?
- Should v1 use equal per-round stablecoin splits as recommended here, or add a capped cREP-weighted stablecoin split later?
- What are the default required voter and required settled round values for low-value bounties?
- What bounty caps should apply before moderation, anomaly detection, and legal review are mature?
- Should claim eligibility be by wallet address only at launch, or should claims resolve the underlying Voter ID holder to support delegated wallets safely?
