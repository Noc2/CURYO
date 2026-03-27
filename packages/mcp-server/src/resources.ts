import { LATEST_PROTOCOL_VERSION, type ReadResourceResult } from "@modelcontextprotocol/sdk/types.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CONTENT_SORT_VALUES, CONTENT_STATUS_VALUES, ROUND_STATE_VALUES } from "./lib/filters.js";
import { createDataEnvelope } from "./lib/results.js";
import { PROMPT_CATALOG } from "./prompts.js";
import type { PonderClient } from "./clients/ponder.js";
import type { ServerConfig } from "./config.js";
import { WRITE_TOOL_CATALOG } from "./write-tools.js";

const STATIC_RESOURCE_URIS = {
  about: "curyo://about",
  status: "curyo://status",
  toolSchema: "curyo://schema/tools",
} as const;

const DYNAMIC_RESOURCE_URIS = {
  categories: "curyo://categories",
} as const;

const ALL_RESOURCE_URIS = {
  ...STATIC_RESOURCE_URIS,
  ...DYNAMIC_RESOURCE_URIS,
} as const;

interface ToolCatalogEntry {
  name: string;
  title: string;
  description: string;
  upstream: string;
  input: Record<string, unknown>;
}

const TOOL_CATALOG: ToolCatalogEntry[] = [
  {
    name: "search_content",
    title: "Search Curyo Content",
    description: "Browse indexed Curyo content by status, category, and sort order.",
    upstream: "GET /content",
    input: {
      status: {
        type: "enum",
        values: CONTENT_STATUS_VALUES,
        default: "active",
      },
      categoryId: {
        type: "string",
        pattern: "^\\d+$",
      },
      sortBy: {
        type: "enum",
        values: CONTENT_SORT_VALUES,
        default: "newest",
      },
      limit: {
        type: "integer",
        minimum: 1,
        maximum: 20,
        default: 10,
      },
      offset: {
        type: "integer",
        minimum: 0,
        maximum: 1000,
        default: 0,
      },
    },
  },
  {
    name: "get_content",
    title: "Get Curyo Content",
    description: "Fetch a single Curyo content item, plus recent rounds and rating history.",
    upstream: "GET /content/:id",
    input: {
      contentId: {
        type: "string",
        pattern: "^\\d+$",
      },
    },
  },
  {
    name: "get_content_by_url",
    title: "Get Curyo Content By URL",
    description: "Look up a Curyo content item by URL.",
    upstream: "GET /content/by-url",
    input: {
      url: {
        type: "string",
        format: "url",
      },
    },
  },
  {
    name: "get_categories",
    title: "Get Curyo Categories",
    description: "List approved content categories available in Curyo.",
    upstream: "GET /categories",
    input: {},
  },
  {
    name: "get_profile",
    title: "Get Curyo Profile",
    description: "Fetch a Curyo user profile and its recent voting and reward activity.",
    upstream: "GET /profile/:address",
    input: {
      address: {
        type: "string",
        pattern: "^0x[0-9a-fA-F]{40}$",
      },
    },
  },
  {
    name: "get_voter_accuracy",
    title: "Get Voter Accuracy",
    description: "Inspect historical win/loss and category-level accuracy for a Curyo voter.",
    upstream: "GET /voter-accuracy/:address",
    input: {
      address: {
        type: "string",
        pattern: "^0x[0-9a-fA-F]{40}$",
      },
    },
  },
  {
    name: "get_stats",
    title: "Get Curyo Stats",
    description: "Fetch global platform statistics from the Curyo indexer.",
    upstream: "GET /stats",
    input: {},
  },
  {
    name: "search_votes",
    title: "Search Curyo Votes",
    description: "Inspect recent votes filtered by voter, content, round, or round state.",
    upstream: "GET /votes",
    input: {
      voter: {
        type: "string",
        pattern: "^0x[0-9a-fA-F]{40}$",
      },
      contentId: {
        type: "string",
        pattern: "^\\d+$",
      },
      roundId: {
        type: "string",
        pattern: "^\\d+$",
      },
      state: {
        type: "enum",
        values: ROUND_STATE_VALUES,
        default: "all",
      },
      limit: {
        type: "integer",
        minimum: 1,
        maximum: 20,
        default: 10,
      },
      offset: {
        type: "integer",
        minimum: 0,
        maximum: 1000,
        default: 0,
      },
    },
  },
];

