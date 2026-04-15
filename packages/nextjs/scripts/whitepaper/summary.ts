import { protocolDocFacts } from "../../lib/docs/protocolFacts";
import type { ContentBlock } from "./types";

export const META = {
  title: "Curyo",
  subtitle: "Human Reputation at Stake",
  deck: "Get Verified, Ask Questions, and Rate with Stake",
  author: "AI",
  version: "0.4",
  date: "April 2026",
};

export const EXECUTIVE_SUMMARY: ContentBlock[] = [
  {
    type: "paragraph",
    text: "Generative AI has collapsed the cost of producing content to near zero, flooding the web with low-effort material that is often indistinguishable from human-created work. Traditional quality signals -- likes, upvotes, engagement metrics -- are trivially gamed by automated agents. Meanwhile, research has demonstrated that AI models trained on AI-generated content suffer progressive model collapse, losing fidelity to the original data distribution. The web urgently needs a new layer of trustworthy, manipulation-resistant quality signals.",
  },
  {
    type: "paragraph",
    text: `Curyo is a decentralized content curation protocol that combines question-first submissions, optional bounties, and stake-weighted prediction games. Submissions start as a question and can be text only or include a regular evidence link, direct image link, or YouTube link. Optional bounties are funded in Celo USDC and displayed as USD, while voters judge whether the currently displayed community score for a content item is too low or too high and back that judgment with cREP token stakes. Each round snapshots a canonical reference score on-chain, and the settlement logic updates the next score from that anchor rather than recomputing from scratch. Votes are encrypted via tlock (time-lock encryption) and hidden until each ${protocolDocFacts.blindPhaseDurationLabel} epoch ends, preventing herding. Commits in the redeployed stack bind the reference score together with explicit drand metadata (targetRound and drandChainHash), and on-chain logic rejects malformed or non-armored ciphertexts while the keeper/runtime layer still performs deeper stanza checks before reveal. After the epoch, the keeper normally reveals eligible votes, and connected users can self-reveal if needed. The side with the larger epoch-weighted stake wins -- early (blind) voters earn full reward weight, while later voters who saw epoch-1 results earn ${protocolDocFacts.openPhaseWeightLabel} weight, creating a ${protocolDocFacts.earlyVoterAdvantageLabel} incentive to vote early. Question-specific USDC bounties pay equal stablecoin shares to eligible revealed Voter ID holders in qualified bounty rounds, independent of cREP outcome.`,
  },
  {
    type: "paragraph",
    text: "Sybil resistance is enforced through Voter ID NFTs -- soulbound tokens tied to verified human identities via zero-knowledge Self.xyz passport or biometric ID card verification. Each verified identity is capped regardless of how many wallets it controls, making systematic manipulation expensive relative to the signal produced.",
  },
  {
    type: "paragraph",
    text: "A core design decision is that all rating data lives on-chain as a permanent, permissionless data layer. Every vote, stake amount, round outcome, and resulting content rating is publicly accessible without proprietary API keys or gatekeepers. Hosted indexers and reference frontends can still apply service-level rate limits and policy-driven moderation filters to displayed reads, but the underlying chain data remains open. This makes Curyo's quality signals available as a public good -- usable by AI training pipelines to filter data by human-verified quality, by search engines as an independent ranking signal, and by any third-party platform without permission or payment.",
  },
  {
    type: "paragraph",
    text: "Curyo also incorporates AI as a first-class participant through reference bot tooling with pluggable rating strategies. Bots follow the same staking and commit-reveal rules as human voters and are transparent participants in the curation game, but the current reference bot is a manual or schedulable CLI rather than an always-on protocol service. The SDK and hosted MCP surface expose structured reads plus narrow wallet-bound write helpers so applications and agents can integrate without bypassing the protocol's stake and identity checks.",
  },
  {
    type: "paragraph",
    text: "This paper describes the protocol's mechanisms in detail: the tlock commit-reveal voting flow, the score-relative rating update, epoch-weighted reward distribution, parimutuel stake settlement, governance-tunable rating parameters, tokenomics, on-chain governance, and the role of SDK, MCP, keeper, bot, and indexer services in building trustworthy quality infrastructure for the age of AI.",
  },
];
