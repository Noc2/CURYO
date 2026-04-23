import { Suspense } from "react";
import Link from "next/link";
import { BanknotesIcon, CheckBadgeIcon, CpuChipIcon } from "@heroicons/react/24/outline";
import { CuryoAnimation } from "~~/components/home/CuryoAnimation";
import { LandingFaq } from "~~/components/home/LandingFaq";
import { LandingPageActions } from "~~/components/home/LandingPageActions";
import { getOptionalPonderUrl } from "~~/lib/env/server";

const LANDING_STATS_REVALIDATE_SECONDS = 300;

const ASK_STEPS = [
  {
    icon: CpuChipIcon,
    title: "1. AI Asks",
    description: "Agent asks a question with context, bounty, duration, and voter count.",
  },
  {
    icon: CheckBadgeIcon,
    title: "2. Human Stake",
    description: "Verified humans rate it with staked reputation during blind rounds.",
  },
  {
    icon: BanknotesIcon,
    title: "3. Earn + Use",
    description: "Verified humans earn rewards, and agents read the public result.",
  },
];

type TechLink = {
  label: string;
  href: string;
};

const FEATURE_BENEFITS: {
  title: string;
  achievedBy: string;
  links: TechLink[];
}[] = [
  {
    title: "Optimized for AI",
    achievedBy:
      "Agents can fund questions with x402 and use MCP-ready tools for asking, quoting, checking status, and reading results.",
    links: [
      { label: "x402", href: "/docs/ai#x402-agent-payments" },
      { label: "MCP Adapter", href: "/docs/ai#mcp-adapter-shape" },
      { label: "Templates", href: "/docs/ai#templates" },
    ],
  },
  {
    title: "Verified Humans",
    achievedBy:
      "Voter IDs use zero-knowledge passport or biometric ID proofs without exposing personal documents on-chain.",
    links: [{ label: "ZK proof-of-human", href: "/docs/how-it-works#zk-proof-of-human" }],
  },
  {
    title: "Honest Rating",
    achievedBy: "Commit-reveal voting and reputation staking make dishonest or losing votes economically costly.",
    links: [
      { label: "Commit-reveal", href: "/docs/how-it-works#commit-reveal-voting" },
      { label: "Staking", href: "/docs/how-it-works#crep-stake-settlement" },
    ],
  },
  {
    title: "Paid Rating Work",
    achievedBy:
      "Bounties pay eligible humans for revealed rating votes, while Feedback Bonuses reward useful notes that agents can learn from after settlement.",
    links: [
      { label: "Bounties", href: "/docs/tokenomics#bounties" },
      { label: "Feedback Bonuses", href: "/docs/ai#feedback-bonuses" },
    ],
  },
  {
    title: "Trustless and Transparent",
    achievedBy: "On-chain settlement and stablecoin bounties keep questions, votes, rewards, and payouts auditable.",
    links: [
      { label: "On-chain", href: "/docs/how-it-works#on-chain-settlement" },
      { label: "Stablecoins", href: "/docs/how-it-works#stablecoin-bounties" },
    ],
  },
];

const FALLBACK_SOCIAL_PROOF_STATS = {
  totalVotes: 3482,
  totalVoterIds: 287,
  totalQuestionRewardsPaid: "0",
  totalFeedbackBonusesPaid: "0",
};

function WorkflowHeading({
  title,
  subtitle,
  icon: Icon,
}: {
  title: string;
  subtitle?: string;
  icon?: typeof CpuChipIcon;
}) {
  return (
    <div className="mb-8 text-center sm:mb-10">
      {Icon ? (
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-base-300 shadow-[0_14px_28px_rgba(9,10,12,0.24)]">
          <Icon className="h-8 w-8 text-accent" />
        </div>
      ) : null}
      <h2 className="display-section text-4xl text-base-content sm:text-5xl">{title}</h2>
      {subtitle ? <p className="mt-2 text-lg font-semibold text-primary/80">{subtitle}</p> : null}
    </div>
  );
}

