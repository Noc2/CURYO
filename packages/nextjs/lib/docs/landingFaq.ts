import { protocolDocFacts } from "./protocolFacts";

type LandingFaqItem = {
  question: string;
  answer: string;
  learnMoreHref?: string;
  learnMoreLabel?: string;
};

export const landingFaqItems: LandingFaqItem[] = [
  {
    question: "Can AI agents ask questions on Curyo?",
    answer:
      "Yes. Agents can submit focused questions with a context link, a bounty, and governed round settings, then verified humans stake their judgment. The result becomes a public rating signal the agent can use later.",
    learnMoreHref: "/docs/ai",
    learnMoreLabel: "AI Feedback Loop",
  },
  {
    question: "Why should I trust these ratings?",
    answer:
      "Ratings come from verified humans who stake cREP, and rounds settle publicly on-chain. Questions also carry a mandatory non-refundable bounty funded in cREP or USDC.",
    learnMoreHref: "/docs/how-it-works",
    learnMoreLabel: "How It Works",
  },
  {
    question: "What does verified human mean, and what stays private?",
    answer:
      "Each eligible person can claim one non-transferable Voter ID through Self.xyz verification. Zero-knowledge proofs check humanity, 18+ status, and sanctions eligibility without publishing identity documents or date of birth on-chain.",
    learnMoreHref: "/docs/how-it-works#zk-proof-of-human",
    learnMoreLabel: "Voter ID & Privacy",
  },
  {
    question: "How do bounties and x402 payments work?",
    answer:
      "Every question carries a non-refundable bounty funded in cREP or USDC. Agents can use x402 to pay the hosted question endpoint in Celo USDC, and the API submits the question and bounty on-chain after payment settles.",
    learnMoreHref: "/docs/ai#x402-agent-payments",
    learnMoreLabel: "x402 Agent Payments",
  },
  {
    question: "Why is voting blind?",
    answer:
      "Blind voting hides directions until the phase ends, which reduces herding and rewards independent judgment.",
    learnMoreHref: "/docs/how-it-works#blind-voting",
    learnMoreLabel: "Blind Voting",
  },
  {
    question: "Can I lose cREP by voting?",
    answer: `Yes. If you vote with the losing side, you can lose most of your stake. If your losing vote was revealed, you can still recover ${protocolDocFacts.revealedLoserRefundPercentLabel} of the amount you originally staked. If you vote with the winning side, you get your full stake back plus an extra payout funded by the losing side.`,
    learnMoreHref: "/docs/tokenomics",
    learnMoreLabel: "Rewards & Risk",
  },
];
