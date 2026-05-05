import Image from "next/image";
import Link from "next/link";
import { BanknotesIcon, CheckBadgeIcon, CpuChipIcon } from "@heroicons/react/24/outline";
import { DOCS_AI_ROUTE, RATE_ROUTE } from "~~/constants/routes";

const navLinks = [
  { href: RATE_ROUTE, label: "Discover" },
  { href: "/ask", label: "Submit" },
  { href: "/governance", label: "Reputation" },
  { href: "/docs", label: "Docs" },
] as const;

const socialProofItems = [
  { value: "287", label: "Verified Humans" },
  { value: "3,482", label: "Votes" },
  { value: "$0", label: "USDC Paid" },
] as const;

const agentNames = ["Claude Code", "GitHub Copilot", "Cursor", "OpenAI Codex", "Gemini CLI", "Lovable"] as const;

const askSteps = [
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
] as const;

const benefits = [
  {
    title: "Optimized for AI",
    description: "MCP-ready tools, wallet-aware payment flows, and structured result packages for agents.",
  },
  {
    title: "Verified Humans",
    description: "Zero-knowledge proof-of-human checks keep voting sybil-resistant without exposing documents.",
  },
  {
    title: "Honest Rating",
    description: "Commit-reveal voting and reputation staking make low-quality votes economically costly.",
  },
  {
    title: "Paid Rating Work",
    description: "Bounties and feedback bonuses reward useful human judgment after settlement.",
  },
] as const;

export const metadata = {
  title: "Curyo Light Mode Landing Mockup",
  description: "A shareable light-mode mockup of the Curyo landing page.",
};

function BrandMark() {
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#f26426] text-lg font-black leading-none text-[#0f1110] shadow-[0_10px_24px_rgb(242_100_38_/_0.22)]">
      C
    </span>
  );
}

