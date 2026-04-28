import assert from "node:assert/strict";
import test from "node:test";
import { createHmac } from "node:crypto";
import { ROUND_STATE } from "@curyo/contracts/protocol";
import {
  buildWebhookVerifier,
  createCuryoAgentClient,
  parseAgentResult,
  type AskHumansRequest,
  type ListResultTemplatesResponse,
  type QuestionStatusResponse,
} from "./agent";

const API_BASE_URL = "https://curyo.example";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status,
  });
}

test("agent MCP helpers call tools/call with protocol and bearer headers", async () => {
  let requestedUrl = "";
  let requestedBody: any;
  let requestedHeaders: Headers | undefined;
  const agent = createCuryoAgentClient({
    fetchImpl: async (input: URL | RequestInfo, init?: RequestInit) => {
      requestedUrl = String(input);
      requestedBody = JSON.parse(String(init?.body));
      requestedHeaders = new Headers(init?.headers);
      return jsonResponse({
        id: requestedBody.id,
        jsonrpc: "2.0",
        result: {
          content: [],
          isError: false,
          structuredContent: {
            canSubmit: true,
            clientRequestId: "ask-1",
            operationKey: `0x${"11".repeat(32)}`,
            payment: { amount: "1000000", asset: "USDC", decimals: 6 },
          },
        },
      });
    },
    mcpApiUrl: "https://curyo.example/api/mcp",
    mcpAccessToken: "agent-token",
    timeoutMs: 5_000,
  });

  const quote = await agent.quoteQuestion({
    bounty: { amount: 1_000_000n },
    chainId: 42220,
    clientRequestId: "ask-1",
    question: {
      categoryId: 1n,
      contextUrl: "https://example.com/context",
      description: "Should the agent proceed?",
      tags: ["agent", "decision"],
      title: "Proceed?",
    },
  });

  assert.equal(requestedUrl, "https://curyo.example/api/mcp");
  assert.equal(requestedHeaders?.get("authorization"), "Bearer agent-token");
  assert.equal(requestedHeaders?.get("mcp-protocol-version"), "2025-11-25");
  assert.equal(requestedBody.method, "tools/call");
  assert.equal(requestedBody.params.name, "curyo_quote_question");
  assert.equal(requestedBody.params.arguments.bounty.amount, "1000000");
  assert.equal(quote.canSubmit, true);
  assert.equal(quote.clientRequestId, "ask-1");
});

test("quoteQuestion uses direct authenticated agent HTTP when apiBaseUrl and token are configured", async () => {
  let requestedUrl = "";
  let requestedHeaders: Headers | undefined;
  let requestedBody: any;
  const agent = createCuryoAgentClient({
    apiBaseUrl: API_BASE_URL,
    fetchImpl: async (input: URL | RequestInfo, init?: RequestInit) => {
      requestedUrl = String(input);
      requestedBody = JSON.parse(String(init?.body));
      requestedHeaders = new Headers(init?.headers);
      return jsonResponse({
        canSubmit: true,
        clientRequestId: "ask-direct",
        fastLane: {
          conservativeStartingBountyAtomic: "999999",
          pricingConfidence: "medium",
          recommendedAction: "start_small",
        },
        operationKey: `0x${"55".repeat(32)}`,
        payment: { amount: "1000000", asset: "USDC", decimals: 6 },
      });
    },
    mcpAccessToken: "agent-token",
  });

  const response = await agent.quoteQuestion({
    bounty: { amount: 1_000_000n },
    chainId: 42220,
    clientRequestId: "ask-direct",
    question: {
      categoryId: 5n,
      contextUrl: "https://example.com/context",
      description: "Would this make you want to learn more?",
      tags: ["agent", "pitch"],
      title: "Pitch interest",
    },
  });

  assert.equal(requestedUrl, "https://curyo.example/api/agent/quote");
  assert.equal(requestedHeaders?.get("authorization"), "Bearer agent-token");
  assert.equal(requestedBody.clientRequestId, "ask-direct");
  assert.equal(response.operationKey, `0x${"55".repeat(32)}`);
  assert.equal(response.fastLane?.recommendedAction, "start_small");
  assert.equal(response.fastLane?.pricingConfidence, "medium");
});

