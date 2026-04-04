import { protocolDocFacts } from "./protocolFacts";

type LandingFaqItem = {
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
    answer: `Yes. If you vote with the losing side, you can lose most of your stake. If your losing vote was revealed, you can still recover ${protocolDocFacts.revealedLoserRefundPercentLabel} of the amount you originally staked. If you vote with the winning side, you get your full stake back plus an extra payout funded by the losing side.`,
    learnMoreHref: "/docs/tokenomics",
    learnMoreLabel: "Rewards & Risk",
  },
  {
    question: "Why is voting blind?",
    answer:
      "Blind voting hides directions until the phase ends, which reduces herding and rewards independent judgment.",
    learnMoreHref: "/docs/how-it-works#blind-voting",
    learnMoreLabel: "Blind Voting",
  },
  {
    question: "How is the final rating decided?",
    answer:
      "In the redeployed rating model, each round asks whether the current displayed score is too low or too high. The next score updates from that round anchor using epoch-weighted evidence and confidence, instead of being recomputed from scratch.",
    learnMoreHref: "/docs/how-it-works",
    learnMoreLabel: "Rating Formula",
  },
];
