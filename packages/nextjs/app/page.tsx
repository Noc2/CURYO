import { redirect } from "next/navigation";
import { GlobeAltIcon, IdentificationIcon, PlusCircleIcon } from "@heroicons/react/24/outline";
import { CuryoAnimation } from "~~/components/home/CuryoAnimation";
import { LandingPageActions } from "~~/components/home/LandingPageActions";

const STEPS = [
  {
    icon: IdentificationIcon,
    title: "Verify Humanity",
    description: "Claim a privacy-preserving Voter ID, mint cREP, and establish your signal as a real person.",
    color: "#FFC76A",
  },
  {
    icon: GlobeAltIcon,
    title: "Curate the Frontier",
    description: "Use cREP to rate frontier content, stake on your judgment, and separate durable signal from noise.",
    color: "#8EB6FF",
  },
  {
    icon: PlusCircleIcon,
    title: "Shape the Orbit",
    description:
      "Submit what matters, grow your public track record, and help govern a reputation layer built in the open.",
    color: "#03CEA4",
  },
];

export default async function LandingPage({ searchParams }: { searchParams: Promise<{ content?: string }> }) {
  const params = await searchParams;
  if (params.content) {
    redirect(`/vote?content=${encodeURIComponent(params.content)}`);
  }

  return (
    <div className="relative flex flex-col items-center grow px-4 pt-4 pb-20">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[38rem] bg-[radial-gradient(60rem_34rem_at_14%_4%,rgba(110,132,255,0.16),transparent_62%),radial-gradient(36rem_24rem_at_88%_8%,rgba(255,124,181,0.12),transparent_58%),radial-gradient(34rem_22rem_at_48%_78%,rgba(99,230,210,0.08),transparent_64%)]" />
      <div className="relative w-full max-w-6xl flex flex-col items-center">
        <div className="w-full rounded-[2rem] border border-white/8 bg-[linear-gradient(180deg,rgba(18,22,34,0.78),rgba(10,12,20,0.72))] px-6 py-8 shadow-[0_32px_80px_rgba(0,0,0,0.28)] sm:px-8 lg:px-10 lg:py-10">
          <div className="w-full flex flex-col lg:flex-row-reverse lg:items-center lg:gap-10">
            <div className="lg:flex-1">
              <CuryoAnimation />
            </div>

            <div className="flex flex-col items-center lg:items-start lg:flex-1">
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-1.5 text-sm font-semibold uppercase tracking-[0.28em] text-base-content/55">
                Frontier Reputation
              </span>
              <h1 className="mt-6 text-7xl sm:text-9xl font-bold tracking-tight lg:mt-0 uppercase">Curyo</h1>
              <p className="text-2xl sm:text-3xl text-base-content/68 mt-4 text-center lg:text-left">
                Quality Signals Backed by Human Reputation
              </p>
              <p className="mt-5 max-w-2xl text-lg leading-8 text-base-content/62 text-center lg:text-left">
                Verified Humans Stake on Content to Create Public Ratings.
              </p>
              <LandingPageActions />
            </div>
          </div>
        </div>

        {/* How it works */}
        <div className="w-full mt-16">
          <h2 className="text-4xl sm:text-5xl font-bold text-center mb-4">
            How Signal{" "}
            <span
              className="bg-clip-text text-transparent"
              style={{
                backgroundImage: "linear-gradient(90deg, #8EB6FF, #63E6D2, #FFC76A, #FF9FC2)",
              }}
            >
              Finds Orbit
            </span>
          </h2>
          <p className="mx-auto mb-12 max-w-2xl text-center text-lg leading-8 text-base-content/58">
            Curyo turns frontier curation into a public, stake-backed signal layer.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
            {STEPS.map(({ icon: Icon, title, description, color }) => (
              <div key={title} className="surface-card rounded-[1.75rem] p-6 text-center">
                <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border border-white/8 bg-white/[0.04] shadow-[0_18px_40px_rgba(0,0,0,0.18)]">
                  <Icon className="w-9 h-9" style={{ color }} />
                </div>
                <h3 className="mt-5 text-xl font-semibold">{title}</h3>
                <p className="mt-3 text-lg leading-8 text-base-content/60">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