test("quoteQuestion rejects tokenless hosted asks without agent auth", async () => {
  let fetchCalls = 0;
  const agent = createCuryoAgentClient({
    apiBaseUrl: API_BASE_URL,
    fetchImpl: async () => {
      fetchCalls += 1;
      throw new Error("tokenless quote should not call fetch");
    },
  });

  assert.throws(
    () =>
      agent.quoteQuestion({
        bounty: { amount: 1_000_000n, requiredVoters: 3n },
        chainId: 42220,
        clientRequestId: "ask-tokenless-quote",
        question: {
          categoryId: 7n,
          contextUrl: "https://example.com/context",
          description: "Does this look ready for launch?",
          tags: ["launch", "agent"],
          title: "Launch readiness?",
        },
      }),
    /agent asks require mcpAccessToken/i,
  );
  assert.equal(fetchCalls, 0);
});

test("askHumans rejects tokenless hosted asks without agent auth", async () => {
  let fetchCalls = 0;
  const agent = createCuryoAgentClient({
    apiBaseUrl: API_BASE_URL,
    fetchImpl: async () => {
      fetchCalls += 1;
      throw new Error("tokenless ask should not call fetch");
    },
  });

  const request: AskHumansRequest = {
    bounty: { amount: 1_000_000n, requiredVoters: 3n },
    chainId: 42220,
    clientRequestId: "ask-2",
    maxPaymentAmount: 1_250_000n,
    question: {
      categoryId: 7n,
      contextUrl: "https://example.com/context",
      description: "Does this look ready for launch?",
      tags: "launch,agent",
      title: "Launch readiness?",
    },
  };

  await assert.rejects(
    () => agent.askHumans(request),
    /agent asks require mcpAccessToken/i,
  );
  assert.equal(fetchCalls, 0);
});

test("askHumans prefers direct authenticated agent HTTP before MCP framing", async () => {
  let requestedUrl = "";
  let requestedHeaders: Headers | undefined;
  let requestedBody: any;
  const agent = createCuryoAgentClient({
    apiBaseUrl: API_BASE_URL,
    fetchImpl: async (input: URL | RequestInfo, init?: RequestInit) => {
      requestedUrl = String(input);
      requestedBody = JSON.parse(String(init?.body));
      requestedHeaders = new Headers(init?.headers);
      return jsonResponse({
        clientRequestId: "ask-http",
        operationKey: `0x${"66".repeat(32)}`,
        status: "submitted",
      });
    },
    mcpAccessToken: "agent-token",
  });

  await agent.askHumans({
    bounty: { amount: 1_000_000n },
    chainId: 42220,
    clientRequestId: "ask-http",
    maxPaymentAmount: 1_250_000n,
    question: {
      categoryId: 5n,
      contextUrl: "https://example.com/context",
      description: "Would this pitch make you want to learn more?",
      tags: ["agent", "pitch"],
      title: "Pitch interest",
    },
  });

  assert.equal(requestedUrl, "https://curyo.example/api/agent/asks");
  assert.equal(requestedHeaders?.get("authorization"), "Bearer agent-token");
  assert.equal(requestedBody.maxPaymentAmount, "1250000");
});

