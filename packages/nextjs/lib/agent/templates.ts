import { buildDefaultResultSpec, hashCanonicalJson } from "~~/lib/agent/questionSpecs";

export type AgentDecisionAnswer =
  | "pending"
  | "proceed"
  | "proceed_with_caution"
  | "revise_and_resubmit"
  | "do_not_proceed"
  | "inconclusive"
  | "failed";

export type AgentResultTemplate = {
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
  },
] as const;

export const AGENT_RESULT_TEMPLATES: AgentResultTemplate[] = TEMPLATE_DEFINITIONS.map(template => ({
  ...template,
  ratingSystem: "curyo.binary_staked_rating.v1",
  recommendedUse: [...template.recommendedUse],
  resultSpecHash: hashCanonicalJson(buildDefaultResultSpec(template.id)),
  version: TEMPLATE_VERSION,
}));

const templateById = new Map(AGENT_RESULT_TEMPLATES.map(template => [template.id, template]));
const templateByResultSpecHash = new Map(
  AGENT_RESULT_TEMPLATES.map(template => [template.resultSpecHash.toLowerCase(), template]),
);

export function listAgentResultTemplates(): AgentResultTemplate[] {
  return AGENT_RESULT_TEMPLATES;
}

export function getAgentResultTemplate(templateId: string | null | undefined): AgentResultTemplate {
  return templateById.get(templateId ?? "") ?? AGENT_RESULT_TEMPLATES[0];
}

export function getAgentResultTemplateBySpecHash(specHash: string | null | undefined): AgentResultTemplate {
  return templateByResultSpecHash.get(specHash?.toLowerCase() ?? "") ?? AGENT_RESULT_TEMPLATES[0];
}