function AgentBadge({ name }: { name: string }) {
  return (
    <button
      type="button"
      className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-[#d9ddd5] bg-[#ffffff] px-3.5 py-2.5 text-sm font-semibold text-[#252925] shadow-[0_8px_18px_rgb(16_24_20_/_0.05)] transition hover:border-[#f26426]/40 hover:bg-[#fff6f1] hover:text-[#bf3f18] sm:text-base"
    >
      <span className="flex h-5 w-5 items-center justify-center rounded-full border border-current text-[0.7rem] leading-none">
        {name.slice(0, 1)}
      </span>
      {name}
    </button>
  );
}

function StepCard({ step }: { step: (typeof askSteps)[number] }) {
  const Icon = step.icon;

  return (
    <article className="flex h-full min-h-[15rem] flex-col items-center justify-center rounded-lg border border-[#dfe3dc] bg-[#ffffff] p-6 text-center shadow-[0_20px_50px_rgb(34_39_34_/_0.08)]">
      <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-lg bg-[#f3f5f1]">
        <Icon className="h-8 w-8 text-[#f26426]" />
      </div>
      <h3 className="font-display text-2xl font-extrabold leading-tight text-[#111312]">{step.title}</h3>
      <p className="mt-3 max-w-[22rem] text-base leading-7 text-[#565f56]">{step.description}</p>
    </article>
  );
}

export default function LightModeMockupPage() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#f7f8f5] text-[#111312]">
      <header className="sticky top-0 z-30 border-b border-[#dfe3dc] bg-[#f7f8f5]/92 px-4 py-3 backdrop-blur-xl sm:px-6">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <Link href="/light-mode-mockup" className="flex min-w-0 items-center gap-2">
            <BrandMark />
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="font-display whitespace-nowrap text-[1.2rem] font-extrabold leading-none text-[#111312]">
                Curyo (Beta)
              </span>
              <span className="hidden text-sm font-medium text-[#6c746d] sm:block">AI Asks, Humans Earn</span>
            </div>
          </Link>

          <nav aria-label="Light mode mockup navigation" className="hidden items-center gap-1 md:flex">
            {navLinks.map(link => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-lg px-3 py-2 text-sm font-semibold text-[#5a625b] transition hover:bg-[#ecefeb] hover:text-[#111312]"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <Link
            href={RATE_ROUTE}
            prefetch={false}
            className="inline-flex h-10 items-center justify-center rounded-lg bg-[#111312] px-4 text-sm font-semibold text-[#ffffff] shadow-[0_12px_26px_rgb(17_19_18_/_0.18)] transition hover:bg-[#252925]"
          >
            Sign In
          </Link>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-6xl flex-col items-center px-4 pb-16 pt-8 sm:pt-12 lg:pt-16">
        <section className="relative flex w-full flex-col lg:min-h-[36rem] lg:items-center lg:justify-center">
          <div className="relative z-0 mx-auto w-full lg:pointer-events-none lg:absolute lg:bottom-[-2.5rem] lg:left-[20rem] lg:right-0 lg:top-[-2.5rem] lg:translate-y-7 xl:left-[19rem] xl:translate-y-10">
            <Image
              src="/launch/curyo-human-loop-orange-orbits-neutral-ai-light.png"
              alt="Light mode line illustration of a person working beside an abstract AI loop mark"
              width={1672}
              height={941}
              priority
              className="mx-auto h-auto w-full max-w-[44rem] object-contain lg:max-w-[38rem] xl:max-w-[50rem]"
              sizes="(min-width: 1280px) 50rem, (min-width: 1024px) 38rem, 100vw"
            />
          </div>

          <div className="relative z-10 flex flex-col items-center lg:mr-auto lg:max-w-[32rem] lg:items-start lg:pb-8 lg:pt-24 xl:pt-28">
            <h1 className="font-display max-w-[14ch] text-center text-[2.45rem] font-extrabold leading-none text-[#111312] sm:max-w-[11ch] sm:text-[3.1rem] lg:max-w-none lg:text-left lg:text-[3.3rem] xl:text-[3.7rem]">
              <span className="block">AI Asks,</span>
              <span className="block">Humans Earn</span>
            </h1>
            <p className="mt-4 max-w-none text-center text-[1.05rem] font-medium text-[#4f584f] sm:text-[1.25rem] lg:text-left lg:text-[1.35rem]">
              <span className="block whitespace-nowrap">Verified, Staked Human</span>
              <span className="block whitespace-nowrap">Feedback for AI Agents</span>
            </p>

            <div className="mt-6 flex flex-wrap justify-center gap-3 lg:justify-start">
              <Link
                href={RATE_ROUTE}
                prefetch={false}
                className="inline-flex h-11 items-center justify-center rounded-full bg-[#f26426] px-5 text-base font-semibold text-[#111312] shadow-[0_16px_30px_rgb(242_100_38_/_0.22)] transition hover:bg-[#ff7a3d]"
              >
                Earn USDC
              </Link>
              <Link
                href={DOCS_AI_ROUTE}
                prefetch={false}
                className="inline-flex h-11 items-center justify-center rounded-full bg-[#ffffff] px-5 text-base font-semibold text-[#252925] shadow-[0_12px_24px_rgb(34_39_34_/_0.08)] ring-1 ring-[#dfe3dc] transition hover:bg-[#f1f3ef]"
              >
                For Agents
              </Link>
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-center text-sm font-medium text-[#6c746d] sm:text-[0.95rem] lg:justify-start lg:text-left">
              {socialProofItems.map(({ value, label }, index) => (
                <div key={label} className="flex items-center">
                  <span
                    className={`whitespace-nowrap ${index < socialProofItems.length - 1 ? "sm:after:ml-3 sm:after:text-[#9aa29a] sm:after:content-['•']" : ""}`}
                  >
                    <span className="font-bold text-[#111312]">{value}</span> {label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="relative z-10 mt-2 w-full sm:mt-3 lg:mt-4">
          <p className="mb-4 text-center text-base font-medium leading-7 text-[#5f685f] sm:mb-5 sm:text-lg">
            Ask your favorite AI agent about Curyo.xyz
          </p>
          <div className="mx-auto flex max-w-full flex-nowrap items-center justify-start gap-2 overflow-x-auto px-4 pb-1 sm:justify-center sm:gap-2.5 sm:px-0 lg:gap-3">
            {agentNames.map(name => (
              <AgentBadge key={name} name={name} />
            ))}
          </div>
        </section>

        <section className="relative z-10 mt-12 w-full sm:mt-14 lg:mt-16">
          <h2 className="font-display mb-8 text-center text-[2.15rem] font-extrabold leading-tight text-[#111312] sm:text-[2.85rem]">
            How It Works
          </h2>
          <div className="grid grid-cols-1 items-stretch gap-5 lg:grid-cols-3 lg:gap-6">
            {askSteps.map(step => (
              <StepCard key={step.title} step={step} />
            ))}
          </div>
        </section>

        <section className="relative z-10 mt-12 w-full sm:mt-14">
          <h2 className="font-display mb-8 text-center text-[2.15rem] font-extrabold leading-tight text-[#111312] sm:text-[2.85rem]">
            Why It Works
          </h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {benefits.map(benefit => (
              <article
                key={benefit.title}
                className="rounded-lg border border-[#dfe3dc] bg-[#ffffff] p-5 shadow-[0_18px_36px_rgb(34_39_34_/_0.07)]"
              >
                <div className="mb-5 h-1 w-12 rounded-full bg-[#f26426]" />
                <h3 className="font-display text-[1.7rem] font-extrabold leading-tight text-[#111312]">
                  {benefit.title}
                </h3>
                <p className="mt-4 text-base leading-7 text-[#565f56]">{benefit.description}</p>
              </article>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
