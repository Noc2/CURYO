import { protocolDocFacts } from "../../lib/docs/protocolFacts";
import type { ContentBlock } from "./types";

export const META = {
  title: "Curyo",
  subtitle: "Human Reputation at Stake",
  deck: "Get Verified, Claim cREP, and Rate with Stake",
  author: "AI",
  version: "0.3",
  date: "March 2026",
};

export const EXECUTIVE_SUMMARY: ContentBlock[] = [
  {
    type: "paragraph",
    text: "Generative AI has collapsed the cost of producing content to near zero, flooding the web with low-effort material that is often indistinguishable from human-created work. Traditional quality signals -- likes, upvotes, engagement metrics -- are trivially gamed by automated agents. Meanwhile, research has demonstrated that AI models trained on AI-generated content suffer progressive model collapse, losing fidelity to the original data distribution. The web urgently needs a new layer of trustworthy, manipulation-resistant quality signals.",
  },
  {
    type: "paragraph",
    text: `Curyo is a decentralized content curation protocol that replaces passive engagement metrics with stake-weighted prediction games. Voters predict whether a content item's rating will go up or down and back their prediction with cREP token stakes. Votes are encrypted via tlock (time-lock encryption) and hidden until each ${protocolDocFacts.blindPhaseDurationLabel} epoch ends, preventing herding. Commits in the redeployed stack bind explicit drand metadata (targetRound and drandChainHash) and on-chain reject malformed or non-armored ciphertexts, while the keeper/runtime layer still performs deeper stanza checks before reveal. After the epoch, the keeper normally reveals eligible votes, and connected users can self-reveal if needed. The side with the larger epoch-weighted stake wins -- early (blind) voters earn full reward weight, while later voters who saw epoch-1 results earn ${protocolDocFacts.openPhaseWeightLabel} weight, creating a ${protocolDocFacts.earlyVoterAdvantageLabel} incentive to vote early.`,
  },
  {
    type: "paragraph",
    text: "Sybil resistance is enforced through Voter ID NFTs -- soulbound tokens tied to verified human identities via zero-knowledge Self.xyz passport or biometric ID card verification. Each verified identity is capped regardless of how many wallets it controls, making systematic manipulation expensive relative to the signal produced.",
  },
  {
    type: "paragraph",
    text: "A core design decision is that all rating data lives on-chain as a permanent, permissionless data layer. Every vote, stake amount, round outcome, and resulting content rating is publicly accessible without proprietary API keys or gatekeepers. Hosted indexers can still apply service-level rate limits, but the underlying data remains open. This makes Curyo's quality signals available as a public good -- usable by AI training pipelines to filter data by human-verified quality, by search engines as an independent ranking signal, and by any third-party platform without permission or payment.",
  },
  {
    type: "paragraph",
    text: "Curyo also incorporates AI as a first-class participant through automated voting bots with pluggable rating strategies. Bots follow the same staking and commit-reveal rules as human voters and are transparent participants in the curation game. In practice, AI-assisted voting is most useful for cold-start seeding while the protocol leaves influence to stake-weighted participants rather than participant type. This hybrid model addresses the cold-start problem inherent in new platforms while preserving space for human oversight and disagreement.",
  },
  {
    type: "paragraph",
    text: "This paper describes the protocol's mechanisms in detail: the tlock commit-reveal voting flow, epoch-weighted reward distribution, parimutuel stake settlement, tokenomics, on-chain governance, and the role of AI-assisted curation in building trustworthy quality infrastructure for the age of AI.",
  },
];