test("confirmAskTransactions uses direct authenticated agent HTTP", async () => {
  let requestedUrl = "";
  let requestedHeaders: Headers | undefined;
  let requestedBody: any;
  const operationKey = `0x${"77".repeat(32)}`;
  const agent = createCuryoAgentClient({
    apiBaseUrl: API_BASE_URL,
    fetchImpl: async (input: URL | RequestInfo, init?: RequestInit) => {
      requestedUrl = String(input);
      requestedBody = JSON.parse(String(init?.body));
      requestedHeaders = new Headers(init?.headers);
      return jsonResponse({
        contentId: "42",
        operationKey,
        status: "submitted",
      });
    },
    mcpAccessToken: "agent-token",
  });

  const response = await agent.confirmAskTransactions({
    operationKey,
    transactionHashes: [`0x${"88".repeat(32)}`],
  });

  assert.equal(requestedUrl, `https://curyo.example/api/agent/asks/${operationKey}/confirm`);
  assert.equal(requestedHeaders?.get("authorization"), "Bearer agent-token");
  assert.deepEqual(requestedBody.transactionHashes, [`0x${"88".repeat(32)}`]);
  assert.equal(response.contentId, "42");
});

test("confirmAskTransactions can use MCP framing", async () => {
  let requestedBody: any;
  const operationKey = `0x${"99".repeat(32)}`;
  const agent = createCuryoAgentClient({
    mcpApiUrl: "https://curyo.example/api/mcp",
    fetchImpl: async (_input: URL | RequestInfo, init?: RequestInit) => {
      requestedBody = JSON.parse(String(init?.body));
      return jsonResponse({
        result: {
          structuredContent: { operationKey, status: "submitted" },
        },
      });
    },
    mcpAccessToken: "agent-token",
  });

  const response = await agent.confirmAskTransactions({
    operationKey,
    transactionHashes: [`0x${"aa".repeat(32)}`],
  });

  assert.equal(requestedBody.params.name, "curyo_confirm_ask_transactions");
  assert.equal(requestedBody.params.arguments.operationKey, operationKey);
  assert.deepEqual(requestedBody.params.arguments.transactionHashes, [`0x${"aa".repeat(32)}`]);
  assert.equal(response.status, "submitted");
});

test("getQuestionStatus rejects tokenless hosted status lookups without agent auth", async () => {
  let fetchCalls = 0;
  const agent = createCuryoAgentClient({
    apiBaseUrl: API_BASE_URL,
    fetchImpl: async () => {
      fetchCalls += 1;
      throw new Error("tokenless status should not call fetch");
    },
  });

  await assert.rejects(
    () =>
      agent.getQuestionStatus({
        operationKey: `0x${"33".repeat(32)}`,
      }),
    /agent asks require mcpAccessToken/i,
  );
  await assert.rejects(
    () => agent.getQuestionStatus({ chainId: 42220, clientRequestId: "ask-3" }),
    /agent asks require mcpAccessToken/i,
  );
  assert.equal(fetchCalls, 0);
});

