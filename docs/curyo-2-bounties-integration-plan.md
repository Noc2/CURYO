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

## Open Product Questions

- Should the first submit flow require a link, or allow text-only subjective questions?
- Should question categories be fixed templates, governance-created categories, or a hybrid?
- Should a bounty fund one future eligible round, the next N settled rounds, or all eligible voters who participated before unlock?
- Should stablecoin rewards be equal per eligible Voter ID at launch, or pro-rata by capped cREP stake?
- What are the default required voter and required settled round values for low-value bounties?
- What bounty caps should apply before moderation, anomaly detection, and legal review are mature?

