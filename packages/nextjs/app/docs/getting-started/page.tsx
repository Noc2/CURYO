import Link from "next/link";
import type { NextPage } from "next";

/* ---------- Reusable illustration wrapper ---------- */
function StepIllustration({ children, bg }: { children: React.ReactNode; bg: string }) {
  return (
    <div className={`not-prose flex items-center justify-center rounded-xl ${bg} p-6 my-6`}>
      <div className="w-16 h-16 md:w-20 md:h-20">{children}</div>
    </div>
  );
}

/* ---------- SVG icons ---------- */

function WalletIcon() {
  return (
    <svg viewBox="0 0 64 64" fill="none" className="w-full h-full">
      <rect x="4" y="16" width="56" height="38" rx="6" className="stroke-primary" strokeWidth="3" />
      <path d="M4 28h56" className="stroke-primary" strokeWidth="3" />
      <rect x="42" y="32" width="14" height="10" rx="3" className="fill-primary/20 stroke-primary" strokeWidth="2" />
      <circle cx="49" cy="37" r="2" className="fill-primary" />
      <path
        d="M14 16V12a6 6 0 0 1 6-6h24a6 6 0 0 1 6 6v4"
        className="stroke-primary/60"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ShieldIdIcon() {
  return (
    <svg viewBox="0 0 64 64" fill="none" className="w-full h-full">
      <path
        d="M32 4L8 16v16c0 14 10 24 24 28 14-4 24-14 24-28V16L32 4z"
        className="fill-primary/12 stroke-primary"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <circle cx="32" cy="28" r="7" className="fill-primary/20 stroke-primary" strokeWidth="2" />
      <path
        d="M22 44c0-5.5 4.5-10 10-10s10 4.5 10 10"
        className="stroke-primary"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M28 36l3 3 6-7"
        className="stroke-primary"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="48" cy="12" r="8" className="fill-primary/12 stroke-primary" strokeWidth="2" />
      <path
        d="M44 12l3 3 5-5"
        className="stroke-primary"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function UnlockIcon() {
  return (
    <svg viewBox="0 0 64 64" fill="none" className="w-full h-full">
      <rect x="12" y="28" width="40" height="30" rx="6" className="fill-primary/12 stroke-primary" strokeWidth="3" />
      <path d="M22 28V18a10 10 0 0 1 20 0" className="stroke-primary/60" strokeWidth="3" strokeLinecap="round" />
      <circle cx="32" cy="41" r="4" className="fill-primary" />
      <path d="M32 45v5" className="stroke-primary" strokeWidth="3" strokeLinecap="round" />
      <path d="M48 10l4-4M52 10l-4-4" className="stroke-primary/60" strokeWidth="2" strokeLinecap="round" />
      <path d="M54 18h5" className="stroke-primary/60" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function VoteIcon() {
  return (
    <svg viewBox="0 0 64 64" fill="none" className="w-full h-full">
      <rect x="14" y="6" width="36" height="46" rx="4" className="fill-primary/12 stroke-primary" strokeWidth="2.5" />
      <path d="M24 20h16M24 28h12M24 36h8" className="stroke-primary/60" strokeWidth="2" strokeLinecap="round" />
      <circle cx="44" cy="48" r="14" className="fill-base-100 stroke-primary" strokeWidth="2.5" />
      <path
        d="M38 48l4 4 8-9"
        className="stroke-primary"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M32 6V2M24 6V3M40 6V3" className="stroke-primary/40" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/* ---------- Page ---------- */

const GettingStarted: NextPage = () => {
  return (
    <article className="prose max-w-none">
      <h1>Getting Started</h1>
      <p className="lead text-base-content/60 text-lg">Get up and running with Curyo in a few steps.</p>

      <StepIllustration bg="bg-primary/5">
        <WalletIcon />
      </StepIllustration>
      <h2>1. Connect Your Wallet</h2>
      <p>
        Click <strong>Connect Wallet</strong> and switch to the supported network.
      </p>

      <StepIllustration bg="bg-secondary/5">
        <ShieldIdIcon />
      </StepIllustration>
      <h2>2. Verify Your Identity & Get Voter ID</h2>
      <p>
        Open <strong>Governance</strong> and verify with{" "}
        <a href="https://self.xyz/" target="_blank" rel="noopener noreferrer">
          Self.xyz
        </a>
        . Verification is 18+ and uses zero-knowledge proofs, so your documents are not published on-chain.
      </p>
      <ul>
        <li>Start the Self.xyz flow from the governance page.</li>
        <li>Complete passport verification in the Self app.</li>
        <li>Receive one non-transferable Voter ID and starter cREP.</li>
      </ul>

      <StepIllustration bg="bg-accent/5">
        <UnlockIcon />
      </StepIllustration>
      <h2>3. Start Participating</h2>
      <p>Your Voter ID unlocks voting, content submission, profiles, and governance participation.</p>

      <StepIllustration bg="bg-info/5">
        <VoteIcon />
      </StepIllustration>
      <h2>4. Place Your First Vote</h2>
      <p>
        Open <strong>Vote</strong>, choose up or down, and stake 1&ndash;100 cREP. Your direction stays hidden during
        the blind phase, and rewards can be claimed after settlement.
      </p>
      <p>
        Verified wallets start with a limited number of free app transactions. After that, add CELO for gas. See{" "}
        <Link href="/docs/funding-wallet">Funding Your Wallet</Link>.
      </p>
      <p>
        See <Link href="/docs/how-it-works">How It Works</Link> for blind voting, rewards, and round settlement details.
      </p>
    </article>
  );
};

export default GettingStarted;