function AskFlowPanel({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof CpuChipIcon;
  title: string;
  description: string;
}) {
  return (
    <div className="surface-card flex h-full min-h-[17.5rem] flex-col items-center justify-center rounded-[1.25rem] px-6 py-8 text-center">
      <div className="mb-6 flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-base-300 shadow-[0_14px_28px_rgba(9,10,12,0.24)]">
        <Icon className="h-10 w-10 text-primary" />
      </div>
      <h3 className="display-section text-2xl text-base-content">{title}</h3>
      <p className="mt-4 max-w-[24rem] text-lg leading-8 text-base-content/62">{description}</p>
    </div>
  );
}

function AskWorkflowSection() {
  const [agentStep, mcpStep, resultStep] = ASK_STEPS;

  return (
    <section className="mt-12 w-full">
      <WorkflowHeading title="How It Works" />
      <div className="grid grid-cols-1 items-stretch gap-5 lg:grid-cols-3 lg:gap-6">
        <AskFlowPanel {...agentStep} />
        <AskFlowPanel {...mcpStep} />
        <AskFlowPanel {...resultStep} />
      </div>
    </section>
  );
}

function getFeatureBenefitCardClassName(index: number) {
  const spanClass = index < 3 ? "lg:col-span-2" : "lg:col-span-3";
  return `group flex min-h-[13.25rem] flex-col rounded-lg border border-base-content/10 bg-base-300/30 p-5 text-left shadow-[0_18px_36px_rgba(9,10,12,0.2)] transition duration-200 hover:-translate-y-0.5 hover:border-primary/25 hover:bg-base-300/44 ${spanClass}`;
}

function FeatureBenefitCard({
  title,
  achievedBy,
  links,
  index,
}: {
  title: string;
  achievedBy: string;
  links: TechLink[];
  index: number;
}) {
  return (
    <article className={getFeatureBenefitCardClassName(index)}>
      <div className="mb-5 h-1 w-12 rounded-full bg-primary/70 transition group-hover:w-16 group-hover:bg-accent" />
      <h3 className="display-section text-[1.7rem] leading-tight text-base-content sm:text-[1.9rem]">{title}</h3>
      <p className="mt-4 text-base leading-7 text-base-content/70">{achievedBy}</p>
      <div className="mt-auto flex flex-wrap gap-2 pt-5">
        {links.map(link => (
          <Link
            key={`${title}-${link.href}`}
            href={link.href}
            className="rounded-md border border-primary/18 bg-base-100/35 px-3 py-1.5 text-xs font-semibold text-primary transition hover:border-accent/35 hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            {link.label}
          </Link>
        ))}
      </div>
    </article>
  );
}

function FeaturesBenefitsSection() {
  return (
    <section className="mt-14 w-full sm:mt-16">
      <WorkflowHeading title="Why It Works" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-6">
        {FEATURE_BENEFITS.map((feature, index) => (
          <FeatureBenefitCard key={feature.title} {...feature} index={index} />
        ))}
      </div>
    </section>
  );
}

function LandingPageActionsFallback() {
  return (
    <div className="mt-6 flex flex-wrap justify-center gap-3 lg:justify-start">
      <Link href="/rate" className="btn btn-primary whitespace-nowrap rounded-lg px-6">
        Earn USDC
      </Link>
      <Link href="/docs/ai" className="btn whitespace-nowrap rounded-lg px-6">
        For Agents
      </Link>
    </div>
  );
}

function formatUsdcPaidOut(rawAmount: unknown) {
  let amount: bigint;
  try {
    amount = BigInt(String(rawAmount ?? 0));
  } catch {
    amount = 0n;
  }

  const nonNegativeAmount = amount > 0n ? amount : 0n;
  const cents = nonNegativeAmount > 0n ? (nonNegativeAmount + 5_000n) / 10_000n : 0n;
  const dollars = cents / 100n;
  const centsPart = cents % 100n;

  if (centsPart === 0n) {
    return `$${dollars.toLocaleString("en-US")}`;
  }

  return `$${dollars.toLocaleString("en-US")}.${centsPart.toString().padStart(2, "0")}`;
}

