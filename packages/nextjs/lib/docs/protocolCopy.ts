import { protocolDocFacts } from "./protocolFacts";

export const protocolCopy = {
  whyNowOverview:
    "Generative AI has made it cheap to produce convincing text, images, and video at scale. That weakens passive signals like likes, follower counts, and engagement.",
  strongerSignalOverview:
    "Curyo offers a stronger signal: stake-weighted ratings from verified humans, recorded publicly and backed by economic risk.",
  predictionGamesOverview: `Curyo replaces passive likes with prediction games. Voters predict whether content's rating will go up or down and back their predictions with cREP token stakes. The majority side wins the content-specific voter pool: revealed losers can reclaim ${protocolDocFacts.revealedLoserRefundPercentLabel} of raw stake, and the remaining losing pool is split across winners, submitters, platform fees, consensus reserve, and treasury according to fixed on-chain percentages.`,
  contributorRewardsOverview: `After a ${protocolDocFacts.revealedLoserRefundPercentLabel} rebate for revealed losers, the remaining losing stake funds the content-specific voter pool plus submitter, category, frontend, consensus, and treasury shares.`,
  participationPoolPurpose:
    "Bootstraps early adoption -- voter rewards become claimable after round settlement, and healthy submitter rewards are snapshotted when submitter stakes return (rate halving schedule).",
  participationPoolOverview:
    "The participation pool solves the cold start problem. When the platform is new and vote stakes are small, round rewards alone may not be enough to attract voters and submitters. The participation pool pays proportional bonuses based on stake amount: winning revealed voters claim participation rewards after round settlement, while submitter participation rewards are only snapshotted when the submitter stake resolves on the healthy path after a settled round. The voter reward rate is snapshotted at resolution time for fairness. Early participants receive the most thanks to a halving schedule as cumulative rewards grow and the reward rate decreases.",
  governanceOverview:
    "Curyo is designed to finalize into a community-governed system. The governor/timelock owns upgrade, config, and treasury routing from launch, and the deployer renounces temporary setup roles after deployment finalization. Local or pre-finalization environments may still use temporary deployer wiring during setup.",
  governanceDesignPrinciple:
    "Finalized deployments keep treasury spending on the same on-chain governor/timelock path as upgrades and config, and temporary deployer setup roles are renounced after deployment finalization. Local or pre-finalization environments may still use temporary deployer wiring during setup.",
} as const;
