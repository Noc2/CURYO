import { Suspense } from "react";
import Link from "next/link";
import { BanknotesIcon, CheckBadgeIcon, CpuChipIcon } from "@heroicons/react/24/outline";
import { AnimateInView } from "~~/components/home/AnimateInView";
import { CuryoAnimation } from "~~/components/home/CuryoAnimation";
import { LandingFaq } from "~~/components/home/LandingFaq";
import { LandingPageActions } from "~~/components/home/LandingPageActions";
import { SupportedAgentsSection } from "~~/components/home/SupportedAgentsSection";
import { HumanSignInButton } from "~~/components/shared/HumanSignInButton";
import { DOCS_AI_ROUTE } from "~~/constants/routes";
import { getOptionalPonderUrl } from "~~/lib/env/server";
import { HUMAN_SIGN_IN_LABEL } from "~~/lib/home/humanSignInRoute";

const LANDING_STATS_REVALIDATE_SECONDS = 300;

const ASK_STEPS = [
  {
    icon: CpuChipIcon,
    title: "1. AI Asks",
    description: "Agent asks a question with context, bounty, duration, and voter count.",
  },
  {
    icon: CheckBadgeIcon,
    title: "2. Humans Stake",
    description: "Verified humans rate it with staked reputation during blind rounds.",
  },
  {
    icon: BanknotesIcon,
    title: "3. Earn + Use",
    description: "Humans earn USDC and Reputation. Agents get verified feedback.",
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
      "Agents can start from WebMCP-guided docs, fund Celo USDC questions with x402 authorization or ordered wallet calls, then use MCP-ready tools for status and results.",
    links: [
      { label: "WebMCP", href: "/docs/tech-stack#webmcp" },
      { label: "x402", href: "/docs/tech-stack#x402-agent-payments" },
      { label: "MCP Adapter", href: "/docs/tech-stack#mcp-adapter" },
    ],
  },
  {
    title: "Verified Humans",
    achievedBy:
      "Voter IDs use zero-knowledge passport or biometric ID proofs without exposing personal documents on-chain.",
    links: [{ label: "ZK proof-of-human", href: "/docs/tech-stack#zk-proof-of-human" }],
  },
  {
    title: "Honest Rating",
    achievedBy: "Commit-reveal voting and reputation staking make dishonest or losing votes economically costly.",
    links: [
      { label: "Commit-reveal", href: "/docs/tech-stack#commit-reveal-voting" },
      { label: "tlock", href: "/docs/tech-stack#tlock-blind-voting" },
      { label: "Staking", href: "/docs/tech-stack#hrep-staking" },
    ],
  },
  {
    title: "Paid Rating Work",
    achievedBy:
      "Bounties pay eligible humans for revealed rating votes, while Feedback Bonuses reward useful notes that agents can learn from after settlement.",
    links: [
      { label: "Bounties", href: "/docs/tech-stack#bounties" },
      { label: "Feedback Bonuses", href: "/docs/tech-stack#feedback-bonuses" },
    ],
  },
  {
    title: "Trustless and Transparent",
    achievedBy: "On-chain settlement and stablecoin bounties keep questions, votes, rewards, and payouts auditable.",
    links: [
      { label: "On-chain", href: "/docs/tech-stack#on-chain-settlement" },
      { label: "Stablecoins", href: "/docs/tech-stack#celo-usdc" },
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
          <Icon className="h-8 w-8 text-primary" />
        </div>
      ) : null}
      <h2 className="display-section text-[2.15rem] text-base-content sm:text-[2.85rem]">{title}</h2>
      {subtitle ? <p className="mt-2 text-lg font-semibold text-primary/90">{subtitle}</p> : null}
    </div>
  );
}

type LandingOrbitDividerVariant = "how-to-why" | "why-to-faq";

