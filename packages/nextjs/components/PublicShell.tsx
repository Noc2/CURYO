import { Suspense } from "react";
import Link from "next/link";
import { CuryoLogo } from "~~/components/CuryoLogo";
import { FooterLinks } from "~~/components/FooterLinks";
import { ReferralAttributionCapture } from "~~/components/referrals/ReferralAttributionCapture";
import { ASK_ROUTE, GOVERNANCE_ROUTE, RATE_ROUTE } from "~~/constants/routes";
import { HUMAN_SIGN_IN_FAUCET_ROUTE, HUMAN_SIGN_IN_LABEL } from "~~/lib/home/humanSignInRoute";

const publicNavLinks = [
  { href: RATE_ROUTE, label: "Discover", heavy: true },
  { href: ASK_ROUTE, label: "Submit", heavy: true },
  { href: GOVERNANCE_ROUTE, label: "Reputation", heavy: true },
  { href: "/docs", label: "Docs", heavy: false },
] as const;

function PublicHeader() {
  return (
    <header className="sticky top-0 z-20 border-b border-[color:var(--curyo-shell-border-strong)] bg-[#000]/95 px-4 py-3 backdrop-blur-xl sm:px-6">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
        <Link href="/?landing=1" className="flex min-w-0 items-center gap-2">
          <CuryoLogo className="h-9 w-9 shrink-0" idPrefix="curyo-public-header-logo" />
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="font-display whitespace-nowrap text-[1.2rem] leading-none tracking-normal text-base-content">
              Curyo (Beta)
            </span>
            <span className="hidden text-sm text-base-content/75 sm:block">AI Asks, Humans Earn</span>
          </div>
        </Link>

        <nav aria-label="Primary" className="hidden items-center gap-1 md:flex">
          {publicNavLinks.map(link => (
            <Link
              key={link.href}
              href={link.href}
              prefetch={link.heavy ? false : undefined}
              className="rounded-lg px-3 py-2 text-sm font-medium text-base-content/75 transition-colors hover:bg-base-content/[0.04] hover:text-base-content"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <Link href={HUMAN_SIGN_IN_FAUCET_ROUTE} className="btn btn-sm btn-primary border-none">
          {HUMAN_SIGN_IN_LABEL}
        </Link>
      </div>
    </header>
  );
}

export function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-base-100 text-base-content">
      <PublicHeader />
      <main id="main-content" className="relative flex min-h-0 flex-1 flex-col overflow-x-hidden">
        {children}
      </main>
      <footer className="shrink-0 px-4 py-6">
        <FooterLinks className="w-full" listClassName="w-full justify-center text-sm lg:text-base" />
      </footer>
      <Suspense fallback={null}>
        <ReferralAttributionCapture />
      </Suspense>
    </div>
  );
}
