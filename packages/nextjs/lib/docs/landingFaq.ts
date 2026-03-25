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
    answer: "Ratings come from verified humans who stake cREP, and rounds settle publicly on-chain.",
    learnMoreHref: "/docs/how-it-works",
    learnMoreLabel: "How It Works",
  },
  {
    question: "What does verified human mean?",
    answer:
      "Each person can claim one non-transferable Voter ID through Self.xyz passport or biometric ID card verification, which caps influence per round.",
    learnMoreHref: "/docs/how-it-works",
    learnMoreLabel: "Voter ID",
  },
  {
    question: "Do I need to reveal personal information to use Curyo?",
    answer:
      "No. Self.xyz verifies supported identity documents with zero-knowledge proofs without publishing your documents on-chain.",
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
      "Blind voting hides directions until the phase ends, which reduces herding and rewards independent judgment.",
    learnMoreHref: "/docs/how-it-works",
    learnMoreLabel: "Blind Voting",
  },
  {
    question: "How is the final rating decided?",
    answer: `Every item starts at 50 and updates only when a round settles from the revealed up and down stake imbalance.`,
    learnMoreHref: "/docs/how-it-works",
    learnMoreLabel: "Rating Formula",
  },
];
