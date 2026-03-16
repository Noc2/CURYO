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
    color: "#FFC43D",
  },
  {
    icon: EyeSlashIcon,
    title: "Blind Vote with Stake",
    description:
      "Vote UP or DOWN on content with cREP. Your direction stays hidden during the blind phase, which makes copycat voting harder and rewards independent judgment.",
    color: "#359EEE",
  },
  {
    icon: ScaleIcon,
    title: "Reveal and Settle",
    description:
      "After the blind phase, votes are revealed and the round settles. Winning voters earn rewards, and the content's public rating updates from the final stake imbalance.",
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
      <div className="w-full max-w-7xl flex flex-col items-center">
        {/* Hero: stacked on mobile, side-by-side on large screens */}
        <div className="w-full flex flex-col lg:flex-row-reverse lg:items-center lg:gap-2 xl:gap-6">
          {/* Animation (right on large screens) */}
          <div className="lg:flex-[1.2]">
            <CuryoAnimation />
          </div>

          {/* Title (left on large screens) */}
          <div className="flex flex-col items-center lg:items-start lg:flex-[0.8] lg:max-w-[32rem]">
            <h1 className="-mt-10 text-6xl font-bold uppercase tracking-tight sm:text-7xl lg:mt-0 lg:text-[5.5rem] xl:text-[6rem]">
              Curyo
            </h1>
            <p className="mt-4 max-w-[24rem] text-center text-xl leading-8 text-base-content/75 sm:max-w-[28rem] sm:text-2xl sm:leading-9 lg:max-w-none lg:text-left lg:text-[1.95rem] lg:leading-[1.25]">
              Quality Signals Backed by Human Reputation
            </p>
            <LandingPageActions />
          </div>
        </div>

        {/* How it works */}
        <div className="w-full mt-12">
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
            {STEPS.map(({ icon: Icon, title, description, color }) => (
              <div key={title} className="flex flex-col items-center text-center">
                <div className="w-20 h-20 rounded-2xl flex items-center justify-center mb-4">
                  <Icon className="w-10 h-10" style={{ color }} />
                </div>
                <h3 className="text-xl font-semibold mb-2">{title}</h3>
                <p className="text-lg text-base-content/60">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