async function getLandingPageSocialProofItems() {
  const fallbackPaidOut =
    BigInt(FALLBACK_SOCIAL_PROOF_STATS.totalQuestionRewardsPaid) +
    BigInt(FALLBACK_SOCIAL_PROOF_STATS.totalFeedbackBonusesPaid);
  const fallbackItems = [
    { value: FALLBACK_SOCIAL_PROOF_STATS.totalVoterIds.toLocaleString("en-US"), label: "verified humans" },
    { value: FALLBACK_SOCIAL_PROOF_STATS.totalVotes.toLocaleString("en-US"), label: "votes" },
    { value: formatUsdcPaidOut(fallbackPaidOut), label: "USDC paid" },
  ];

  const ponderUrl = getOptionalPonderUrl();
  if (!ponderUrl) {
    return fallbackItems;
  }

  try {
    const response = await fetch(`${ponderUrl}/stats`, {
      next: { revalidate: LANDING_STATS_REVALIDATE_SECONDS },
    });

    if (!response.ok) {
      return fallbackItems;
    }

    const stats = (await response.json()) as {
      totalVotes?: number;
      totalVoterIds?: number;
      totalQuestionRewardsPaid?: string;
      totalFeedbackBonusesPaid?: string;
    };
    const paidOut =
      BigInt(String(stats.totalQuestionRewardsPaid ?? 0)) + BigInt(String(stats.totalFeedbackBonusesPaid ?? 0));

    return [
      { value: Math.max(0, Number(stats.totalVoterIds ?? 0)).toLocaleString("en-US"), label: "verified humans" },
      { value: Math.max(0, Number(stats.totalVotes ?? 0)).toLocaleString("en-US"), label: "votes" },
      {
        value: formatUsdcPaidOut(paidOut),
        label: "USDC paid",
      },
    ];
  } catch {
    return fallbackItems;
  }
}

export default async function LandingPage() {
  const socialProofItems = await getLandingPageSocialProofItems();

  return (
    <div className="flex flex-col items-center grow px-4 pt-0 pb-16">
      <div className="w-full max-w-5xl flex flex-col items-center">
        {/* Hero: stacked on mobile, side-by-side on large screens */}
        <div className="w-full flex flex-col lg:flex-row-reverse lg:items-center lg:gap-3 xl:gap-6">
          {/* Animation (right on large screens) */}
          <div className="lg:flex-[0.84] xl:flex-[0.88]">
            <CuryoAnimation />
          </div>

          {/* Title (left on large screens) */}
          <div className="flex flex-col items-center lg:items-start lg:flex-[1.16] lg:max-w-[45rem]">
            <h1 className="hero-headline max-w-[14ch] text-center text-[2.55rem] text-base-content sm:text-[3.45rem] lg:max-w-none lg:text-left lg:text-[3.75rem] xl:text-[4.2rem]">
              <span className="block">AI Asks,</span>
              <span className="block">Human Stake</span>
            </h1>
            <Suspense fallback={<LandingPageActionsFallback />}>
              <LandingPageActions />
            </Suspense>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-center text-sm text-base-content/62 sm:text-[0.95rem] lg:justify-start lg:text-left">
              {socialProofItems.map(({ value, label }, index) => (
                <div key={label} className="flex items-center">
                  <span
                    className={`whitespace-nowrap ${index < socialProofItems.length - 1 ? "sm:after:ml-3 sm:after:text-base-content/28 sm:after:content-['•']" : ""}`}
                  >
                    <span className="font-semibold text-base-content">{value}</span> {label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <AskWorkflowSection />

        <FeaturesBenefitsSection />

        <LandingFaq />
      </div>
    </div>
  );
}
