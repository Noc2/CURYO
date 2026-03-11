import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

interface PromptCatalogEntry {
  name: string;
  title: string;
  description: string;
  arguments: Array<{
    name: string;
    description: string;
    required?: boolean;
  }>;
}

export const PROMPT_CATALOG: PromptCatalogEntry[] = [
  {
    name: "rank_candidate_sources",
    title: "Rank Candidate Sources",
    description: "Guide an agent through ranking a set of candidate sources using Curyo data.",
    arguments: [
      {
        name: "topic",
        description: "Research topic or query to optimize for.",
        required: true,
      },
      {
        name: "category_id",
        description: "Optional numeric Curyo category ID to narrow the search.",
      },
      {
        name: "limit",
        description: "Optional max number of candidates to inspect.",
      },
    ],
  },
  {
    name: "inspect_source_trust_profile",
    title: "Inspect Source Trust Profile",
    description: "Investigate one source in Curyo and explain its current trust/reputation signals.",
    arguments: [
      {
        name: "subject",
        description: "A URL or numeric Curyo content ID.",
        required: true,
      },
    ],
  },
  {
    name: "summarize_content_history",
    title: "Summarize Content History",
    description: "Summarize how one content item has performed in Curyo over time.",
    arguments: [
      {
        name: "subject",
        description: "A URL or numeric Curyo content ID.",
        required: true,
      },
      {
        name: "include_votes",
        description: "Whether to inspect recent vote activity as part of the summary.",
      },
    ],
  },
];

export function registerPrompts(server: McpServer): void {
  server.registerPrompt(
    "rank_candidate_sources",
    {
      title: "Rank Candidate Sources",
      description: "Use Curyo to rank relevant sources for a research topic.",
      argsSchema: {
        topic: z.string().min(1),
        category_id: z.string().regex(/^\d+$/).optional(),
        limit: z.string().regex(/^\d+$/).optional(),
      },
    },
    ({ topic, category_id, limit }) => ({
      description: `Use Curyo data to rank candidate sources for "${topic}".`,
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              `Use the Curyo MCP tools to rank candidate sources for this topic: ${topic}.`,
              `Start with search_content using status=active${category_id ? ` and categoryId=${category_id}` : ""}${limit ? ` with limit=${limit}` : ""}.`,
              "Inspect the strongest candidates with get_content, then use get_profile and get_voter_accuracy when submitter or voter quality is material to the ranking.",
              "Prefer sources with stronger ratings, broader vote participation, and stronger reputation context. Call out weak coverage or sparse vote data explicitly.",
              "Return a concise ranked list with URL, category, current rating, vote count, and a short justification for each item.",
            ].join("\n"),
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    "inspect_source_trust_profile",
    {
      title: "Inspect Source Trust Profile",
      description: "Investigate one URL or content ID with Curyo.",
      argsSchema: {
        subject: z.string().min(1),
      },
    },
    ({ subject }) => ({
      description: `Inspect the trust profile for ${subject}.`,
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              `Investigate this source in Curyo: ${subject}.`,
              "If the subject is a URL, start with get_content_by_url. If it is a numeric Curyo content ID, start with get_content.",
              "Then inspect the source's current rating, category, round history, and any visible submitter or voter reputation context using get_profile and get_voter_accuracy when helpful.",
              "Explain the strongest positive and negative trust signals, and conclude with whether the current evidence supports trusting this source.",
            ].join("\n"),
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    "summarize_content_history",
    {
      title: "Summarize Content History",
      description: "Summarize the historical performance of one content item.",
      argsSchema: {
        subject: z.string().min(1),
        include_votes: z.enum(["yes", "no"]).optional(),
      },
    },
    ({ subject, include_votes }) => ({
      description: `Summarize the Curyo history for ${subject}.`,
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              `Summarize the history of this Curyo content item: ${subject}.`,
              "Resolve the item with get_content_by_url if it is a URL, otherwise use get_content for numeric IDs.",
              "Describe the current rating, how the score evolved across recent rounds, and whether the item looks stable, contested, or weakly-covered.",
              include_votes === "no"
                ? "Do not inspect vote-level activity unless the content response is too thin to explain the result."
                : "Use search_votes if needed to explain recent voting behavior or contested outcomes.",
              "Keep the summary factual and note any uncertainty caused by sparse history.",
            ].join("\n"),
          },
        },
      ],
    }),
  );
}