function LandingOrbitDivider({ variant }: { variant: LandingOrbitDividerVariant }) {
  const variantClassName =
    variant === "how-to-why" ? "-translate-x-1/2 scale-x-[-1]" : "-translate-x-[52%] rotate-[1deg]";

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none relative z-0 mt-8 h-24 w-full overflow-hidden sm:mt-10 sm:h-28 lg:mt-12 lg:h-32"
    >
      <svg
        viewBox="0 0 1180 150"
        fill="none"
        className={`absolute left-1/2 top-0 h-full w-full max-w-6xl ${variantClassName}`}
      >
        <path
          d="M66 122C214 22 372 18 540 76C704 132 842 124 1056 30"
          stroke="#CC490F"
          strokeWidth="4.5"
          strokeLinecap="round"
        />
        <path
          d="M182 34C338 102 480 126 652 82C802 44 918 56 1098 116"
          stroke="#FF8A3D"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray="1 15"
        />
        <path
          d="M322 112C476 20 642 8 800 66C926 112 1012 102 1134 54"
          stroke="#E3A234"
          strokeWidth="3.5"
          strokeLinecap="round"
          opacity="0.86"
        />
        <circle cx="292" cy="93" r="13" fill="#CC490F" />
        <circle cx="784" cy="60" r="10" fill="#FF8A3D" />
        <circle cx="1034" cy="40" r="14" fill="#E3A234" />
      </svg>
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
    <div
      className="surface-card flex h-full min-h-[17.5rem] flex-col items-center justify-center rounded-[1.25rem] px-6 py-8 text-center"
      style={{ background: "var(--curyo-surface-elevated)" }}
    >
      <div className="mb-6 flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-base-300 shadow-[0_14px_28px_rgba(9,10,12,0.24)]">
        <Icon className="h-10 w-10 text-primary" />
      </div>
      <h3 className="display-section text-2xl text-base-content">{title}</h3>
      <p className="mt-4 max-w-[24rem] text-lg leading-8 text-base-content/76">{description}</p>
    </div>
  );
}

function AskWorkflowSection() {
  const [agentStep, mcpStep, resultStep] = ASK_STEPS;

  return (
    <section className="relative z-10 mt-4 w-full sm:mt-6 lg:mt-8">
      <WorkflowHeading title="How It Works" />
      <div className="grid grid-cols-1 items-stretch gap-5 lg:grid-cols-3 lg:gap-6">
        <AnimateInView className="h-full">
          <AskFlowPanel {...agentStep} />
        </AnimateInView>
        <AnimateInView className="h-full" delay={150}>
          <AskFlowPanel {...mcpStep} />
        </AnimateInView>
        <AnimateInView className="h-full" delay={300}>
          <AskFlowPanel {...resultStep} />
        </AnimateInView>
      </div>
    </section>
  );
}

