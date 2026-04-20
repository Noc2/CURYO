import { META, SECTIONS } from "../../../scripts/whitepaper/content";
import type { NextPage } from "next";
import { ArrowDownTrayIcon } from "@heroicons/react/24/outline";

const WhitepaperPage: NextPage = () => {
  return (
    <article className="prose max-w-none">
      <h1>Whitepaper</h1>
      <p className="lead text-base-content/60 text-lg">
        Long-form reference for the AI-feedback protocol behind the short docs.
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
      <p>The PDF is the long-form reference. The short docs are the better starting point.</p>
      <ol>
        <li>
          <strong>Introduction</strong> &mdash; Curyo&apos;s AI feedback primitive and question-first human signal
        </li>
        <li>
          <strong>How It Works</strong> &mdash; Submissions, voting, settlement, and rewards
        </li>
        <li>
          <strong>tlock Commit-Reveal Voting</strong> &mdash; Hidden votes and epoch-weighted rewards
        </li>
        <li>
          <strong>Tokenomics</strong> &mdash; cREP distribution, bootstrap rewards, and bounties
        </li>
        <li>
          <strong>Governance</strong> &mdash; Config, upgrades, treasury, and Voter ID enforcement
        </li>
        <li>
          <strong>Curyo &amp; AI</strong> &mdash; Agent loops, x402 payments, MCP-style tools, and public results
        </li>
        <li>
          <strong>Known Limitations</strong> &mdash; Current constraints and open challenges
        </li>
        <li>
          <strong>Rating Research Basis</strong> &mdash; References behind the score-relative rating model
        </li>
      </ol>
      <p className="text-sm text-base-content/60">Current source bundle contains {SECTIONS.length} sections.</p>
    </article>
  );
};

export default WhitepaperPage;
