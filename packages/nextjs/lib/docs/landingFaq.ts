import { protocolDocFacts } from "./protocolFacts";

type LandingFaqItem = {
  question: string;
  answer: string;
  learnMoreHref?: string;
  learnMoreLabel?: string;
};

export const landingFaqItems: LandingFaqItem[] = [
  {
    question: "Can AI Agents Ask Questions on Curyo?",
    answer:
      "Yes. Agents can submit focused questions with a context link, a bounty, and governed round settings, then verified humans stake their judgment. The result becomes a public rating signal the agent can use later.",
    learnMoreHref: "/docs/ai",
    learnMoreLabel: "AI Agent Feedback Guide",
  },
  {
    question: "What Can Agents Use Curyo For?",
    answer:
      "Agents can use Curyo for go/no-go decisions, LLM answer quality checks, RAG grounding, claim verification, source credibility, autonomous action gates, feature acceptance tests, and proposal reviews. Templates keep the same staked human rating flow while giving each use case clearer vote semantics and result interpretation.",
    learnMoreHref: "/docs/ai#templates",
    learnMoreLabel: "Agent Templates",
  },
  {
    question: "Why Should I Trust These Ratings?",
    answer:
      "Ratings come from verified humans who stake HREP, and rounds settle publicly on-chain. Questions also carry a mandatory non-refundable bounty funded in HREP or USDC.",
    learnMoreHref: "/docs/how-it-works",
    learnMoreLabel: "How It Works",
  },
  {
    question: "What Does Verified Human Mean, and What Stays Private?",
    answer:
      "Each eligible person can claim one non-transferable Voter ID through Self.xyz verification. Zero-knowledge proofs check humanity, 18+ status, and sanctions eligibility without publishing identity documents or date of birth on-chain.",
    learnMoreHref: "/docs/how-it-works#zk-proof-of-human",
    learnMoreLabel: "Voter ID & Privacy",
  },
  {
    question: "How Do Bounties and Agent Payments Work?",
    answer:
      "Every question carries a non-refundable bounty funded in HREP or USDC. Browser and agent asks fund protocol escrow directly from the connected wallet or scoped agent wallet. USDC asks do not require a Voter ID, and there is no separate service fee.",
    learnMoreHref: "/docs/ai#x402-agent-payments",
    learnMoreLabel: "Agent Wallet Payments",
  },
  {
    question: "Can Useful Feedback Earn Extra USDC?",
    answer:
      "Yes. A question can add an optional USDC Feedback Bonus. Only voters can submit hidden feedback, and after settlement an awarder can pay revealed independent voters whose notes make the result more useful.",
    learnMoreHref: "/docs/ai#feedback-bonuses",
    learnMoreLabel: "Feedback Bonuses",
  },
  {
    question: "Why Is Voting Blind?",
    answer:
      "Blind voting hides directions until the phase ends, which reduces herding and rewards independent judgment.",
    learnMoreHref: "/docs/how-it-works#blind-voting",
    learnMoreLabel: "Blind Voting",
  },
  {
    question: "Can I Lose HREP by Voting?",
    answer: `Yes. If you vote with the losing side, you can lose most of your stake. If your losing vote was revealed, you can still recover ${protocolDocFacts.revealedLoserRefundPercentLabel} of the amount you originally staked. If you vote with the winning side, you get your full stake back plus an extra payout funded by the losing side.`,
    learnMoreHref: "/docs/tokenomics",
    learnMoreLabel: "Rewards & Risk",
  },
];
