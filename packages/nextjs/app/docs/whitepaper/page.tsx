import { META, SECTIONS } from "../../../scripts/whitepaper/content";
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
          className="btn btn-lg btn-primary gap-2 !text-primary-content border-none no-underline"
        >
          <ArrowDownTrayIcon className="w-5 h-5" />
          Download Whitepaper (PDF)
        </a>
        <p className="text-sm text-base-content/40 mt-2">
          Version {META.version} | Author: {META.author} | {META.date}
        </p>
      </div>

      <h2>Contents</h2>
      <p>The whitepaper opens with an executive summary, followed by {SECTIONS.length} sections:</p>
      <ol>
        <li>
          <strong>Introduction</strong> &mdash; Mission, key principles, and question-first flow overview
        </li>
        <li>
          <strong>How It Works</strong> &mdash; Round mechanics, voter ID, reward distribution, question submissions
        </li>
        <li>
          <strong>tlock Commit-Reveal Voting</strong> &mdash; Encrypted voting, phase-weighted rewards, and resolution
        </li>
        <li>
          <strong>Tokenomics</strong> &mdash; Token distribution, faucet tiers, participation rewards, and question
          reward pools
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
        <li>
          <strong>Rating Research Basis</strong> &mdash; Research references behind the score-relative rating model
        </li>
      </ol>
    </article>
  );
};

export default WhitepaperPage;
