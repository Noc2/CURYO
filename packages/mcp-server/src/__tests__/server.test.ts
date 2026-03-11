import { describe, expect, it, vi } from "vitest";
import type { PonderClient } from "../clients/ponder.js";
import { createServer } from "../server.js";

describe("createServer", () => {
  it("builds a disconnected MCP server with the read-only toolset", () => {
    const server = createServer({
      ponderBaseUrl: "https://ponder.curyo.xyz",
      ponderTimeoutMs: 10_000,
      serverName: "curyo-test",
      serverVersion: "0.0.1",
      transport: "stdio",
      httpHost: "127.0.0.1",
      httpPort: 3334,
      httpPath: "/mcp",
      httpCorsOrigin: "*",
      httpAuth: {
        mode: "none",
        realm: "curyo-mcp",
        tokenHashes: [],
        scopes: ["mcp:read"],
      },
    });

    expect(server.isConnected()).toBe(false);
  });

  it("registers the expected tools and resources", async () => {
    const ponderClient = {
      getCategories: vi.fn(async () => ({
        categories: [{ id: "1", name: "Articles" }],
      })),
    } as unknown as PonderClient;

    const server = createServer(
      {
        ponderBaseUrl: "https://ponder.curyo.xyz",
        ponderTimeoutMs: 10_000,
        serverName: "curyo-test",
        serverVersion: "0.0.1",
        transport: "stdio",
        httpHost: "127.0.0.1",
        httpPort: 3334,
        httpPath: "/mcp",
        httpCorsOrigin: "*",
        httpAuth: {
          mode: "none",
          realm: "curyo-mcp",
          tokenHashes: [],
          scopes: ["mcp:read"],
        },
      },
      ponderClient,
    );

    const internalServer = server as unknown as {
      _registeredTools: Record<string, unknown>;
      _registeredResources: Record<string, { readCallback: (uri: URL, extra: unknown) => Promise<{ contents: Array<{ text: string }> }> }>;
      _registeredPrompts: Record<string, { callback: (args: Record<string, string>, extra: unknown) => { description?: string; messages: Array<{ content: { text: string } }> } }>;
    };

    expect(Object.keys(internalServer._registeredTools)).toEqual(
      expect.arrayContaining([
        "search_content",
        "get_content",
        "get_content_by_url",
        "get_categories",
        "get_profile",
        "get_voter_accuracy",
        "get_stats",
        "search_votes",
      ]),
    );

    expect(Object.keys(internalServer._registeredResources)).toEqual(
      expect.arrayContaining(["curyo://about", "curyo://status", "curyo://categories", "curyo://schema/tools"]),
    );

    expect(Object.keys(internalServer._registeredPrompts)).toEqual(
      expect.arrayContaining(["rank_candidate_sources", "inspect_source_trust_profile", "summarize_content_history"]),
    );

    const aboutResource = await internalServer._registeredResources["curyo://about"].readCallback(new URL("curyo://about"), {});
    expect(aboutResource.contents[0]?.text).toContain("Curyo MCP Server");
    expect(aboutResource.contents[0]?.text).toContain("rank_candidate_sources");
    expect(aboutResource.contents[0]?.text).toContain('"mode": "none"');

    const categoriesResource = await internalServer._registeredResources["curyo://categories"].readCallback(new URL("curyo://categories"), {});
    expect(categoriesResource.contents[0]?.text).toContain("Articles");

    const prompt = internalServer._registeredPrompts.rank_candidate_sources.callback(
      {
        topic: "AI safety papers",
        limit: "5",
      },
      {},
    );
    expect(prompt.messages[0]?.content.text).toContain("AI safety papers");
    expect(prompt.messages[0]?.content.text).toContain("search_content");
  });
});
