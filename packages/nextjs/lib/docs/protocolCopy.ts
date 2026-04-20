import { protocolDocFacts } from "./protocolFacts";

export const protocolCopy = {
  whyNowOverview:
    "Generative AI has made it cheap to produce convincing text, images, and video at scale. That weakens passive signals like likes, follower counts, and engagement.",
  strongerSignalOverview:
    "Curyo offers a stronger signal: question-first submissions with a mandatory non-refundable bounty, a required context URL, optional preview media, and stake-weighted ratings from verified humans, recorded publicly and backed by economic risk.",
  predictionGamesOverview: `Curyo replaces passive likes with question-first rounds and a mandatory non-refundable bounty. Submissions start as a question and require a context URL; optional preview media can be attached when it helps discovery. The attached bounty is funded in cREP or USDC on Celo and displayed to users in the funding asset, while voters predict whether the content's single 0-100 community rating will go up or down and back those predictions with cREP token stakes. The majority side wins the content-specific voter pool: revealed losers can reclaim ${protocolDocFacts.revealedLoserRefundPercentLabel} of raw stake, and the remaining losing pool is split across winners, frontend fees, consensus reserve, and treasury according to fixed on-chain percentages. There is no submitter upside path.`,
  contributorRewardsOverview: `After a ${protocolDocFacts.revealedLoserRefundPercentLabel} rebate for revealed losers, the remaining losing stake funds the content-specific voter pool plus frontend, consensus, and treasury shares. Bounties are attached at submission, funded in cREP or USDC on Celo, remain non-refundable, and pay eligible revealed voters with a 3% commit-attributed frontend-operator share inside each qualified bounty round. Bots and AI agents submit through the same path as humans when they want verified feedback.`,
  feedbackBonusOverview:
    "Optional USDC Feedback Bonuses can reward revealed voters for hidden notes that make a question easier for agents to judge. Feedback stays off-chain, the app stores a canonical hash, and unawarded expired funds go to treasury.",
  roundSettingsOverview: `Question creators can choose per-question round settings for blind phase length, maximum round duration, settlement voters, and voter cap. Governance controls the default values and the allowed bounds (${protocolDocFacts.roundConfigBoundsSummaryLabel}), so fast high-bounty questions can ask for quicker answers while broader questions can wait for more voters.`,
  participationPoolPurpose:
    "Bootstraps early adoption -- voter bootstrap rewards become claimable after round settlement, and the rate halves based on cumulative cREP distributed from the pool.",
  participationPoolOverview:
    "The Bootstrap Pool solves the cold start problem. When the platform is new and vote stakes are small, round rewards alone may not be enough to attract voters. The Bootstrap Pool pays proportional cREP bonuses based on stake amount: winning revealed voters claim bootstrap rewards after round settlement, and the voter reward rate is snapshotted at resolution time for fairness. Early participants receive the most thanks to a halving schedule as cumulative rewards grow and the reward rate decreases.",
  governanceOverview:
    "Curyo is designed to finalize into a community-governed system. The governor/timelock owns upgrade, config, and treasury routing from launch, and the deployer renounces temporary setup roles after deployment finalization. Local or pre-finalization environments may still use temporary deployer wiring during setup.",
  governanceDesignPrinciple:
    "Finalized deployments keep treasury spending on the same on-chain governor/timelock path as upgrades and config, and temporary deployer setup roles are renounced after deployment finalization. Local or pre-finalization environments may still use temporary deployer wiring during setup.",
} as const;
