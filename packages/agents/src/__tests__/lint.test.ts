import { describe, expect, it } from "vitest";
import { lintAgentAskRequest, summarizeLintFindings } from "../questions/lint.js";

const VALID_REQUEST = {
  bounty: {
    amount: "1000000",
    requiredSettledRounds: "1",
    requiredVoters: "3",
  },
  clientRequestId: "landing-pitch-demo",
  question: {
    categoryId: "1",
    contextUrl: "https://example.com/landing-page",
    description: "Vote up only if the linked pitch is clear, credible, and interesting enough to keep reading.",
    tags: ["agent", "pitch"],
    templateId: "generic_rating",
    title: "Would this pitch make you want to learn more?",
  },
};

describe("agent question linting", () => {
  it("accepts a focused agent ask", () => {
    const findings = lintAgentAskRequest(VALID_REQUEST);

    expect(summarizeLintFindings(findings)).toEqual({
      errorCount: 0,
      ok: true,
      warningCount: 0,
    });
  });

  it("rejects missing context, unknown templates, and non-idempotent requests", () => {
    const findings = lintAgentAskRequest({
      bounty: { amount: "0" },
      clientRequestId: "x",
      question: {
        ...VALID_REQUEST.question,
        contextUrl: "http://example.com",
        templateId: "invented",
        title: "Is this clear? Is it trustworthy?",
      },
    });

    expect(findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ level: "error", path: "clientRequestId" }),
        expect.objectContaining({ level: "error", path: "bounty.amount" }),
        expect.objectContaining({ level: "error", path: "question.contextUrl" }),
        expect.objectContaining({ level: "error", path: "question.templateId" }),
        expect.objectContaining({ level: "warning", path: "question.title" }),
      ]),
    );
  });

  it("reports malformed public context fields instead of throwing", () => {
    const findings = lintAgentAskRequest({
      ...VALID_REQUEST,
      question: {
        ...VALID_REQUEST.question,
        imageUrls: "https://example.com/image.png",
        tags: { topic: "agent" },
      },
    });

    expect(findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ level: "error", path: "question.imageUrls" }),
        expect.objectContaining({ level: "error", path: "question.tags" }),
      ]),
    );
  });

  it("warns when ranked option questions imply hidden selectable answers", () => {
    const findings = lintAgentAskRequest({
      ...VALID_REQUEST,
      question: undefined,
      questions: [
        {
          ...VALID_REQUEST.question,
          templateInputs: {
            comparisonSetId: "answer-review-1",
            optionId: "answer-a",
            optionLabel: "Answer A",
          },
          templateId: "ranked_option_member",
          title: "Which answer gives the safest recommendation?",
        },
      ],
      templateId: "ranked_option_member",
    });

    expect(findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          level: "warning",
          path: "questions.0.title",
        }),
      ]),
    );
  });
});
