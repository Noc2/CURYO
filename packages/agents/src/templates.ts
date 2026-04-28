import { buildDefaultResultSpec, hashCanonicalJson } from "./questionSpecs";

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };
type JsonSchema = Record<string, unknown>;

export type AgentDecisionAnswer =
  | "pending"
  | "proceed"
  | "proceed_with_caution"
  | "revise_and_resubmit"
  | "do_not_proceed"
  | "inconclusive"
  | "failed";

export type AgentResultTemplate = {
  bundleStrategy: "independent" | "rank_by_rating";
  id: string;
  version: number;
  title: string;
  description: string;
  ratingSystem: "curyo.binary_staked_rating.v1";
  voteSemantics: {
    up: string;
    down: string;
  };
  interpretation: {
    proceedRatingBps: number;
    proceedConservativeRatingBps: number;
    cautionRatingBps: number;
    reviseRatingBps: number;
  };
  recommendedUse: string[];
  resultSpecHash: `0x${string}`;
  submissionPattern: "bundle_member" | "single_question";
  templateInputsExample: JsonValue | null;
  templateInputsSchema: JsonSchema;
};

const TEMPLATE_VERSION = 1;

const TEMPLATE_DEFINITIONS = [
  {
    id: "generic_rating",
    title: "Generic Rating",
    description:
      "General human support signal for a submitted question, link, image, or proposal.",
    voteSemantics: {
      up: "positive signal for the submitted question",
      down: "negative signal for the submitted question",
    },
    interpretation: {
      proceedRatingBps: 6500,
      proceedConservativeRatingBps: 5500,
      cautionRatingBps: 5500,
      reviseRatingBps: 4000,
    },
    recommendedUse: [
      "default_agent_feedback",
      "quality_check",
      "market_interest",
    ],
    submissionPattern: "single_question",
    bundleStrategy: "independent",
    templateInputsSchema: {
      additionalProperties: true,
      properties: {
        audience: { type: "string" },
        goal: { type: "string" },
        successSignal: { type: "string" },
      },
      type: "object",
    },
    templateInputsExample: {
      audience: "new visitors",
      goal: "quick human interest check",
      successSignal: "Would this make you want to learn more?",
    },
  },
  {
    id: "go_no_go",
    title: "Go / No-Go",
    description:
      "Decision gate where UP means the agent should proceed and DOWN means it should stop or revise.",
    voteSemantics: {
      up: "proceed with the proposed action",
      down: "do not proceed without changes",
    },
    interpretation: {
      proceedRatingBps: 7000,
      proceedConservativeRatingBps: 6000,
      cautionRatingBps: 5600,
      reviseRatingBps: 4500,
    },
    recommendedUse: [
      "deployment_gate",
      "purchase_gate",
      "autonomous_action_gate",
    ],
    submissionPattern: "single_question",
    bundleStrategy: "independent",
    templateInputsSchema: {
      additionalProperties: true,
      properties: {
        action: { type: "string" },
        blockCondition: { type: "string" },
        riskLevel: {
          enum: ["low", "medium", "high"],
          type: "string",
        },
      },
      type: "object",
    },
    templateInputsExample: {
      action: "send_outreach",
      blockCondition: "Stop if the message feels misleading or pushy.",
      riskLevel: "medium",
    },
  },
  {
    id: "ranked_option_member",
    title: "Ranked Option Member",
    description:
      "Use one question per option in the same bounty. Voters rate the option shown in that question; agents compare final ratings later.",
    voteSemantics: {
      up: "this option is preferred or acceptable",
      down: "this option is less preferred or unacceptable",
    },
    interpretation: {
      proceedRatingBps: 6500,
      proceedConservativeRatingBps: 5500,
      cautionRatingBps: 5200,
      reviseRatingBps: 4000,
    },
    recommendedUse: [
      "multi_option_ranking",
      "pairwise_like_bundle",
      "preference_poll",
    ],
    submissionPattern: "bundle_member",
    bundleStrategy: "rank_by_rating",
    templateInputsSchema: {
      additionalProperties: true,
      properties: {
        comparisonSetId: { type: "string" },
        optionId: { type: "string" },
        optionLabel: { type: "string" },
        ratingCriterion: { type: "string" },
        sharedPrompt: { type: "string" },
      },
      type: "object",
    },
    templateInputsExample: {
      comparisonSetId: "refund-answer-safety-1",
      optionId: "answer-a",
      optionLabel: "Refund response A",
      ratingCriterion: "Safe and useful enough to show to the user.",
      sharedPrompt: "A customer asks for a refund after a delayed package.",
    },
  },
  {
    id: "llm_answer_quality",
    title: "LLM Answer Quality",
    description:
      "Grade whether an AI answer is correct, complete, useful, and appropriate for the target user.",
    voteSemantics: {
      up: "the answer is useful, correct enough, and appropriate to show",
      down: "the answer is incorrect, incomplete, misleading, or inappropriate",
    },
    interpretation: {
      proceedRatingBps: 7000,
      proceedConservativeRatingBps: 6000,
      cautionRatingBps: 5500,
      reviseRatingBps: 4500,
    },
    recommendedUse: ["llm_eval", "answer_quality", "support_response_review"],
    submissionPattern: "single_question",
    bundleStrategy: "independent",
    templateInputsSchema: {
      additionalProperties: true,
      properties: {
        audience: { type: "string" },
        outputId: { type: "string" },
        promptSummary: { type: "string" },
        rubric: { type: "string" },
      },
      type: "object",
    },
    templateInputsExample: {
      audience: "customer support user",
      outputId: "answer-v3",
      promptSummary: "Customer asks why a refund has not arrived.",
      rubric: "Correct, complete, concise, and safe to send.",
    },
  },
  {
    id: "rag_grounding_check",
    title: "RAG Grounding Check",
    description:
      "Judge whether an AI answer is supported by the supplied sources and does not add unsupported claims.",
    voteSemantics: {
      up: "the answer is well supported by the linked sources",
      down: "the answer is unsupported, overstates the evidence, or contradicts the sources",
    },
    interpretation: {
      proceedRatingBps: 7500,
      proceedConservativeRatingBps: 6500,
      cautionRatingBps: 5600,
      reviseRatingBps: 4500,
    },
    recommendedUse: ["rag_eval", "groundedness", "source_supported_answer"],
    submissionPattern: "single_question",
    bundleStrategy: "independent",
    templateInputsSchema: {
      additionalProperties: true,
      properties: {
        answerId: { type: "string" },
        claimScope: { type: "string" },
        sourceSetId: { type: "string" },
        unsupportedClaimPolicy: { type: "string" },
      },
      type: "object",
    },
    templateInputsExample: {
      answerId: "rag-answer-42",
      claimScope: "delivery policy answer",
      sourceSetId: "policy-docs-2026-04",
      unsupportedClaimPolicy:
        "Vote down if important claims are not visible in the sources.",
    },
  },
  {
    id: "claim_verification",
    title: "Claim Verification",
    description:
      "Check whether a factual claim is supported by public evidence before an agent cites or acts on it.",
    voteSemantics: {
      up: "the claim is materially supported by the evidence",
      down: "the claim is unsupported, false, outdated, or missing important context",
    },
    interpretation: {
      proceedRatingBps: 7000,
      proceedConservativeRatingBps: 6000,
      cautionRatingBps: 5500,
      reviseRatingBps: 4500,
    },
    recommendedUse: ["fact_check", "citation_check", "claim_review"],
    submissionPattern: "single_question",
    bundleStrategy: "independent",
    templateInputsSchema: {
      additionalProperties: true,
      properties: {
        claim: { type: "string" },
        evidenceStandard: { type: "string" },
        intendedUse: { type: "string" },
      },
      type: "object",
    },
    templateInputsExample: {
      claim: "The venue is open on Sundays.",
      evidenceStandard: "Public page or listing directly supports the claim.",
      intendedUse: "Agent will recommend a Sunday visit.",
    },
  },
  {
    id: "source_credibility_check",
    title: "Source Credibility Check",
    description:
      "Rate whether a source is reliable enough for an agent to use in a public answer or decision.",
    voteSemantics: {
      up: "the source looks credible, current, and relevant enough to use",
      down: "the source looks unreliable, stale, irrelevant, or unsafe to rely on",
    },
    interpretation: {
      proceedRatingBps: 6500,
      proceedConservativeRatingBps: 5600,
      cautionRatingBps: 5200,
      reviseRatingBps: 4000,
    },
    recommendedUse: ["source_quality", "citation_screening", "research_agent"],
    submissionPattern: "single_question",
    bundleStrategy: "independent",
    templateInputsSchema: {
      additionalProperties: true,
      properties: {
        domain: { type: "string" },
        intendedUse: { type: "string" },
        recencyRequirement: { type: "string" },
        sourceType: { type: "string" },
      },
      type: "object",
    },
    templateInputsExample: {
      domain: "consumer travel",
      intendedUse: "Agent will cite this source in a recommendation.",
      recencyRequirement: "Must look current enough for 2026 planning.",
      sourceType: "venue listing",
    },
  },
  {
    id: "agent_action_go_no_go",
    title: "Agent Action Go / No-Go",
    description:
      "Gate a proposed autonomous or semi-autonomous agent action before the agent proceeds.",
    voteSemantics: {
      up: "the agent should proceed with the proposed action",
      down: "the agent should stop, revise, or escalate before acting",
    },
    interpretation: {
      proceedRatingBps: 7200,
      proceedConservativeRatingBps: 6200,
      cautionRatingBps: 5600,
      reviseRatingBps: 4500,
    },
    recommendedUse: [
      "autonomous_action_gate",
      "risk_review",
      "workflow_approval",
    ],
    submissionPattern: "single_question",
    bundleStrategy: "independent",
    templateInputsSchema: {
      additionalProperties: true,
      properties: {
        action: { type: "string" },
        blastRadius: { enum: ["low", "medium", "high"], type: "string" },
        blockCondition: { type: "string" },
        fallbackAction: { type: "string" },
      },
      type: "object",
    },
    templateInputsExample: {
      action: "publish the prepared status update",
      blastRadius: "medium",
      blockCondition:
        "Stop if the message is misleading, premature, or too confident.",
      fallbackAction: "Route to a human operator with the voter objections.",
    },
  },
  {
    id: "feature_acceptance_test",
    title: "Feature Acceptance Test",
    description:
      "Ask verified humans to test whether a public preview feature works as specified and report actionable failures.",
    voteSemantics: {
      up: "the feature works as described and is ready enough for the stated audience or environment",
      down: "the feature fails, is confusing, incomplete, or should not ship without changes",
    },
    interpretation: {
      proceedRatingBps: 7500,
      proceedConservativeRatingBps: 6500,
      cautionRatingBps: 6000,
      reviseRatingBps: 5000,
    },
    recommendedUse: ["feature_test", "preview_acceptance", "bug_triage", "release_gate"],
    submissionPattern: "single_question",
    bundleStrategy: "independent",
    templateInputsSchema: {
      additionalProperties: true,
      properties: {
        acceptanceCriteria: { type: "string" },
        buildId: { type: "string" },
        environmentHints: { type: "string" },
        expectedBehavior: { type: "string" },
        featureId: { type: "string" },
        featureName: { type: "string" },
        knownLimitations: { type: "string" },
        outOfScope: { type: "string" },
        releaseStage: {
          enum: ["prototype", "preview", "testnet", "staging", "production_candidate"],
          type: "string",
        },
        testSteps: { type: "string" },
      },
      type: "object",
    },
    templateInputsExample: {
      acceptanceCriteria: "Vote up only if the flow works without manual recovery.",
      buildId: "preview-2026-04-28",
      environmentHints: "Test desktop Chrome with MetaMask; include mobile notes if tried.",
      expectedBehavior: "A user can connect, refresh, and remain connected.",
      featureId: "wallet-connect-refresh-v2",
      featureName: "Wallet connect refresh",
      knownLimitations: "Ledger is not included in this preview.",
      outOfScope: "Do not judge visual polish unless it blocks completion.",
      releaseStage: "preview",
      testSteps: "1. Open preview. 2. Connect MetaMask. 3. Refresh. 4. Confirm the wallet remains connected.",
    },
  },
  {
    id: "proposal_review",
    title: "Proposal Review",
    description:
      "Review a governance, product, or operations proposal for clarity, risk, and actionability.",
    voteSemantics: {
      up: "the proposal is clear, actionable, and reasonable to advance",
      down: "the proposal is unclear, risky, incomplete, or not ready to advance",
    },
    interpretation: {
      proceedRatingBps: 6500,
      proceedConservativeRatingBps: 5600,
      cautionRatingBps: 5200,
      reviseRatingBps: 4000,
    },
    recommendedUse: ["governance_review", "proposal_quality", "dao_ops"],
    submissionPattern: "single_question",
    bundleStrategy: "independent",
    templateInputsSchema: {
      additionalProperties: true,
      properties: {
        decisionStage: { type: "string" },
        proposalId: { type: "string" },
        riskFocus: { type: "string" },
        successCriteria: { type: "string" },
      },
      type: "object",
    },
    templateInputsExample: {
      decisionStage: "pre-vote review",
      proposalId: "curyo-governance-12",
      riskFocus: "deployment safety and treasury impact",
      successCriteria:
        "Clear scope, credible plan, and acceptable downside risk.",
    },
  },
  {
    id: "pairwise_output_preference",
    title: "Pairwise Output Preference",
    description:
      "Use one question per candidate output in the same bundle. Voters rate the shown output; agents compare final ratings later.",
    voteSemantics: {
      up: "this candidate output is preferred or acceptable for the stated criterion",
      down: "this candidate output is not preferred or fails the stated criterion",
    },
    interpretation: {
      proceedRatingBps: 6500,
      proceedConservativeRatingBps: 5500,
      cautionRatingBps: 5200,
      reviseRatingBps: 4000,
    },
    recommendedUse: ["output_preference", "ab_test", "model_comparison"],
    submissionPattern: "bundle_member",
    bundleStrategy: "rank_by_rating",
    templateInputsSchema: {
      additionalProperties: true,
      properties: {
        candidateId: { type: "string" },
        candidateLabel: { type: "string" },
        comparisonSetId: { type: "string" },
        preferenceCriterion: { type: "string" },
        promptSummary: { type: "string" },
      },
      type: "object",
    },
    templateInputsExample: {
      candidateId: "model-b-answer",
      candidateLabel: "Model B answer",
      comparisonSetId: "refund-answer-eval-2026-04",
      preferenceCriterion:
        "Best balance of helpfulness, safety, and policy accuracy.",
      promptSummary: "Customer asks for a refund after a delayed package.",
    },
  },
] as const;

