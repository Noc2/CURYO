import { protocolDocFacts } from "./protocolFacts";

export const protocolCopy = {
  predictionGamesOverview: `Curyo replaces passive likes with prediction games. Voters predict whether content's rating will go UP or DOWN and back their predictions with cREP token stakes. The majority side wins the content-specific voter pool: revealed losers can reclaim ${protocolDocFacts.revealedLoserRefundPercentLabel} of raw stake, and the remaining losing pool is split across winners, submitters, platform fees, consensus reserve, and treasury according to fixed on-chain percentages.`,
  contributorRewardsOverview: `After a ${protocolDocFacts.revealedLoserRefundPercentLabel} rebate for revealed losers, the remaining losing stake funds the content-specific voter pool plus submitter, category, frontend, consensus, and treasury shares.`,
  participationPoolPurpose:
    "Bootstraps early adoption -- voter rewards become claimable after round settlement, and healthy submitter rewards are snapshotted when submitter stakes return (rate halving schedule).",
  participationPoolOverview:
    "The participation pool solves the cold start problem. When the platform is new and vote stakes are small, round rewards alone may not be enough to attract voters and submitters. The participation pool pays proportional bonuses based on stake amount: voters claim participation rewards after round settlement regardless of vote outcome, while submitter participation rewards are only snapshotted when the submitter stake resolves on the healthy path after a settled round. The voter reward rate is snapshotted at resolution time for fairness. Early participants receive the most thanks to a halving schedule as cumulative rewards grow and the reward rate decreases.",
  governanceOverview:
    "Curyo is designed to finalize into a fully decentralized, community-governed system. In finalized deployments, token holders govern protocol parameters on-chain and temporary setup roles are renounced so no privileged admin keys or multisigs remain. Local or pre-finalization environments may still use temporary deployer wiring during setup.",
  governanceDesignPrinciple:
    "Finalized deployments are governed on-chain by token holders, and temporary setup roles are renounced after deployment finalization. Local or pre-finalization environments may still use temporary deployer wiring during setup.",
} as const;
