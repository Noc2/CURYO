import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckBadgeIcon,
  CpuChipIcon,
  ServerStackIcon,
} from "@heroicons/react/24/outline";
import { CuryoAnimation } from "~~/components/home/CuryoAnimation";
import { LandingFaq } from "~~/components/home/LandingFaq";
import { LandingPageActions } from "~~/components/home/LandingPageActions";
import { RATE_ROUTE, buildRouteWithSearchParams } from "~~/constants/routes";
import { getOptionalPonderUrl } from "~~/lib/env/server";

const LANDING_STATS_REVALIDATE_SECONDS = 300;

const ASK_STEPS = [
  {
    icon: CpuChipIcon,
    title: "AI Asks",
    description: "An agent (or human) sends a question and a USDC bounty to Curyo.",
    techLinks: [
      { label: "x402", href: "/docs/ai#x402-agent-payments" },
      { label: "MCP", href: "/docs/ai#mcp-adapter-shape" },
    ],
  },
  {
    icon: ServerStackIcon,
    title: "Curyo",
    description:
      "Curyo shares the question with verified humans, who rate it with staked cREP reputation in 20-minute blind phases.",
    techLinks: [
      { label: "On-chain", href: "/docs/how-it-works#on-chain-settlement" },
      { label: "Commit-reveal", href: "/docs/how-it-works#commit-reveal-voting" },
    ],
  },
  {
    icon: CheckBadgeIcon,
    title: "Humans Answer",
    description: "Winning voters earn cREP reputation; funded questions also pay out USDC bounties.",
    techLinks: [
      { label: "ZK proof-of-human", href: "/docs/how-it-works#zk-proof-of-human" },
      { label: "Stablecoins", href: "/docs/how-it-works#stablecoin-bounties" },
    ],
  },
];

type TechLink = {
  label: string;
  href: string;
};

const FALLBACK_SOCIAL_PROOF_STATS = {
  totalVotes: 3482,
  totalVoterIds: 287,
  totalQuestionRewardsPaid: "0",
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

function FlowConnector({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center">
      <div className="hidden w-full flex-col items-center gap-2 text-center lg:flex">
        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-base-content/45">{label}</span>
        <div className="flex w-full items-center gap-2 text-primary/70">
          <div className="h-px flex-1 bg-gradient-to-r from-primary/20 via-primary/60 to-accent/70" />
          <ArrowRightIcon className="h-5 w-5 shrink-0" />
        </div>
      </div>
      <div className="flex flex-col items-center gap-2 text-center lg:hidden">
        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-base-content/45">{label}</span>
        <div className="h-8 w-px bg-gradient-to-b from-primary/40 to-accent/70" />
        <ArrowDownIcon className="h-5 w-5 text-primary/70" />
      </div>
    </div>
  );
}

function AskFlowPanel({
  icon: Icon,
  title,
  description,
  techLinks,
  emphasis = false,
}: {
  icon: typeof CpuChipIcon;
  title: string;
  description: React.ReactNode;
  techLinks: TechLink[];
  emphasis?: boolean;
}) {
  return (
    <div
      className={`surface-card flex h-full flex-col rounded-[1.25rem] px-5 py-6 text-left ${
        emphasis ? "min-h-[17rem] lg:px-6" : "min-h-[16rem]"
      }`}
    >
      <div className="mb-5 flex items-start justify-between gap-4">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-base-300 shadow-[0_14px_28px_rgba(9,10,12,0.24)]">
          <Icon className="h-9 w-9 text-primary" />
        </div>
      </div>
      <h3 className="display-section text-2xl text-base-content">{title}</h3>
      <p className="mt-3 text-base leading-7 text-base-content/62">{description}</p>
      <div className="mt-auto flex flex-wrap gap-2 pt-5 text-xs font-semibold text-base-content/66">
        {techLinks.map(techLink => (
          <Link
            key={techLink.href}
            href={techLink.href}
            className="rounded-full border border-accent/18 bg-base-300/45 px-3 py-1.5 uppercase tracking-[0.12em] transition hover:border-accent/35 hover:bg-accent/10 hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            {techLink.label}
          </Link>
        ))}
      </div>
    </div>
  );
}

function AskWorkflowSection() {
  const [agentStep, mcpStep, resultStep] = ASK_STEPS;

  return (
    <section className="mt-12 w-full">
      <WorkflowHeading title="How It Works" />
      <div className="relative">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_4.5rem_minmax(0,1.28fr)_4.5rem_minmax(0,1fr)] lg:items-center lg:gap-5">
          <AskFlowPanel {...agentStep} />

          <FlowConnector label="question + bounty" />

          <AskFlowPanel {...mcpStep} emphasis />

          <FlowConnector label="Revealed Rating" />

          <AskFlowPanel {...resultStep} />
        </div>

        <div className="mt-5 flex items-center gap-3 rounded-full border border-accent/20 bg-base-200/70 px-4 py-3 text-sm font-semibold text-accent/80 lg:mx-6">
          <ArrowLeftIcon className="h-5 w-5 shrink-0" />
          <div className="hidden h-px flex-1 bg-gradient-to-l from-primary/20 via-accent/55 to-accent/80 sm:block" />
          <span className="shrink-0 text-center">AI agent benefits from the human-rated result</span>
        </div>
      </div>
    </section>
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
  const fallbackItems = [
    { value: FALLBACK_SOCIAL_PROOF_STATS.totalVoterIds.toLocaleString("en-US"), label: "verified humans" },
    { value: FALLBACK_SOCIAL_PROOF_STATS.totalVotes.toLocaleString("en-US"), label: "votes" },
    { value: formatUsdcPaidOut(FALLBACK_SOCIAL_PROOF_STATS.totalQuestionRewardsPaid), label: "paid out" },
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
    };

    return [
      { value: Math.max(0, Number(stats.totalVoterIds ?? 0)).toLocaleString("en-US"), label: "verified humans" },
      { value: Math.max(0, Number(stats.totalVotes ?? 0)).toLocaleString("en-US"), label: "votes" },
      {
        value: formatUsdcPaidOut(stats.totalQuestionRewardsPaid),
        label: "paid out",
      },
    ];
  } catch {
    return fallbackItems;
  }
}

export default async function LandingPage({ searchParams }: { searchParams: Promise<{ content?: string }> }) {
  const params = await searchParams;
  if (params.content) {
    redirect(buildRouteWithSearchParams(RATE_ROUTE, { content: params.content }));
  }

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
              <span className="block">Human Reputation</span>
              <span className="block">at Stake</span>
            </h1>
            <p className="mt-5 max-w-[31rem] text-center text-lg leading-7 text-base-content/72 sm:max-w-[35rem] sm:text-xl sm:leading-8 lg:max-w-[33rem] lg:text-left lg:text-[1.55rem] lg:leading-[1.45]">
              Get Verified, Rate with Stake, and Earn USDC
            </p>
            <LandingPageActions />
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

        <LandingFaq />
      </div>
    </div>
  );
}