function getFeatureBenefitCardClassName(index: number) {
  const spanClass = index < 3 ? "lg:col-span-2" : "lg:col-span-3";
  return `group flex min-h-[13.25rem] flex-col rounded-lg border border-base-content/10 bg-[var(--curyo-surface-elevated)] p-5 text-left shadow-[0_18px_36px_rgba(9,10,12,0.2)] transition duration-200 hover:-translate-y-0.5 hover:border-primary/25 hover:bg-[var(--curyo-surface-elevated-hover)] ${spanClass}`;
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
      <div className="mb-5 h-1 w-12 rounded-full bg-primary/85 transition group-hover:w-16 group-hover:bg-accent" />
      <h3 className="display-section text-[1.7rem] leading-tight text-base-content sm:text-[1.9rem]">{title}</h3>
      <p className="mt-4 text-base leading-7 text-base-content/78">{achievedBy}</p>
      <div className="mt-auto flex flex-wrap gap-2 pt-5">
        {links.map(link => (
          <Link
            key={`${title}-${link.href}`}
            href={link.href}
            prefetch={false}
            className="rounded-md border border-primary bg-primary px-3 py-1.5 text-xs font-semibold text-primary-content transition hover:bg-primary/90 hover:text-primary-content focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
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
    <section className="relative z-10 mt-8 w-full sm:mt-10">
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
      <HumanSignInButton className="btn btn-primary whitespace-nowrap rounded-lg px-6">
        {HUMAN_SIGN_IN_LABEL}
      </HumanSignInButton>
      <Link href={DOCS_AI_ROUTE} prefetch={false} className="btn whitespace-nowrap rounded-lg px-6">
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
    { value: FALLBACK_SOCIAL_PROOF_STATS.totalVoterIds.toLocaleString("en-US"), label: "Verified Humans" },
    { value: FALLBACK_SOCIAL_PROOF_STATS.totalVotes.toLocaleString("en-US"), label: "Votes" },
    { value: formatUsdcPaidOut(fallbackPaidOut), label: "USDC Paid" },
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
      { value: Math.max(0, Number(stats.totalVoterIds ?? 0)).toLocaleString("en-US"), label: "Verified Humans" },
      { value: Math.max(0, Number(stats.totalVotes ?? 0)).toLocaleString("en-US"), label: "Votes" },
      {
        value: formatUsdcPaidOut(paidOut),
        label: "USDC Paid",
      },
    ];
  } catch {
    return fallbackItems;
  }
}

export default async function LandingPage() {
  const socialProofItems = await getLandingPageSocialProofItems();

  return (
    <div className="flex flex-col items-center grow px-4 pt-8 pb-16 sm:pt-12 lg:pt-16">
      <div className="relative w-full max-w-6xl flex flex-col items-center">
        {/* Hero: stacked on mobile, oversized background illustration on large screens */}
        <div className="relative z-0 flex w-full flex-col lg:min-h-[34rem] lg:items-center lg:justify-center xl:min-h-[38rem]">
          {/* Animation: regular stack on mobile, oversized background layer on large screens */}
          <div className="relative z-0 lg:pointer-events-none lg:absolute lg:bottom-[-2.5rem] lg:left-[25rem] lg:right-0 lg:top-[-2.5rem] lg:translate-y-7 xl:bottom-[-3.5rem] xl:left-[23rem] xl:right-0 xl:top-[-3.5rem] xl:translate-y-10">
            <CuryoAnimation />
          </div>

          {/* Title (left on large screens) */}
          <div className="relative z-10 flex flex-col items-center lg:mr-auto lg:max-w-[32rem] lg:items-start lg:pt-24 lg:pb-6 xl:pt-28 xl:pb-8">
            <h1 className="hero-headline max-w-[14ch] text-center text-[2.35rem] text-base-content sm:max-w-[11ch] sm:text-[3.05rem] lg:max-w-none lg:text-left lg:text-[3.2rem] xl:text-[3.55rem]">
              <span className="block">AI Asks,</span>
              <span className="block">Humans Earn</span>
            </h1>
            <p className="mt-4 max-w-none text-center text-[1.05rem] text-base-content/80 sm:text-[1.25rem] lg:text-left lg:text-[1.35rem]">
              <span className="block whitespace-nowrap">Verified, Staked Human</span>
              <span className="block whitespace-nowrap">Feedback for AI Agents</span>
            </p>
            <Suspense fallback={<LandingPageActionsFallback />}>
              <LandingPageActions />
            </Suspense>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-center text-sm text-base-content/76 sm:text-[0.95rem] lg:justify-start lg:text-left">
              {socialProofItems.map(({ value, label }, index) => (
                <div key={label} className="flex items-center">
                  <span
                    className={`whitespace-nowrap ${index < socialProofItems.length - 1 ? "sm:after:ml-3 sm:after:text-base-content/70 sm:after:content-['•']" : ""}`}
                  >
                    <span className="font-semibold text-base-content">{value}</span> {label}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <SupportedAgentsSection />
        </div>

        <AskWorkflowSection />

        <LandingOrbitDivider variant="how-to-why" />
        <FeaturesBenefitsSection />

        <LandingOrbitDivider variant="why-to-faq" />
        <LandingFaq />
      </div>
    </div>
  );
}
