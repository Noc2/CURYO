import { describe, expect, it } from "vitest";
import { buildQuestionSpecHashes } from "../questionSpecs.js";
import { listAgentResultTemplates } from "../templates.js";

describe("agent templates", () => {
  it("exposes stable machine-readable result templates", () => {
    const templates = listAgentResultTemplates();
    const generic = templates.find(
      (template) => template.id === "generic_rating",
    );
    const ranked = templates.find(
      (template) => template.id === "ranked_option_member",
    );
    const templateIds = templates.map((template) => template.id);

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
    expect(templateIds).toEqual([
      "generic_rating",
      "go_no_go",
      "ranked_option_member",
      "llm_answer_quality",
      "rag_grounding_check",
      "claim_verification",
      "source_credibility_check",
      "agent_action_go_no_go",
      "proposal_review",
      "pairwise_output_preference",
    ]);
    expect(templates).toHaveLength(10);
    for (const template of templates) {
      expect(template.ratingSystem).toBe("curyo.binary_staked_rating.v1");
      expect(template.resultSpecHash).toMatch(/^0x[a-f0-9]{64}$/);
    }
  });

  it("keeps AI evaluation templates on the existing binary rating flow", () => {
    const templates = listAgentResultTemplates();
    const aiEvaluationTemplates = templates.filter((template) =>
      [
        "llm_answer_quality",
        "rag_grounding_check",
        "claim_verification",
        "source_credibility_check",
        "agent_action_go_no_go",
        "proposal_review",
        "pairwise_output_preference",
      ].includes(template.id),
    );

    expect(aiEvaluationTemplates).toHaveLength(7);
    expect(
      aiEvaluationTemplates.every(
        (template) => template.ratingSystem === "curyo.binary_staked_rating.v1",
      ),
    ).toBe(true);
    expect(
      aiEvaluationTemplates.map((template) => template.voteSemantics),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          down: expect.stringContaining("unsupported"),
          up: expect.stringContaining("supported"),
        }),
        expect.objectContaining({
          up: expect.stringContaining("proceed"),
        }),
      ]),
    );
    expect(
      aiEvaluationTemplates.find(
        (template) => template.id === "pairwise_output_preference",
      ),
    ).toMatchObject({
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
