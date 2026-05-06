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
  assert.equal(META.subtitle, "Public Human Evaluation for AI Agents");
  assert.equal(META.deck, "AI Asks, Humans Earn");
});

test("whitepaper metadata reflects the May 2026 product and AI revision", () => {
  assert.equal(META.version, "0.5");
  assert.equal(META.date, "May 2026");
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
  assert.equal(
    SECTIONS[0]?.lead,
    "Curyo is a public, paid, verified-human evaluation layer for agents and AI product teams.",
  );
});

test("whitepaper contents include the current nine sections", () => {
  assert.equal(SECTIONS.length, 9);
  assert.deepEqual(
    SECTIONS.map(section => section.title),
    [
      "Introduction",
      "Why Agents Need Human Judgment",
      "How Curyo Works",
      "Product Experience",
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

  assert.match(whitepaperText, /public, paid, verified-human evaluation layer/i);
  assert.match(whitepaperText, /AI Asks, Humans Earn/i);
  assert.match(whitepaperText, /structured result templates/i);
});

test("whitepaper surfaces the agent integration path", () => {
  const whitepaperText = collectWhitepaperText();

  assert.match(whitepaperText, /accountless by default/i);
  assert.match(whitepaperText, /Public MCP/i);
  assert.match(whitepaperText, /direct JSON routes/i);
  assert.match(whitepaperText, /x402_authorization/i);
  assert.match(whitepaperText, /browser signing/i);
  assert.match(whitepaperText, /local signer CLI/i);
  assert.match(whitepaperText, /curyo_quote_question/i);
  assert.match(whitepaperText, /curyo_confirm_ask_transactions/i);
  assert.match(whitepaperText, /curyo_get_result/i);
  assert.match(whitepaperText, /Feedback Bonuses/i);
});

test("whitepaper reflects the current AI template catalog", () => {
  const whitepaperText = collectWhitepaperText();

  for (const templateId of [
    "llm_answer_quality",
    "rag_grounding_check",
    "claim_verification",
    "source_credibility_check",
    "agent_action_go_no_go",
    "feature_acceptance_test",
    "agent_trace_review",
    "proposal_review",
    "pairwise_output_preference",
  ]) {
    assert.match(whitepaperText, new RegExp(templateId, "i"));
  }
});

test("whitepaper reflects the current product design surface", () => {
  const whitepaperText = collectWhitepaperText();

  assert.match(whitepaperText, /AI ask -> human earning loop/i);
  assert.match(whitepaperText, /app sidebar shell/i);
  assert.match(whitepaperText, /\/ask\?tab=agent/i);
  assert.match(whitepaperText, /\/agent\/sign\/\{intentId\}/i);
});

test("whitepaper removes legacy section framing", () => {
  const whitepaperText = collectWhitepaperText();

  for (const stalePhrase of [
    /tlock Commit-Reveal Voting/i,
    /^Tokenomics$/im,
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
