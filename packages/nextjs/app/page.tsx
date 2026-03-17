import { redirect } from "next/navigation";
import { EyeSlashIcon, ScaleIcon, ShieldCheckIcon } from "@heroicons/react/24/outline";
import { CuryoAnimation } from "~~/components/home/CuryoAnimation";
import { LandingPageActions } from "~~/components/home/LandingPageActions";

const STEPS = [
  {
    icon: ShieldCheckIcon,
    title: "Verify Humanity",
    description:
      "Claim one privacy-preserving Voter ID and cREP so each rating comes from a real human with a fair stake limit.",
  },
  {
    icon: EyeSlashIcon,
    title: "Blind Vote with Stake",
    description:
      "Vote UP or DOWN on content with cREP. Your direction stays hidden during the blind phase, which makes copycat voting harder and rewards independent judgment.",
  },
  {
    icon: ScaleIcon,
    title: "Reveal and Settle",
    description:
      "After the blind phase, votes are revealed and the round settles. Winning voters earn rewards, and the content's public rating updates from the final stake imbalance.",
  },
];

export default async function LandingPage({ searchParams }: { searchParams: Promise<{ content?: string }> }) {
  const params = await searchParams;
  if (params.content) {
    redirect(`/vote?content=${encodeURIComponent(params.content)}`);
  }

  return (
    <div className="flex flex-col items-center grow px-4 pt-0 pb-16">
      <div className="w-full max-w-7xl flex flex-col items-center">
        {/* Hero: stacked on mobile, side-by-side on large screens */}
        <div className="w-full flex flex-col lg:flex-row-reverse lg:items-center lg:gap-6 xl:gap-10">
          {/* Animation (right on large screens) */}
          <div className="lg:flex-[1.02]">
            <CuryoAnimation />
          </div>

          {/* Title (left on large screens) */}
          <div className="flex flex-col items-center lg:items-start lg:flex-[0.98] lg:max-w-[35rem]">
            <h1 className="display-hero text-6xl text-base-content sm:text-7xl lg:text-[5.75rem] xl:text-[6.25rem]">
              Curyo
            </h1>
            <p className="mt-4 max-w-[24rem] text-center text-xl leading-8 text-base-content/75 sm:max-w-[32rem] sm:text-2xl sm:leading-9 lg:max-w-none lg:text-left lg:text-[1.95rem] lg:leading-[1.25]">
              A Better Web, Guided by Human Reputation
            </p>
            <LandingPageActions />
          </div>
        </div>

        {/* How it works */}
        <div className="w-full mt-12">
          <h2 className="display-section mb-6 text-center text-4xl text-base-content sm:mb-7 sm:text-5xl">
            How it <span className="text-base-content">Works</span>
          </h2>
          <p className="mx-auto mb-10 max-w-3xl text-center text-xl leading-8 text-base-content/60 sm:text-2xl sm:leading-9">
            Verified Humans Stake on Content to Create Public Ratings.
          </p>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
            {STEPS.map(({ icon: Icon, title, description }) => (
              <div
                key={title}
                className="surface-card flex h-full flex-col items-center rounded-[1.75rem] px-6 py-7 text-center"
              >
                <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-2xl bg-base-300 shadow-[0_14px_28px_rgba(9,10,12,0.24)]">
                  <Icon className="h-10 w-10 text-primary" />
                </div>
                <h3 className="display-section mb-2 text-2xl text-base-content">{title}</h3>
                <p className="text-lg text-base-content/60">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