test("authenticated status, result, and templates use direct agent HTTP endpoints", async () => {
  const requestedUrls: string[] = [];
  const agent = createCuryoAgentClient({
    apiBaseUrl: API_BASE_URL,
    fetchImpl: async (input: URL | RequestInfo) => {
      requestedUrls.push(String(input));
      if (String(input).includes("/templates")) {
        return jsonResponse({
          templates: [
            {
              bundleStrategy: "independent",
              id: "generic_rating",
              submissionPattern: "single_question",
              templateInputsSchema: { type: "object" },
              version: 1,
            },
          ],
        });
      }
      if (String(input).includes("/results/")) {
        return jsonResponse({ answer: "pending", ready: false });
      }
      return jsonResponse({
        callbackDeliveries: [
          {
            attemptCount: 1,
            callbackUrl: "https://agent.example/curyo",
            eventId: "event-1",
            eventType: "question.submitted",
            nextAttemptAt: "2026-04-23T12:00:03.000Z",
            status: "retrying",
            subscriptionId: "sub-1",
          },
        ],
        ready: false,
        resultTool: "curyo_get_result",
        status: "submitted",
        terminal: false,
      });
    },
    mcpAccessToken: "agent-token",
  });

  const status = await agent.getQuestionStatus({
    operationKey: `0x${"77".repeat(32)}`,
  });
  await agent.getResult({ chainId: 42220, clientRequestId: "ask-http" });
  await agent.getResult({ contentId: "123" });
  const templates = await agent.listResultTemplates();

  const callbackStatus:
    | NonNullable<QuestionStatusResponse["callbackDeliveries"]>[number]["status"]
    | undefined = status.callbackDeliveries?.[0]?.status;
  const templateMode:
    | NonNullable<ListResultTemplatesResponse["templates"]>[number]["submissionPattern"]
    | undefined = templates.templates[0]?.submissionPattern;

  assert.equal(
    requestedUrls[0],
    `https://curyo.example/api/agent/asks/0x${"77".repeat(32)}`,
  );
  assert.equal(
    requestedUrls[1],
    "https://curyo.example/api/agent/results/by-client-request?chainId=42220&clientRequestId=ask-http",
  );
  assert.equal(
    requestedUrls[2],
    "https://curyo.example/api/agent/results/by-content/123",
  );
  assert.equal(requestedUrls[3], "https://curyo.example/api/agent/templates");
  assert.equal(callbackStatus, "retrying");
  assert.equal(status.resultTool, "curyo_get_result");
  assert.equal(status.terminal, false);
  assert.equal(templateMode, "single_question");
  assert.equal(templates.templates[0]?.bundleStrategy, "independent");
});

test("getResult can build a tokenless public result when contentId is known", async () => {
  const requestedUrls: string[] = [];
  const agent = createCuryoAgentClient({
    apiBaseUrl: API_BASE_URL,
    fetchImpl: async (input: URL | RequestInfo) => {
      const url = String(input);
      requestedUrls.push(url);
      if (url.includes("/content/42")) {
        return jsonResponse({
          audienceContext: null,
          content: {
            categoryId: "5",
            id: "42",
            question: "Would this pitch make you want to learn more?",
            rating: 72,
            ratingBps: 7200,
            ratingSettledRounds: 1,
            status: 1,
            title: "Pitch interest",
            totalVotes: 12,
          },
          ratings: [],
          rounds: [
            {
              contentId: "42",
              conservativeRatingBps: 6100,
              downCount: 2,
              downPool: "150",
              id: "round-1",
              ratingBps: 7200,
              revealedCount: 12,
              roundId: "1",
              settledAt: "2026-04-23T12:00:00.000Z",
              startTime: "2026-04-23T11:00:00.000Z",
              state: ROUND_STATE.Settled,
              totalStake: "500",
              upCount: 10,
              upPool: "350",
              voteCount: 12,
            },
          ],
        });
      }
      if (url.includes("/api/feedback?contentId=42")) {
        return jsonResponse({
          count: 1,
          items: [
            {
              body: "People liked the value proposition but wanted clearer pricing.",
              contentId: "42",
              feedbackType: "concern",
              id: 1,
              isPublic: true,
              roundId: "1",
              sourceUrl: "https://example.com/pricing-note",
            },
          ],
          publicCount: 1,
        });
      }
      throw new Error(`Unexpected request: ${url}`);
    },
  });

  const result = await agent.getResult({
    contentId: "42",
  });

  assert.deepEqual(requestedUrls, [
    "https://curyo.example/content/42",
    "https://curyo.example/api/feedback?contentId=42",
  ]);
  assert.equal(result.ready, true);
  assert.equal(result.answer, "proceed");
  assert.equal(result.publicUrl, "https://curyo.example/rate?content=42");
  assert.equal(result.recommendedNextAction, "proceed_after_addressing_objections");
  assert.equal(result.methodology?.templateId, "generic_rating");
  assert.equal(result.operation, null);
  assert.deepEqual(result.sourceUrls, ["https://example.com/pricing-note"]);
});

