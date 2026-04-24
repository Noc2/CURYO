import { describe, expect, it } from "vitest";
import { lintAgentAskRequest, summarizeLintFindings } from "../questions/lint.js";

describe("agent ask optional descriptions", () => {
  it("accepts a question without a description", () => {
    const findings = lintAgentAskRequest({
      bounty: {
        amount: "1000000",
        requiredSettledRounds: "1",
        requiredVoters: "3",
      },
      clientRequestId: "optional-description-demo",
      question: {
        categoryId: "1",
        contextUrl: "https://example.com/context",
        tags: ["agent", "pitch"],
        templateId: "generic_rating",
        title: "Would this pitch make you want to learn more?",
      },
    });

    expect(summarizeLintFindings(findings)).toEqual({
      errorCount: 0,
      ok: true,
      warningCount: 0,
    });
  });
});
