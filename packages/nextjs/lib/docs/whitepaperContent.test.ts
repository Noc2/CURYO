import { EXECUTIVE_SUMMARY, META, SECTIONS } from "../../scripts/whitepaper/content";
import type { ContentBlock } from "../../scripts/whitepaper/types";
import assert from "node:assert/strict";
import test from "node:test";

function collectBlockText(block: ContentBlock): string[] {
  switch (block.type) {
    case "paragraph":
    case "sub_heading":
      return [block.text];
    case "bullets":
    case "ordered":
      return block.items;
    case "formula":
      return [block.latex];
    case "table":
      return [...block.data.headers, ...block.data.rows.flat()];
  }
}

function collectWhitepaperText(): string {
  const parts = [META.title, META.subtitle, META.deck, META.author, META.version, META.date];

  for (const block of EXECUTIVE_SUMMARY) {
    parts.push(...collectBlockText(block));
  }

  for (const section of SECTIONS) {
    parts.push(section.title, section.lead);

    for (const subsection of section.subsections) {
      parts.push(subsection.heading);

      for (const block of subsection.blocks) {
        parts.push(...collectBlockText(block));
      }
    }
  }

  return parts.join("\n");
}

test("whitepaper metadata reflects the agent-first brand deck", () => {
  assert.equal(META.subtitle, "Human-in-the-Loop Judgment for AI Agents");
  assert.equal(META.deck, "Ask Humans Instead of Guessing");
});

test("whitepaper metadata reflects the April 2026 protocol revision", () => {
  assert.equal(META.version, "0.4");
  assert.equal(META.date, "April 2026");
});

test("whitepaper reflects current launch allocations and governance threshold", () => {
  const whitepaperText = collectWhitepaperText();

  assert.match(whitepaperText, /Bootstrap Pool \(12M HREP\)/i);
  assert.match(whitepaperText, /pool is funded with 12M HREP/i);
  assert.match(whitepaperText, /treasury starts with 32M HREP/i);
  assert.match(whitepaperText, /bootstrap proposal threshold is 1,000 HREP/i);

  assert.doesNotMatch(whitepaperText, /Bootstrap Pool \(24M HREP\)/i);
  assert.doesNotMatch(whitepaperText, /pool is funded with 24M HREP/i);
  assert.doesNotMatch(whitepaperText, /treasury starts with 20M HREP/i);
  assert.doesNotMatch(whitepaperText, /10,000 HREP proposal threshold/i);
  assert.doesNotMatch(whitepaperText, /bootstrap proposal threshold is 10,000 HREP/i);
});

test("whitepaper introduction surfaces the updated lead copy", () => {
  assert.equal(SECTIONS[0]?.title, "Introduction");
  assert.equal(SECTIONS[0]?.lead, "Curyo is a human-in-the-loop judgment layer for AI agents.");
});

test("whitepaper contents include the current eight sections", () => {
  assert.equal(SECTIONS.length, 8);
  assert.deepEqual(
    SECTIONS.map(section => section.title),
    [
      "Introduction",
      "Why Agents Need Human Judgment",
      "How Curyo Works",
      "Signal Integrity",
      "Incentives & Token Flows",
      "Agent Interfaces",
      "Governance & Public Infrastructure",
      "Limitations & Future Work",
    ],
  );
});

test("whitepaper executive summary centers the agent-first thesis", () => {
  const whitepaperText = collectWhitepaperText();

  assert.match(whitepaperText, /human-in-the-loop judgment layer for AI agents/i);
  assert.match(whitepaperText, /ask instead of guess/i);
  assert.match(whitepaperText, /structured result templates/i);
});

test("whitepaper surfaces the agent integration path", () => {
  const whitepaperText = collectWhitepaperText();

  assert.match(whitepaperText, /agent-wallet delegated asks/i);
  assert.match(whitepaperText, /MCP-style tools/i);
  assert.match(whitepaperText, /curyo_quote_question/i);
  assert.match(whitepaperText, /curyo_get_result/i);
  assert.match(whitepaperText, /Feedback Bonuses/i);
});

test("whitepaper removes legacy section framing", () => {
  const whitepaperText = collectWhitepaperText();

  for (const stalePhrase of [
    /tlock Commit-Reveal Voting/i,
    /Tokenomics/i,
    /Curyo & AI/i,
    /Rating Research Basis/i,
    /decentralized content curation protocol/i,
  ]) {
    assert.doesNotMatch(whitepaperText, stalePhrase);
  }

  assert.match(whitepaperText, /question-first/i);
  assert.match(whitepaperText, /USDC on Celo/i);
  assert.match(whitepaperText, /public infrastructure/i);
});
