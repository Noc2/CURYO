import assert from "node:assert/strict";
import test from "node:test";
import { createHmac } from "node:crypto";
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
});

test("askHumans defaults to the x402 question endpoint without wallet assumptions", async () => {
  let requestedUrl = "";
  let requestedBody: any;
  const agent = createCuryoAgentClient({
    apiBaseUrl: API_BASE_URL,
    fetchImpl: async (input: URL | RequestInfo, init?: RequestInit) => {
      requestedUrl = String(input);
      requestedBody = JSON.parse(String(init?.body));
      return jsonResponse({
        clientRequestId: "ask-2",
        contentId: "42",
        operationKey: `0x${"22".repeat(32)}`,
        status: "submitted",
      });
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

  const response = await agent.askHumans(request);

  assert.equal(requestedUrl, "https://curyo.example/api/x402/questions");
  assert.equal(requestedBody.maxPaymentAmount, "1250000");
  assert.equal(requestedBody.bounty.requiredVoters, "3");
  assert.equal(response.status, "submitted");
  assert.equal(response.contentId, "42");
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

test("getQuestionStatus can use x402 operation and client request lookups", async () => {
  const requestedUrls: string[] = [];
  const agent = createCuryoAgentClient({
    apiBaseUrl: API_BASE_URL,
    fetchImpl: async (input: URL | RequestInfo) => {
      requestedUrls.push(String(input));
      return jsonResponse({ status: "submitted" });
    },
  });

  await agent.getQuestionStatus({ operationKey: `0x${"33".repeat(32)}` });
  await agent.getQuestionStatus({ chainId: 42220, clientRequestId: "ask-3" });

  assert.equal(
    requestedUrls[0],
    `https://curyo.example/api/x402/questions/0x${"33".repeat(32)}`,
  );
  assert.equal(
    requestedUrls[1],
    "https://curyo.example/api/x402/questions/by-client-request?chainId=42220&clientRequestId=ask-3",
  );
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
