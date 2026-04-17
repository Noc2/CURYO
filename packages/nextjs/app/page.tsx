import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckBadgeIcon,
  CpuChipIcon,
  EyeSlashIcon,
  ScaleIcon,
  ServerStackIcon,
  ShieldCheckIcon,
  UserGroupIcon,
} from "@heroicons/react/24/outline";
import { CuryoAnimation } from "~~/components/home/CuryoAnimation";
import { LandingFaq } from "~~/components/home/LandingFaq";
import { LandingPageActions } from "~~/components/home/LandingPageActions";
import { RATE_ROUTE, buildRouteWithSearchParams } from "~~/constants/routes";
import { getOptionalPonderUrl } from "~~/lib/env/server";

const LANDING_STATS_REVALIDATE_SECONDS = 300;

const RATE_STEPS = [
  {
    icon: ShieldCheckIcon,
    title: "Get Verified",
    description: "Claim your Voter ID and cREP, a decentralized reputation token with a fair launch.",
  },
  {
    icon: EyeSlashIcon,
    title: "Rate with Stake",
    description: "Rate content up or down with cREP. Your direction stays hidden during the 20-minute blind phase.",
  },
  {
    icon: ScaleIcon,
    title: "Settle and Earn",
    description:
      "Reveal after the blind phase. Winning voters earn cREP rewards; funded questions also pay voters in USDC.",
  },
];

const ASK_STEPS = [
  {
    icon: CpuChipIcon,
    title: "AI Agent",
    label: "Agent asks",
    description: "An agent (or human) sends a question, context, and USDC bounty to Curyo.",
  },
  {
    icon: ServerStackIcon,
    title: "Curyo",
    label: "Humans settle",
    description: "Curyo opens the funded question, tracks the voter round, and routes it to verified humans.",
  },
  {
    icon: CheckBadgeIcon,
    title: "Settled Rating",
    label: "Agent reads",
    description: "The settled human signal returns to the same agent, so it can act on trusted input.",
  },
];

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

function HumanWorkflowSection() {
  return (
    <section className="mt-14 w-full">
      <WorkflowHeading title="Verified Human Round" subtitle="For Humans" icon={UserGroupIcon} />
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
        {RATE_STEPS.map(({ icon: Icon, title: stepTitle, description }, index) => (
          <div
            key={stepTitle}
            className="surface-card flex h-full flex-col items-center rounded-[1.75rem] px-6 py-7 text-center"
          >
            <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-2xl bg-base-300 shadow-[0_14px_28px_rgba(9,10,12,0.24)]">
              <Icon className="h-10 w-10 text-primary" />
            </div>
            <h3 className="display-section mb-3 text-2xl text-base-content">
              {index + 1}. {stepTitle}
            </h3>
            <p className="text-lg text-base-content/60">{description}</p>
          </div>
        ))}
      </div>
    </section>
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
  label,
  title,
  description,
  children,
  emphasis = false,
}: {
  icon: typeof CpuChipIcon;
  label: string;
  title: string;
  description: React.ReactNode;
  children?: React.ReactNode;
  emphasis?: boolean;
}) {
  return (
    <div
      className={`surface-card flex h-full flex-col rounded-[1.25rem] px-5 py-6 text-left ${
        emphasis ? "min-h-[19rem] lg:px-6" : "min-h-[17rem]"
      }`}
    >
      <div className="mb-5 flex items-start justify-between gap-4">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-base-300 shadow-[0_14px_28px_rgba(9,10,12,0.24)]">
          <Icon className="h-9 w-9 text-primary" />
        </div>
        <span className="rounded-full border border-accent/25 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-accent/80">
          {label}
        </span>
      </div>
      <h3 className="display-section text-2xl text-base-content">{title}</h3>
      <p className="mt-3 text-base leading-7 text-base-content/62">{description}</p>
      {children}
    </div>
  );
}

function AskWorkflowSection() {
  const [agentStep, mcpStep, resultStep] = ASK_STEPS;

  return (
    <section className="mt-12 w-full">
      <WorkflowHeading title="How it Works" subtitle="AI and Humans" />
      <div className="relative">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_4.5rem_minmax(0,1.28fr)_4.5rem_minmax(0,1fr)] lg:items-center lg:gap-5">
          <AskFlowPanel {...agentStep}>
            <div className="mt-5 flex flex-wrap gap-2 text-sm font-semibold text-base-content/66">
              <Link
                href="/docs/ai#x402-agent-payments"
                className="rounded-full bg-base-300 px-3 py-1.5 transition hover:bg-primary/15 hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                x402
              </Link>
              <Link
                href="/docs/ai#mcp-adapter-shape"
                className="rounded-full bg-base-300 px-3 py-1.5 transition hover:bg-primary/15 hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                MCP
              </Link>
            </div>
          </AskFlowPanel>

          <FlowConnector label="question + bounty" />

          <AskFlowPanel {...mcpStep} emphasis>
            <div className="mt-5 rounded-2xl bg-base-300/80 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.16em] text-base-content/45">
                <UserGroupIcon className="h-5 w-5 text-accent/80" />
                Verified human round
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 text-center text-sm font-semibold text-base-content/68">
                <span className="rounded-xl bg-base-200 px-2 py-3">stake</span>
                <span className="rounded-xl bg-base-200 px-2 py-3">reveal</span>
                <span className="rounded-xl bg-base-200 px-2 py-3">settle</span>
              </div>
            </div>
          </AskFlowPanel>

          <FlowConnector label="settled rating" />

          <AskFlowPanel {...resultStep}>
            <div className="mt-5 rounded-2xl border border-accent/20 bg-accent/10 px-4 py-3">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-accent/75">returned signal</div>
              <div className="mt-2 text-lg font-semibold text-base-content">human-rated result</div>
            </div>
          </AskFlowPanel>
        </div>

        <div className="mt-5 flex items-center gap-3 rounded-full border border-accent/20 bg-base-200/70 px-4 py-3 text-sm font-semibold text-accent/80 lg:mx-6">
          <ArrowLeftIcon className="h-5 w-5 shrink-0" />
          <div className="hidden h-px flex-1 bg-gradient-to-l from-primary/20 via-accent/55 to-accent/80 sm:block" />
          <span className="shrink-0 text-center">settled signal returns to the AI agent</span>
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
        <HumanWorkflowSection />

        <LandingFaq />
      </div>
    </div>
  );
}
