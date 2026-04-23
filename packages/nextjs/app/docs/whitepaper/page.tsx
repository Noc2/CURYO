import { META, SECTIONS } from "../../../scripts/whitepaper/content";
import type { NextPage } from "next";
import { ArrowDownTrayIcon } from "@heroicons/react/24/outline";

const WhitepaperPage: NextPage = () => {
  return (
    <article className="prose max-w-none">
      <h1>Whitepaper</h1>
      <p className="lead text-base-content/60 text-lg">
        Long-form overview of Curyo as the verified human judgment layer for AI agents.
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
        {SECTIONS.map(section => (
          <li key={section.title}>
            <strong>{section.title}</strong> &mdash; {section.lead}
          </li>
        ))}
      </ol>
      <p className="text-sm text-base-content/60">Current source bundle contains {SECTIONS.length} sections.</p>
    </article>
  );
};

export default WhitepaperPage;
