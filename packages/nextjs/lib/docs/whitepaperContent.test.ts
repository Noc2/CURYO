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

test("whitepaper metadata reflects the updated title-case brand deck", () => {
  assert.equal(META.subtitle, "Human Reputation at Stake");
  assert.equal(META.deck, "Get Verified, Ask Questions, and Rate with Stake");
});

test("whitepaper metadata reflects the April 2026 protocol revision", () => {
  assert.equal(META.version, "0.4");
  assert.equal(META.date, "April 2026");
});

test("whitepaper introduction surfaces the updated lead copy", () => {
  assert.equal(SECTIONS[0]?.title, "Introduction");
  assert.equal(SECTIONS[0]?.lead, "Get Verified, Ask Questions, and Rate with Stake");
});

test("whitepaper contents include the current eight sections", () => {
  assert.equal(SECTIONS.length, 8);
  assert.deepEqual(
    SECTIONS.map(section => section.title),
    [
      "Introduction",
      "How It Works",
      "tlock Commit-Reveal Voting",
      "Tokenomics",
      "Governance",
      "Curyo & AI",
      "Known Limitations",
      "Rating Research Basis",
    ],
  );
});

test("whitepaper executive summary preserves the updated brand framing", () => {
  const summaryBlock = EXECUTIVE_SUMMARY[1];

  assert.equal(summaryBlock?.type, "paragraph");
  if (!summaryBlock || summaryBlock.type !== "paragraph") {
    throw new Error("Expected executive summary block to be a paragraph");
  }

  assert.match(summaryBlock.text, /question-first submissions, optional bounties/i);
  assert.match(summaryBlock.text, /preventing herding/i);
  assert.match(summaryBlock.text, /equal stablecoin shares/i);
});

test("whitepaper avoids stale protocol audit phrases", () => {
  const whitepaperText = collectWhitepaperText();

  for (const stalePhrase of [
    /46-scenario/i,
    /50 cREP \(hardcoded\)/i,
    /within seconds/i,
    /cannot be purchased/i,
    /recalculated at settlement from revealed raw stakes/i,
    /settle as tied\/consensus/i,
    /commitHash = keccak256\(isUp, salt, contentId, keccak256\(ciphertext\)\)/i,
    /participation rewards after round settlement regardless of vote outcome/i,
  ]) {
    assert.doesNotMatch(whitepaperText, stalePhrase);
  }

  assert.match(whitepaperText, /49-scenario/i);
  assert.match(whitepaperText, /SDK, MCP & Reference Stack/i);
  assert.match(whitepaperText, /question-first/i);
  assert.match(whitepaperText, /Celo USDC/i);
});
