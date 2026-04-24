import { buildDefaultResultSpec, hashCanonicalJson } from "./questionSpecs.js";

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
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
    description: "General human support signal for a submitted question, link, image, or proposal.",
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
    recommendedUse: ["default_agent_feedback", "quality_check", "market_interest"],
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
    description: "Decision gate where UP means the agent should proceed and DOWN means it should stop or revise.",
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
    recommendedUse: ["deployment_gate", "purchase_gate", "autonomous_action_gate"],
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
    description: "Use one question per option in the same bounty; rank options by final rating and confidence.",
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
    recommendedUse: ["multi_option_ranking", "pairwise_like_bundle", "preference_poll"],
    submissionPattern: "bundle_member",
    bundleStrategy: "rank_by_rating",
    templateInputsSchema: {
      additionalProperties: true,
      properties: {
        comparisonSetId: { type: "string" },
        optionId: { type: "string" },
        optionLabel: { type: "string" },
      },
      type: "object",
    },
    templateInputsExample: {
      comparisonSetId: "headline-test-1",
      optionId: "variant-a",
      optionLabel: "Hero variant A",
    },
  },
] as const;

export const AGENT_RESULT_TEMPLATES: AgentResultTemplate[] = TEMPLATE_DEFINITIONS.map(template => ({
  ...template,
  ratingSystem: "curyo.binary_staked_rating.v1",
  recommendedUse: [...template.recommendedUse],
  resultSpecHash: hashCanonicalJson(buildDefaultResultSpec(template.id, TEMPLATE_VERSION, template.voteSemantics)),
  version: TEMPLATE_VERSION,
}));

const templateById = new Map(AGENT_RESULT_TEMPLATES.map(template => [template.id, template]));
const templateByResultSpecHash = new Map(
  AGENT_RESULT_TEMPLATES.map(template => [template.resultSpecHash.toLowerCase(), template]),
);

export function listAgentResultTemplates(): AgentResultTemplate[] {
  return AGENT_RESULT_TEMPLATES;
}

export function findAgentResultTemplate(templateId: string | null | undefined): AgentResultTemplate | null {
  return templateById.get(templateId ?? "") ?? null;
}

export function getAgentResultTemplate(templateId: string | null | undefined): AgentResultTemplate {
  return templateById.get(templateId ?? "") ?? AGENT_RESULT_TEMPLATES[0];
}

export function getAgentResultTemplateBySpecHash(specHash: string | null | undefined): AgentResultTemplate {
  return templateByResultSpecHash.get(specHash?.toLowerCase() ?? "") ?? AGENT_RESULT_TEMPLATES[0];
}