function getToolCatalog(config: ServerConfig): ToolCatalogEntry[] {
  return config.write.enabled ? [...TOOL_CATALOG, ...WRITE_TOOL_CATALOG] : TOOL_CATALOG;
}

function createJsonResourceResult(uri: string, data: Record<string, unknown>): ReadResourceResult {
  return {
    contents: [
      {
        uri,
        mimeType: "application/json",
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}

export function registerResources(server: McpServer, config: ServerConfig, ponderClient: PonderClient): void {
  server.registerResource(
    "about",
    STATIC_RESOURCE_URIS.about,
    {
      title: "Curyo MCP About",
      description: "Overview of the Curyo MCP server, supported transports, and exposed capabilities.",
      mimeType: "application/json",
    },
    async (uri) =>
      createJsonResourceResult(uri.toString(), {
        name: "Curyo MCP Server",
        serverName: config.serverName,
        serverVersion: config.serverVersion,
        description: config.write.enabled
          ? "Official Curyo MCP server with indexed reads and scoped hosted write tools."
          : "Official read-only Curyo MCP server backed by the indexed Ponder API.",
        currentTransport: config.transport,
        supportedTransports: ["stdio", "streamable-http"],
        httpAuth: {
          mode: config.httpAuth.mode,
          protectedPaths: [config.httpPath],
        },
        write: {
          enabled: config.write.enabled,
          chainId: config.write.chainId,
          chainName: config.write.chainName,
        },
        tools: getToolCatalog(config).map(({ name, title }) => ({ name, title })),
        prompts: PROMPT_CATALOG.map(({ name, title }) => ({ name, title })),
        resources: Object.values(ALL_RESOURCE_URIS),
      }),
  );

  server.registerResource(
    "status",
    STATIC_RESOURCE_URIS.status,
    {
      title: "Curyo MCP Status",
      description: "Runtime and protocol status for the Curyo MCP server.",
      mimeType: "application/json",
    },
    async (uri) =>
      createJsonResourceResult(uri.toString(), {
        server: {
          name: config.serverName,
          version: config.serverVersion,
          transport: config.transport,
        },
        auth: {
          mode: config.httpAuth.mode,
          realm: config.httpAuth.realm,
          scopes: config.httpAuth.scopes,
          configuredTokens: config.httpAuth.tokens.length,
          protectedPaths: [config.httpPath],
        },
        protocol: {
          latestVersion: LATEST_PROTOCOL_VERSION,
        },
        upstream: {
          source: "ponder",
          baseUrl: config.ponderBaseUrl,
          timeoutMs: config.ponderTimeoutMs,
        },
        write: {
          enabled: config.write.enabled,
          chainId: config.write.chainId,
          chainName: config.write.chainName,
          identities: config.write.identities.length,
        },
        capabilities: {
          tools: getToolCatalog(config).length,
          resources: Object.keys(ALL_RESOURCE_URIS).length,
          prompts: PROMPT_CATALOG.length,
        },
        generatedAt: new Date().toISOString(),
      }),
  );

  server.registerResource(
    "categories",
    DYNAMIC_RESOURCE_URIS.categories,
    {
      title: "Curyo Categories",
      description: "Current approved Curyo categories fetched from Ponder.",
      mimeType: "application/json",
    },
    async (uri) =>
      createJsonResourceResult(
        uri.toString(),
        createDataEnvelope(config.ponderBaseUrl, "/categories", await ponderClient.getCategories()),
      ),
  );

  server.registerResource(
    "tool_schema",
    STATIC_RESOURCE_URIS.toolSchema,
    {
      title: "Curyo Tool Schema",
      description: "Machine-readable description of the Curyo MCP tool surface.",
      mimeType: "application/json",
    },
    async (uri) =>
      createJsonResourceResult(uri.toString(), {
        generatedAt: new Date().toISOString(),
        tools: getToolCatalog(config),
        prompts: PROMPT_CATALOG,
      }),
  );
}
