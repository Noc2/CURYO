import { redirect } from "next/navigation";
import {
  ChartBarSquareIcon,
  EyeSlashIcon,
  ScaleIcon,
  ShieldCheckIcon,
  UserGroupIcon,
} from "@heroicons/react/24/outline";
import { CuryoAnimation } from "~~/components/home/CuryoAnimation";
import { LandingPageActions } from "~~/components/home/LandingPageActions";
import { SignalDivider, SignalMetricBadge, SignalPanel, SignalPill } from "~~/components/shared/SignalElements";

const STEPS = [
  {
    icon: ShieldCheckIcon,
    eyebrow: "Verified input",
    title: "Verify Humanity",
    description: "Claim one privacy-preserving Voter ID and cREP so each rating comes from a real human.",
    color: "#FFC43D",
  },
  {
    icon: EyeSlashIcon,
    eyebrow: "Hidden consensus",
    title: "Blind Vote with Stake",
    description: "Vote UP or DOWN on content with cREP. Your direction stays hidden during the blind phase.",
    color: "#359EEE",
  },
  {
    icon: ScaleIcon,
    eyebrow: "Public output",
    title: "Reveal and Settle",
    description:
      "After the blind phase, votes are revealed. Winning voters earn rewards, and the content's rating updates.",
    color: "#03CEA4",
  },
];

export default async function LandingPage({ searchParams }: { searchParams: Promise<{ content?: string }> }) {
  const params = await searchParams;
  if (params.content) {
    redirect(`/vote?content=${encodeURIComponent(params.content)}`);
  }

  return (
    <div className="flex flex-col items-center grow px-4 pt-0 pb-16">
      <div className="w-full max-w-6xl flex flex-col items-center">
        {/* Hero: stacked on mobile, side-by-side on large screens */}
        <div className="w-full flex flex-col gap-8 lg:flex-row-reverse lg:items-center lg:gap-10">
          {/* Animation (right on large screens) */}
          <div className="lg:flex-1">
            <CuryoAnimation />
          </div>

          {/* Title (left on large screens) */}
          <div className="flex flex-col items-center lg:items-start lg:flex-1">
            <SignalPill tone="primary" className="-mt-2 lg:mt-0">
              Live quality signals
            </SignalPill>
            <h1 className="text-7xl sm:text-9xl font-bold tracking-tight -mt-4 lg:mt-2 uppercase">Curyo</h1>
            <p className="mt-3 text-center text-2xl text-base-content/75 sm:text-3xl lg:text-left">
              Quality Signals Backed by Human Reputation
            </p>
            <p className="mt-4 max-w-2xl text-center text-lg leading-8 text-base-content/60 sm:text-xl lg:text-left">
              Verified humans stake reputation on what deserves attention, turning private judgment into a public signal
              people can trust.
            </p>
            <LandingPageActions />
            <SignalPanel accent="success" className="mt-8 w-full max-w-2xl p-5 sm:p-6" intensity="strong">
              <div className="flex flex-col gap-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <SignalPill tone="success">Signal preview</SignalPill>
                    <h2 className="mt-3 text-2xl font-semibold text-white sm:text-[2rem]">What the public sees</h2>
                    <p className="mt-2 max-w-lg text-base leading-7 text-white/[0.62]">
                      A stake-weighted quality score backed by verified humans, not anonymous engagement.
                    </p>
                  </div>
                  <SignalPill tone="warning">Human reputation weighted</SignalPill>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <SignalMetricBadge
                    label="Quality score"
                    value="84"
                    detail="/100"
                    tone="primary"
                    icon={<ChartBarSquareIcon className="h-5 w-5" />}
                  />
                  <SignalMetricBadge
                    label="Verified humans"
                    value="42"
                    detail="backing the rating"
                    tone="success"
                    icon={<UserGroupIcon className="h-5 w-5" />}
                  />
                  <SignalMetricBadge
                    label="Reputation at stake"
                    value="7.2k"
                    detail="cREP"
                    tone="warning"
                    icon={<ScaleIcon className="h-5 w-5" />}
                  />
                </div>

                <SignalDivider label="Signal path" />

                <div className="flex flex-wrap gap-2">
                  <SignalPill tone="warning">Verified humans</SignalPill>
                  <SignalPill tone="primary">Blind votes</SignalPill>
                  <SignalPill tone="success">Public rating</SignalPill>
                </div>
              </div>
            </SignalPanel>
          </div>
        </div>

        {/* How it works */}
        <div className="w-full mt-14">
          <SignalDivider label="How the signal forms" className="mb-6" />
          <h2 className="mb-6 text-center text-4xl font-bold sm:mb-7 sm:text-5xl">
            How it{" "}
            <span
              className="bg-clip-text text-transparent"
              style={{
                backgroundImage: "linear-gradient(90deg, #359EEE, #03CEA4, #FFC43D, #EF476F)",
              }}
            >
              Works
            </span>
          </h2>
          <p className="mx-auto mb-10 max-w-3xl text-center text-xl leading-8 text-base-content/60 sm:text-2xl sm:leading-9">
            Verified Humans Stake on Content to Create Public Ratings.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
            {STEPS.map(({ icon: Icon, eyebrow, title, description, color }) => (
              <SignalPanel key={title} accent="primary" className="h-full p-6 text-center sm:text-left">
                <SignalPill tone="neutral">{eyebrow}</SignalPill>
                <div className="mx-auto mt-5 flex h-20 w-20 items-center justify-center rounded-[1.4rem] border border-white/10 bg-white/[0.03] sm:mx-0">
                  <Icon className="w-10 h-10" style={{ color }} />
                </div>
                <h3 className="mt-5 text-xl font-semibold text-white">{title}</h3>
                <p className="mt-3 text-lg leading-8 text-base-content/60">{description}</p>
              </SignalPanel>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
