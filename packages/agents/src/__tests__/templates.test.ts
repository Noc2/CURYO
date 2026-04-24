import { describe, expect, it } from "vitest";
import { buildQuestionSpecHashes } from "../questionSpecs.js";
import { listAgentResultTemplates } from "../templates.js";

describe("agent templates", () => {
  it("exposes stable machine-readable result templates", () => {
    const templates = listAgentResultTemplates();
    const generic = templates.find(template => template.id === "generic_rating");
    const ranked = templates.find(template => template.id === "ranked_option_member");

    expect(generic).toMatchObject({
      bundleStrategy: "independent",
      submissionPattern: "single_question",
      templateInputsExample: {
        audience: "new visitors",
        goal: "quick human interest check",
        successSignal: "Would this make you want to learn more?",
      },
    });
    expect(ranked).toMatchObject({
      bundleStrategy: "rank_by_rating",
      submissionPattern: "bundle_member",
    });
  });

  it("hashes question metadata deterministically", () => {
    const first = buildQuestionSpecHashes({
      categoryId: "1",
      contextUrl: "https://example.com",
      description: "Vote up only if the source supports the claim.",
      imageUrls: [],
      tags: ["source"],
      title: "Does this source support the claim?",
      videoUrl: "",
    });
    const second = buildQuestionSpecHashes({
      categoryId: "1",
      contextUrl: "https://example.com",
      description: "Vote up only if the source supports the claim.",
      imageUrls: [],
      tags: ["source"],
      title: "Does this source support the claim?",
      videoUrl: "",
    });

    expect(second).toEqual(first);
    expect(first.questionMetadataHash).toMatch(/^0x[a-f0-9]{64}$/);
  });
});
