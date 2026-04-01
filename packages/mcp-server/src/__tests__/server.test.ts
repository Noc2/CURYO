import { describe, expect, it, vi } from "vitest";
import type { PonderClient } from "../clients/ponder.js";
import { createServer } from "../server.js";

const disabledWriteConfig = {
  enabled: false,
  rpcUrl: null,
  chainId: null,
  chainName: null,
  maxGasPerTx: 2_000_000,
  defaultIdentityId: null,
  identities: [],
  contracts: null,
  policy: {
    maxVoteStake: null,
    allowedSubmissionHosts: [],
    submissionRevealPollIntervalMs: 500,
    submissionRevealTimeoutMs: 30000,
  },
};

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
      httpPublicBaseUrl: null,
      httpCorsOrigin: "*",
      httpAllowedOrigins: [],
      httpAuthorizationServers: [],
      httpResourceDocumentationUrl: null,
      httpServer: {
        requestTimeoutMs: 30_000,
        headersTimeoutMs: 60_000,
        keepAliveTimeoutMs: 5_000,
        socketTimeoutMs: 60_000,
        maxHeadersCount: 100,
        maxRequestBodyBytes: 1_048_576,
      },
      httpAuth: {
        mode: "none",
        realm: "curyo-mcp",
        tokenHashes: [],
        scopes: ["mcp:read"],
        tokens: [],
        sessionKeys: [],
      },
      httpRateLimit: {
        enabled: true,
        windowMs: 60_000,
        readRequestsPerWindow: 120,
        writeRequestsPerWindow: 20,
        trustedProxyHeaders: [],
        store: "memory",
        redisUrl: null,
        redisKeyPrefix: "curyo:mcp:ratelimit",
        redisConnectTimeoutMs: 2_000,
      },
      write: disabledWriteConfig,
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
        httpPublicBaseUrl: null,
        httpCorsOrigin: "*",
        httpAllowedOrigins: [],
        httpAuthorizationServers: [],
        httpResourceDocumentationUrl: null,
        httpServer: {
          requestTimeoutMs: 30_000,
          headersTimeoutMs: 60_000,
          keepAliveTimeoutMs: 5_000,
          socketTimeoutMs: 60_000,
          maxHeadersCount: 100,
          maxRequestBodyBytes: 1_048_576,
        },
        httpAuth: {
          mode: "none",
          realm: "curyo-mcp",
          tokenHashes: [],
          scopes: ["mcp:read"],
          tokens: [],
          sessionKeys: [],
        },
        httpRateLimit: {
          enabled: true,
          windowMs: 60_000,
          readRequestsPerWindow: 120,
          writeRequestsPerWindow: 20,
          trustedProxyHeaders: [],
          store: "memory",
          redisUrl: null,
          redisKeyPrefix: "curyo:mcp:ratelimit",
          redisConnectTimeoutMs: 2_000,
        },
        write: disabledWriteConfig,
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
    const aboutPayload = JSON.parse(aboutResource.contents[0]?.text ?? "{}");
    expect(aboutPayload).toMatchObject({
      name: "Curyo MCP Server",
      auth: {
        mode: "none",
        walletSessionsEnabled: false,
      },
    });
    expect(aboutPayload.prompts).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "rank_candidate_sources" })]),
    );
    expect(aboutResource.contents[0]?.text).not.toContain("issuer");
    expect(aboutResource.contents[0]?.text).not.toContain("audience");
    expect(aboutResource.contents[0]?.text).not.toContain("submissionRevealPollIntervalMs");

    const statusResource = await internalServer._registeredResources["curyo://status"].readCallback(new URL("curyo://status"), {});
    const statusPayload = JSON.parse(statusResource.contents[0]?.text ?? "{}");
    expect(statusPayload).toMatchObject({
      auth: {
        mode: "none",
        walletSessionsEnabled: false,
      },
      upstream: {
        source: "ponder",
        status: "configured",
      },
    });
    expect(statusResource.contents[0]?.text).not.toContain("trustedProxyHeaders");
    expect(statusResource.contents[0]?.text).not.toContain("baseUrl");
    expect(statusResource.contents[0]?.text).not.toContain("maxVoteStake");

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

  it("registers hosted write tools when write mode is enabled", () => {
    const server = createServer({
      ponderBaseUrl: "https://ponder.curyo.xyz",
      ponderTimeoutMs: 10_000,
      serverName: "curyo-test",
      serverVersion: "0.0.1",
      transport: "stdio",
      httpHost: "127.0.0.1",
      httpPort: 3334,
      httpPath: "/mcp",
      httpPublicBaseUrl: null,
      httpCorsOrigin: "*",
      httpAllowedOrigins: [],
      httpAuthorizationServers: [],
      httpResourceDocumentationUrl: null,
      httpServer: {
        requestTimeoutMs: 30_000,
        headersTimeoutMs: 60_000,
        keepAliveTimeoutMs: 5_000,
        socketTimeoutMs: 60_000,
        maxHeadersCount: 100,
        maxRequestBodyBytes: 1_048_576,
      },
      httpAuth: {
        mode: "bearer",
        realm: "curyo-mcp",
        tokenHashes: ["abc"],
        scopes: ["mcp:read"],
        tokens: [
          {
            tokenHash: "abc",
            clientId: "writer",
            scopes: ["mcp:read", "mcp:write"],
            identityId: "writer",
            notBefore: null,
            expiresAt: null,
            subject: null,
            kind: "static",
          },
        ],
        sessionKeys: [],
      },
      httpRateLimit: {
        enabled: true,
        windowMs: 60_000,
        readRequestsPerWindow: 120,
        writeRequestsPerWindow: 20,
        trustedProxyHeaders: [],
        store: "memory",
        redisUrl: null,
        redisKeyPrefix: "curyo:mcp:ratelimit",
        redisConnectTimeoutMs: 2_000,
      },
      write: {
        enabled: true,
        rpcUrl: "https://rpc.celo.example",
        chainId: 11142220,
        chainName: "Celo Sepolia",
        maxGasPerTx: 2_000_000,
        defaultIdentityId: null,
        identities: [
          {
            id: "writer",
            label: "Writer",
            privateKey: `0x${"11".repeat(32)}`,
            frontendAddress: "0x7777777777777777777777777777777777777777",
          },
        ],
        contracts: {
          crepToken: "0x1111111111111111111111111111111111111111",
          contentRegistry: "0x2222222222222222222222222222222222222222",
          votingEngine: "0x3333333333333333333333333333333333333333",
          voterIdNFT: "0x4444444444444444444444444444444444444444",
          roundRewardDistributor: "0x5555555555555555555555555555555555555555",
          frontendRegistry: "0x6666666666666666666666666666666666666666",
        },
        policy: {
          maxVoteStake: null,
          allowedSubmissionHosts: [],
          submissionRevealPollIntervalMs: 500,
          submissionRevealTimeoutMs: 30000,
        },
      },
    });

    const internalServer = server as unknown as {
      _registeredTools: Record<string, unknown>;
    };

    expect(Object.keys(internalServer._registeredTools)).toEqual(
      expect.arrayContaining(["vote", "submit_content", "claim_reward", "claim_frontend_fee"]),
    );
  });
});
