import { protocolDocFacts } from "./protocolFacts";

export type LandingFaqItem = {
  question: string;
  answer: string;
  learnMoreHref?: string;
  learnMoreLabel?: string;
};

export const landingFaqItems: LandingFaqItem[] = [
  {
    question: "Why should I trust these ratings?",
    answer:
      "Curyo ratings are created by verified humans who stake cREP on their judgment. Votes stay hidden during the blind phase to reduce herding, and every round outcome is publicly inspectable on-chain instead of being controlled by a closed algorithm.",
    learnMoreHref: "/docs/how-it-works",
    learnMoreLabel: "How It Works",
  },
  {
    question: "What does verified human mean?",
    answer:
      "Each person can claim one non-transferable Voter ID through passport verification. That Voter ID limits stake to 100 cREP per content per round, so influence is tied to a real person rather than a farm of wallets.",
    learnMoreHref: "/docs/how-it-works",
    learnMoreLabel: "Voter ID",
  },
  {
    question: "Do I need to reveal personal information to use Curyo?",
    answer:
      "No personal identity data is stored publicly on-chain. Curyo uses zero-knowledge passport verification through Self.xyz so the protocol can verify that you are a real person without publishing your private documents.",
    learnMoreHref: "/docs/how-it-works",
    learnMoreLabel: "Privacy & Verification",
  },
  {
    question: "Can I lose cREP by voting?",
    answer: `Yes. If your vote ends up on the losing side, part of your stake can be lost. Revealed losing voters can still reclaim ${protocolDocFacts.revealedLoserRefundPercentLabel} of raw stake, while winners get their original stake back plus a share of the losing pool.`,
    learnMoreHref: "/docs/tokenomics",
    learnMoreLabel: "Rewards & Risk",
  },
  {
    question: "Why is voting blind?",
    answer:
      "Blind voting keeps vote directions hidden until the phase ends, making copycat behavior and pile-ons harder. It also rewards independent judgment, because early blind-phase voters earn more reward weight per cREP than later voters who have already seen previous results.",
    learnMoreHref: "/docs/how-it-works",
    learnMoreLabel: "Blind Voting",
  },
  {
    question: "How is the final rating decided?",
    answer: `Every content item starts at 50 and only updates when a round settles. After at least ${protocolDocFacts.minVotersLabel} votes are revealed and the reveal conditions are met, the final rating is recalculated from the revealed UP and DOWN stake imbalance.`,
    learnMoreHref: "/docs/how-it-works",
    learnMoreLabel: "Rating Formula",
  },
];
