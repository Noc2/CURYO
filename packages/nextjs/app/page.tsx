import { redirect } from "next/navigation";
import { GlobeAltIcon, IdentificationIcon, PlusCircleIcon } from "@heroicons/react/24/outline";
import { LandingPageActions } from "~~/components/home/LandingPageActions";
import { LandingPageAnimation } from "~~/components/home/LandingPageAnimation";

const STEPS = [
  {
    icon: IdentificationIcon,
    title: "Reputation",
    description: "A privacy-preserving proof of personhood lets you claim cREP tokens and build reputation.",
    color: "#FFC43D",
  },
  {
    icon: GlobeAltIcon,
    title: "The Future of Rating",
    description: "Use your reputation to vote on content, stake on your judgment, and grow your influence.",
    color: "#359EEE",
  },
  {
    icon: PlusCircleIcon,
    title: "Decentralized Community",
    description: "Join a community that lets anyone contribute and is fully decentralized from day one.",
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
        <div className="w-full flex flex-col lg:flex-row-reverse lg:items-center lg:gap-8">
          {/* Animation (right on large screens) */}
          <div className="lg:flex-1">
            <LandingPageAnimation />
          </div>

          {/* Title (left on large screens) */}
          <div className="flex flex-col items-center lg:items-start lg:flex-1">
            <h1 className="text-7xl sm:text-9xl font-bold tracking-tight -mt-8 lg:mt-0 uppercase">Curyo</h1>
            <p className="text-2xl sm:text-3xl text-base-content/60 mt-3 text-center lg:text-left">
              The Reputation Game for the
              <br />
              Age of AI (Beta)
            </p>
            <LandingPageActions />
          </div>
        </div>

        {/* How it works */}
        <div className="w-full mt-12">
          <h2 className="text-4xl sm:text-5xl font-bold text-center mb-12">
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