export const AGENT_RESULT_TEMPLATES: AgentResultTemplate[] =
  TEMPLATE_DEFINITIONS.map((template) => ({
    ...template,
    ratingSystem: "curyo.binary_staked_rating.v1",
    recommendedUse: [...template.recommendedUse],
    resultSpecHash: hashCanonicalJson(
      buildDefaultResultSpec(
        template.id,
        TEMPLATE_VERSION,
        template.voteSemantics,
      ),
    ),
    version: TEMPLATE_VERSION,
  }));

const templateById = new Map(
  AGENT_RESULT_TEMPLATES.map((template) => [template.id, template]),
);
const templateByResultSpecHash = new Map(
  AGENT_RESULT_TEMPLATES.map((template) => [
    template.resultSpecHash.toLowerCase(),
    template,
  ]),
);

export function listAgentResultTemplates(): AgentResultTemplate[] {
  return AGENT_RESULT_TEMPLATES;
}

export function findAgentResultTemplate(
  templateId: string | null | undefined,
): AgentResultTemplate | null {
  return templateById.get(templateId ?? "") ?? null;
}

export function getAgentResultTemplate(
  templateId: string | null | undefined,
): AgentResultTemplate {
  return templateById.get(templateId ?? "") ?? AGENT_RESULT_TEMPLATES[0];
}

export function getAgentResultTemplateBySpecHash(
  specHash: string | null | undefined,
): AgentResultTemplate {
  return (
    templateByResultSpecHash.get(specHash?.toLowerCase() ?? "") ??
    AGENT_RESULT_TEMPLATES[0]
  );
}