test("getResult rejects tokenless operation lookups until a public content id is available", async () => {
  let fetchCalls = 0;
  const agent = createCuryoAgentClient({
    apiBaseUrl: API_BASE_URL,
    fetchImpl: async () => {
      fetchCalls += 1;
      throw new Error("tokenless operation result should not call fetch");
    },
  });

  await assert.rejects(
    () =>
      agent.getResult({
        operationKey: `0x${"99".repeat(32)}`,
      }),
    /agent asks require mcpAccessToken/i,
  );
  assert.equal(fetchCalls, 0);
});

test("getResult treats terminal non-settled tokenless rounds as ready results", async () => {
  const agent = createCuryoAgentClient({
    apiBaseUrl: API_BASE_URL,
    fetchImpl: async (input: URL | RequestInfo) => {
      const url = String(input);
      if (url.includes("/content/42")) {
        return jsonResponse({
          audienceContext: null,
          content: {
            categoryId: "5",
            id: "42",
            question: "Would this pitch make you want to learn more?",
            rating: 50,
            ratingBps: 5000,
            ratingSettledRounds: 1,
            status: 1,
            title: "Pitch interest",
            totalVotes: 8,
          },
          ratings: [],
          rounds: [
            {
              contentId: "42",
              conservativeRatingBps: 5000,
              downCount: 4,
              downPool: "500",
              id: "round-2",
              ratingBps: 5000,
              revealedCount: 8,
              roundId: "2",
              settledAt: "2026-04-23T12:00:00.000Z",
              startTime: "2026-04-23T11:00:00.000Z",
              state: ROUND_STATE.Tied,
              totalStake: "1000",
              upCount: 4,
              upPool: "500",
              voteCount: 8,
            },
          ],
        });
      }
      if (url.includes("/api/feedback?contentId=42")) {
        return jsonResponse({
          count: 0,
          items: [],
          publicCount: 0,
        });
      }
      throw new Error(`Unexpected request: ${url}`);
    },
  });

  const result = await agent.getResult({
    contentId: "42",
  });

  assert.equal(result.ready, true);
  assert.equal(result.answer, "inconclusive");
  assert.equal(result.recommendedNextAction, "collect_more_votes");
  assert.ok(!result.limitations?.some(item => item.includes("not final")));
});

test("parseAgentResult unwraps MCP tool content and preserves top-level fields", () => {
  const parsed = parseAgentResult({
    content: [
      {
        type: "text",
        text: JSON.stringify({
          answer: "proceed",
          ready: true,
          extra: { kept: true },
        }),
      },
    ],
  });

  assert.equal(parsed.ready, true);
  assert.equal(parsed.answer, "proceed");
  assert.deepEqual(parsed.extra, { kept: true });
});

test("buildWebhookVerifier validates timestamped HMAC signatures", async () => {
  const body = JSON.stringify({
    operationKey: `0x${"44".repeat(32)}`,
    ready: true,
  });
  const eventId = "event-1";
  const timestamp = "2026-04-23T12:00:00.000Z";
  const signature = createHmac("sha256", "shared-secret")
    .update(`v1.${eventId}.${timestamp}.${body}`)
    .digest("hex");
  const verifier = buildWebhookVerifier({ secret: "shared-secret" });

  assert.equal(
    await verifier.verify({
      body,
      headers: {
        "x-curyo-callback-id": eventId,
        "x-curyo-callback-signature": `v1=${signature}`,
        "x-curyo-callback-timestamp": timestamp,
      },
      now: new Date("2026-04-23T12:04:00.000Z"),
    }),
    true,
  );

  assert.equal(
    await verifier.verify({
      body,
      headers: {
        "x-curyo-callback-id": eventId,
        "x-curyo-callback-signature": `v1=${signature}`,
        "x-curyo-callback-timestamp": timestamp,
      },
      now: new Date("2026-04-23T12:06:01.000Z"),
    }),
    false,
  );
});
