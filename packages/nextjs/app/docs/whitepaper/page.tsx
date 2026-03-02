import type { NextPage } from "next";
import { ArrowDownTrayIcon } from "@heroicons/react/24/outline";

const WhitepaperPage: NextPage = () => {
  return (
    <article className="prose max-w-none">
      <h1>Whitepaper</h1>
      <p className="lead text-base-content/60 text-lg">
        The complete Curyo protocol specification in a single document.
      </p>

      <div className="not-prose my-8">
        <a
          href="/curyo-whitepaper.pdf"
          download="Curyo-Whitepaper.pdf"
          className="btn btn-lg gap-2 bg-red-600 hover:bg-red-700 !text-white border-none no-underline"
        >
          <ArrowDownTrayIcon className="w-5 h-5" />
          Download Whitepaper (PDF)
        </a>
        <p className="text-sm text-base-content/40 mt-2">Version 0.1 | Author: AI | February 2026</p>
      </div>

      <h2>Contents</h2>
      <p>The whitepaper opens with an executive summary, followed by seven sections:</p>
      <ol>
        <li>
          <strong>Introduction</strong> &mdash; Mission, key principles, and voting flow overview
        </li>
        <li>
          <strong>How It Works</strong> &mdash; Round mechanics, voter ID, reward distribution, content rating
        </li>
        <li>
          <strong>Public Voting</strong> &mdash; Early-mover reward points and random resolution
        </li>
        <li>
          <strong>Tokenomics</strong> &mdash; Token distribution, faucet tiers, participation rewards
        </li>
        <li>
          <strong>Governance</strong> &mdash; Community governance, treasury, and collusion prevention
        </li>
        <li>
          <strong>Curyo &amp; AI</strong> &mdash; Model collapse, stake-weighted curation as AI infrastructure, public
          ratings as a public good, AI-assisted voting with human oversight
        </li>
        <li>
          <strong>Known Limitations</strong> &mdash; Current constraints and open challenges
        </li>
      </ol>
    </article>
  );
};

export default WhitepaperPage;
