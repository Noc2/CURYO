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
        className="fill-secondary/15 stroke-secondary"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <circle cx="32" cy="28" r="7" className="fill-secondary/30 stroke-secondary" strokeWidth="2" />
      <path
        d="M22 44c0-5.5 4.5-10 10-10s10 4.5 10 10"
        className="stroke-secondary"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M28 36l3 3 6-7"
        className="stroke-secondary"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0"
      />
      <circle cx="48" cy="12" r="8" className="fill-success/20 stroke-success" strokeWidth="2" />
      <path
        d="M44 12l3 3 5-5"
        className="stroke-success"
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
      <rect x="12" y="28" width="40" height="30" rx="6" className="fill-accent/10 stroke-accent" strokeWidth="3" />
      <path d="M22 28V18a10 10 0 0 1 20 0" className="stroke-accent/50" strokeWidth="3" strokeLinecap="round" />
      <circle cx="32" cy="41" r="4" className="fill-accent" />
      <path d="M32 45v5" className="stroke-accent" strokeWidth="3" strokeLinecap="round" />
      <path d="M48 10l4-4M52 10l-4-4" className="stroke-warning" strokeWidth="2" strokeLinecap="round" />
      <path d="M54 18h5" className="stroke-warning" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function VoteIcon() {
  return (
    <svg viewBox="0 0 64 64" fill="none" className="w-full h-full">
      <rect x="14" y="6" width="36" height="46" rx="4" className="fill-info/10 stroke-info" strokeWidth="2.5" />
      <path d="M24 20h16M24 28h12M24 36h8" className="stroke-info/60" strokeWidth="2" strokeLinecap="round" />
      <circle cx="44" cy="48" r="14" className="fill-base-100 stroke-success" strokeWidth="2.5" />
      <path
        d="M38 48l4 4 8-9"
        className="stroke-success"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M32 6V2M24 6V3M40 6V3" className="stroke-info/40" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function SubmitIcon() {
  return (
    <svg viewBox="0 0 64 64" fill="none" className="w-full h-full">
      <rect x="8" y="14" width="48" height="42" rx="6" className="fill-primary/10 stroke-primary" strokeWidth="2.5" />
      <path d="M32 40V22" className="stroke-primary" strokeWidth="3" strokeLinecap="round" />
      <path
        d="M24 30l8-8 8 8"
        className="stroke-primary"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M18 48h28" className="stroke-primary/40" strokeWidth="2" strokeLinecap="round" />
      <circle cx="50" cy="14" r="8" className="fill-warning/20 stroke-warning" strokeWidth="2" />
      <text x="50" y="18" textAnchor="middle" className="fill-warning" fontSize="11" fontWeight="bold">
        10
      </text>
    </svg>
  );
}

function RewardsIcon() {
  return (
    <svg viewBox="0 0 64 64" fill="none" className="w-full h-full">
      <circle cx="32" cy="30" r="18" className="fill-warning/15 stroke-warning" strokeWidth="2.5" />
      <circle cx="32" cy="30" r="12" className="stroke-warning/50" strokeWidth="1.5" />
      <text x="32" y="35" textAnchor="middle" className="fill-warning" fontSize="16" fontWeight="bold">
        C
      </text>
      <path
        d="M20 50l-4 10 8-4 4 6 4-6 8 4-4-10"
        className="fill-error/20 stroke-error/60"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M44 50l4 10-8-4-4 6-4-6-8 4 4-10"
        className="fill-error/20 stroke-error/60"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ExploreIcon() {
  return (
    <svg viewBox="0 0 64 64" fill="none" className="w-full h-full">
      <circle cx="32" cy="32" r="26" className="fill-secondary/10 stroke-secondary" strokeWidth="2.5" />
      <circle cx="32" cy="32" r="4" className="fill-secondary" />
      <path
        d="M22 22l6 14 14 6-6-14z"
        className="fill-error/30 stroke-error/70"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M42 42l-6-14-14-6 6 14z"
        className="fill-info/30 stroke-info/70"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M32 8v4M32 52v4M8 32h4M52 32h4" className="stroke-secondary/40" strokeWidth="2" strokeLinecap="round" />
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
        Click <strong>Connect Wallet</strong> in the top-right corner. Curyo supports{" "}
        <a href="https://walletconnect.com/" target="_blank" rel="noopener noreferrer">
          WalletConnect
        </a>
        ,{" "}
        <a href="https://metamask.io/" target="_blank" rel="noopener noreferrer">
          MetaMask
        </a>
        ,{" "}
        <a href="https://www.coinbase.com/wallet" target="_blank" rel="noopener noreferrer">
          Coinbase Wallet
        </a>
        , and{" "}
        <a href="https://rainbow.me/" target="_blank" rel="noopener noreferrer">
          Rainbow
        </a>
        . Make sure you&apos;re on the correct network.
      </p>

      <StepIllustration bg="bg-secondary/5">
        <ShieldIdIcon />
      </StepIllustration>
      <h2>2. Verify Your Identity & Get Voter ID</h2>
      <p>
        To participate in cREP, you need a <strong>Voter ID</strong> &mdash; a non-transferable digital ID that proves
        you&apos;re a verified human. This prevents manipulation through fake accounts and ensures fair voting.
      </p>
      <ul>
        <li>
          Go to <strong>Governance</strong> and click &ldquo;Verify with{" "}
          <a href="https://self.xyz/" target="_blank" rel="noopener noreferrer">
            Self.xyz
          </a>
          &rdquo;
        </li>
        <li>
          Scan your passport using the{" "}
          <a href="https://self.xyz/" target="_blank" rel="noopener noreferrer">
            Self.xyz app
          </a>{" "}
          (zero-knowledge proof, no personal data stored publicly)
        </li>
        <li>
          You must be <strong>18 or older</strong> to verify &mdash; the zero-knowledge proof confirms your age without
          revealing your date of birth
        </li>
        <li>
          Once verified, you&apos;ll receive your <strong>Voter ID</strong> and <strong>cREP tokens</strong> (up to
          10,000 cREP for the first 10 Genesis users, then 1,000, 100, 10, and eventually 1 cREP as more users join)
        </li>
        <li>Your Voter ID is non-transferable and tied to your wallet</li>
      </ul>

      <StepIllustration bg="bg-accent/5">
        <UnlockIcon />
      </StepIllustration>
      <h2>3. Your Voter ID Unlocks</h2>
      <p>With your Voter ID, you can:</p>
      <ul>
        <li>
          <strong>Vote on content</strong> (up to 100 cREP per content per round)
        </li>
        <li>
          <strong>Submit content</strong> to the platform
        </li>
        <li>
          <strong>Create your profile</strong>
        </li>
        <li>
          <strong>Propose new platforms</strong>
        </li>
        <li>
          <strong>Refer friends</strong> and receive referral tokens
        </li>
      </ul>

      <StepIllustration bg="bg-info/5">
        <VoteIcon />
      </StepIllustration>
      <h2>4. Vote on Content</h2>
      <p>
        The <strong>Vote</strong> page shows content cards. For each card, predict whether the rating will go UP or DOWN
        and choose a stake (1&ndash;100 cREP). Your vote direction is encrypted and hidden until the blind phase ends
        (~20&nbsp;min). Early (blind phase) voters earn 4x more reward weight. The keeper normally reveals eligible
        votes after the blind phase ends, and connected users can self-reveal if needed. Resolution occurs after enough
        votes are revealed.
      </p>
      <p>
        <strong>Note:</strong> Each Voter ID can stake a maximum of 100 cREP per content per round. This limit is
        enforced per verified human, not per wallet, ensuring fair participation. You cannot vote on content you
        submitted, and there is a <strong>24-hour cooldown</strong> before you can vote on the same content again.
      </p>

      <StepIllustration bg="bg-primary/5">
        <SubmitIcon />
      </StepIllustration>
      <h2>5. Submit Content</h2>
      <p>
        Go to <strong>Submit</strong> to add new content. Submitting requires a <strong>10 cREP</strong> stake as a
        quality guarantee:
      </p>
      <ul>
        <li>
          <strong>Returned:</strong> After 4 days if your content maintains a rating above 25.
        </li>
        <li>
          <strong>Forfeited:</strong> If rating drops below 25 after the 24-hour grace period. 100% goes to the
          treasury.
        </li>
      </ul>
      <p>
        As a submitter, you receive <strong>10% of the losing stakes</strong> every time a round is resolved on your
        content.
      </p>

      <StepIllustration bg="bg-warning/5">
        <RewardsIcon />
      </StepIllustration>
      <h2>6. Claim Rewards</h2>
      <p>
        After a round is resolved, check <strong>Portfolio</strong> to see claimable rewards. Click &ldquo;Claim&rdquo;
        to collect your stake and winnings.
      </p>

      <StepIllustration bg="bg-secondary/5">
        <ExploreIcon />
      </StepIllustration>
      <h2>7. Discover</h2>
      <p>
        The <strong>Discover</strong> page lets you browse all content with search, filtering by platform, and sorting.
      </p>
    </article>
  );
};

export default GettingStarted;
