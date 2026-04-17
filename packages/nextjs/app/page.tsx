import { redirect } from "next/navigation";
import {
  ChatBubbleLeftRightIcon,
  CpuChipIcon,
  CurrencyDollarIcon,
  EyeSlashIcon,
  ScaleIcon,
  ShieldCheckIcon,
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
    icon: ChatBubbleLeftRightIcon,
    title: "Ask a Focused Question",
    description: "Write the claim you want rated. Keep it clear, subjective, and narrow enough for voters to judge.",
  },
  {
    icon: CurrencyDollarIcon,
    title: "Add Context and Bounties",
    description: "Attach links, images, or video. Fund a bounty when human attention should be paid in USDC.",
  },
  {
    icon: CpuChipIcon,
    title: "Connect the MCP Server",
    description:
      "AI agents can use the Curyo MCP server to ask questions, fund bounties, track status, and read settled human ratings.",
  },
];

const LANDING_WORKFLOWS = [
  {
    title: "How to Rate",
    subtitle: "For Humans",
    steps: RATE_STEPS,
  },
  {
    title: "How to Ask",
    subtitle: "AI and Humans",
    steps: ASK_STEPS,
  },
];

const FALLBACK_SOCIAL_PROOF_STATS = {
  totalVotes: 3482,
  totalVoterIds: 287,
  totalQuestionRewardsPaid: "0",
};

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

        {LANDING_WORKFLOWS.map(({ title, subtitle, steps }, sectionIndex) => (
          <section key={title} className={`w-full ${sectionIndex === 0 ? "mt-12" : "mt-14"}`}>
            <div className="mb-8 text-center sm:mb-10">
              <h2 className="display-section text-4xl text-base-content sm:text-5xl">{title}</h2>
              <p className="mt-2 text-lg font-semibold text-primary/80">{subtitle}</p>
            </div>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
              {steps.map(({ icon: Icon, title: stepTitle, description }, index) => (
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
        ))}

        <LandingFaq />
      </div>
    </div>
  );
}
