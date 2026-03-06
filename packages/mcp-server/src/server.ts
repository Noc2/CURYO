import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { ServerConfig } from "./config.js";
import { PonderApiError, PonderClient } from "./clients/ponder.js";
import {
  CONTENT_SORT_VALUES,
  CONTENT_STATUS_VALUES,
  ROUND_STATE_VALUES,
  clampToolLimit,
  clampToolOffset,
  toContentStatusParam,
  toRoundStateParam,
} from "./lib/filters.js";
import { createToolEnvelope, errorToolResult, jsonToolResult } from "./lib/results.js";

const addressSchema = z.string().regex(/^0x[0-9a-fA-F]{40}$/i, "Expected a 0x-prefixed address");
const bigintIdSchema = z.string().regex(/^\d+$/, "Expected an unsigned integer string");

const readOnlyAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

export function createServer(config: ServerConfig, ponderClient = new PonderClient({ baseUrl: config.ponderBaseUrl })): McpServer {
  const server = new McpServer({
    name: config.serverName,
    version: config.serverVersion,
  });

  const runTool = async (
    endpoint: string,
    action: () => Promise<Record<string, unknown>>,
    warnings?: string[],
  ): Promise<CallToolResult> => {
    try {
      const data = await action();
      return jsonToolResult(createToolEnvelope(config.ponderBaseUrl, endpoint, data, warnings));
    } catch (error) {
      if (error instanceof PonderApiError) {
        return errorToolResult(`Ponder API error (${error.status}): ${error.message}`);
      }

      const message = error instanceof Error ? error.message : "Unexpected tool error";
      return errorToolResult(message);
    }
  };

  server.registerTool(
    "search_content",
    {
      title: "Search Curyo Content",
      description: "Browse indexed Curyo content by status, category, and sort order.",
      inputSchema: {
        status: z.enum(CONTENT_STATUS_VALUES).optional(),
        categoryId: bigintIdSchema.optional(),
        sortBy: z.enum(CONTENT_SORT_VALUES).optional(),
        limit: z.number().int().min(1).max(20).optional(),
        offset: z.number().int().min(0).max(1_000).optional(),
      },
      annotations: readOnlyAnnotations,
    },
    async (args) =>
      runTool("/content", () =>
        ponderClient.searchContent({
          status: toContentStatusParam(args.status),
          categoryId: args.categoryId,
          sortBy: args.sortBy ?? "newest",
          limit: clampToolLimit(args.limit),
          offset: clampToolOffset(args.offset),
        }),
      ),
  );

  server.registerTool(
    "get_content",
    {
      title: "Get Curyo Content",
      description: "Fetch a single Curyo content item, plus recent rounds and rating history.",
      inputSchema: {
        contentId: bigintIdSchema,
      },
      annotations: readOnlyAnnotations,
    },
    async ({ contentId }) => runTool(`/content/${contentId}`, () => ponderClient.getContent(contentId)),
  );

  server.registerTool(
    "get_content_by_url",
    {
      title: "Get Curyo Content By URL",
      description: "Look up a Curyo content item by URL.",
      inputSchema: {
        url: z.string().url(),
      },
      annotations: readOnlyAnnotations,
    },
    async ({ url }) => runTool("/content/by-url", () => ponderClient.getContentByUrl(url)),
  );

  server.registerTool(
    "get_categories",
    {
      title: "Get Curyo Categories",
      description: "List approved content categories available in Curyo.",
      annotations: readOnlyAnnotations,
    },
    async () => runTool("/categories", () => ponderClient.getCategories()),
  );

  server.registerTool(
    "get_profile",
    {
      title: "Get Curyo Profile",
      description: "Fetch a Curyo user profile and its recent voting and reward activity.",
      inputSchema: {
        address: addressSchema,
      },
      annotations: readOnlyAnnotations,
    },
    async ({ address }) => runTool(`/profile/${address}`, () => ponderClient.getProfile(address)),
  );

  server.registerTool(
    "get_voter_accuracy",
    {
      title: "Get Voter Accuracy",
      description: "Inspect historical win/loss and category-level accuracy for a Curyo voter.",
      inputSchema: {
        address: addressSchema,
      },
      annotations: readOnlyAnnotations,
    },
    async ({ address }) => runTool(`/voter-accuracy/${address}`, () => ponderClient.getVoterAccuracy(address)),
  );

  server.registerTool(
    "get_stats",
    {
      title: "Get Curyo Stats",
      description: "Fetch global platform statistics from the Curyo indexer.",
      annotations: readOnlyAnnotations,
    },
    async () => runTool("/stats", () => ponderClient.getStats()),
  );

  server.registerTool(
    "search_votes",
    {
      title: "Search Curyo Votes",
      description: "Inspect recent votes filtered by voter, content, round, or round state.",
      inputSchema: {
        voter: addressSchema.optional(),
        contentId: bigintIdSchema.optional(),
        roundId: bigintIdSchema.optional(),
        state: z.enum(ROUND_STATE_VALUES).optional(),
        limit: z.number().int().min(1).max(20).optional(),
        offset: z.number().int().min(0).max(1_000).optional(),
      },
      annotations: readOnlyAnnotations,
    },
    async (args) =>
      runTool("/votes", () =>
        ponderClient.searchVotes({
          voter: args.voter,
          contentId: args.contentId,
          roundId: args.roundId,
          state: toRoundStateParam(args.state),
          limit: clampToolLimit(args.limit),
          offset: clampToolOffset(args.offset),
        }),
      ),
  );

  return server;
}
