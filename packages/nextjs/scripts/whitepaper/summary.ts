import { protocolDocFacts } from "../../lib/docs/protocolFacts";
import type { ContentBlock } from "./types";

export const META = {
  title: "Curyo",
  subtitle: "AI Asks, Humans Stake",
  deck: "Human Feedback for AI Agents",
  author: "AI",
  version: "0.4",
  date: "April 2026",
};

export const EXECUTIVE_SUMMARY: ContentBlock[] = [
  {
    type: "paragraph",
    text: "AI agents increasingly need a way to ask humans instead of guessing. Curyo turns that request into a public feedback primitive: one bounded question, required source context, funded incentives, governed round terms, verified human voters, optional hidden feedback, and an auditable result that agents, apps, and researchers can reuse.",
  },
  {
    type: "paragraph",
    text: `Curyo is a decentralized content curation protocol that combines question-first submissions, mandatory non-refundable bounties, governed per-question round settings, stake-weighted prediction games, and optional USDC Feedback Bonuses. Submissions start as a question, require a context URL, and can optionally include image or YouTube preview media. Every question attaches a bounty funded in cREP or USDC on Celo, and the creator selects blind phase, max duration, settlement voters, and voter cap within governance bounds. Voters judge whether the currently displayed single 0-100 community rating for a content item is too low or too high and back that judgment with cREP token stakes. Each round snapshots the question's selected config and a canonical reference score on-chain, and the settlement logic updates the next score from that anchor rather than recomputing from scratch. Votes are encrypted via tlock (time-lock encryption) and hidden until the selected epoch ends, preventing herding. Commits in the redeployed stack bind the reference score together with explicit drand metadata (targetRound and drandChainHash), and on-chain logic rejects malformed or non-armored ciphertexts while the keeper/runtime layer still performs deeper stanza checks before reveal. After the epoch, the keeper normally reveals eligible votes, and connected users can self-reveal if needed. The side with the larger epoch-weighted stake wins -- early (blind) voters earn full reward weight, while later voters who saw epoch-1 results earn ${protocolDocFacts.openPhaseWeightLabel} weight, creating a ${protocolDocFacts.earlyVoterAdvantageLabel} incentive to vote early. Bounties pay eligible revealed voters in qualified rounds, reserve 3% for eligible frontend operators, and remain independent of cREP outcome. Feedback Bonuses can additionally award hidden voter feedback by canonical hash after settlement. Bots and AI agents submit through the same path as humans when they need verified feedback.`,
  },
  {
    type: "paragraph",
    text: "Sybil resistance is enforced through Voter ID NFTs -- soulbound tokens tied to verified human identities via zero-knowledge Self.xyz passport or biometric ID card verification. Faucet claims require 18+ age proof, OFAC sanctions clearance, and configured sanctioned-country eligibility. Each verified identity is capped regardless of how many wallets it controls, making systematic manipulation expensive relative to the signal produced. Question submission itself does not require Voter ID.",
  },
  {
    type: "paragraph",
    text: "A core design decision is that all rating data lives on-chain as a permanent, permissionless data layer. Every vote, stake amount, round outcome, and resulting content rating is publicly accessible without proprietary API keys or gatekeepers. Hosted indexers and reference frontends can still apply service-level rate limits and policy-driven moderation filters to displayed reads, but the underlying chain data remains open. This makes Curyo's quality signals available as a public good -- usable by AI training pipelines to filter data by human-verified quality, by search engines as an independent ranking signal, and by any third-party platform without permission or payment.",
  },
  {
    type: "paragraph",
    text: "The product now treats AI as the primary asker and integrator. Bots can submit questions without Voter ID so long as they attach the mandatory bounty, required context URL, and valid round settings. The hosted x402 question endpoint lets bot wallets pay in Celo USDC while the server executor submits the question and USDC bounty on-chain. MCP-ready integration surfaces can expose quote, ask, status, result, category, and balance tools without giving agents raw transaction access. Curyo returns a human judgment signal, not a claim of absolute truth.",
  },
  {
    type: "paragraph",
    text: "This paper describes the protocol's mechanisms in detail: the tlock commit-reveal voting flow, the score-relative rating update, epoch-weighted cREP payout weights, parimutuel stake settlement, governance-tunable rating parameters, tokenomics, on-chain governance, and the role of SDK, keeper, bot, and indexer services in building trustworthy quality infrastructure for the age of AI.",
  },
];
