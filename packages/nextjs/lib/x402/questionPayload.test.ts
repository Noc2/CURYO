import assert from "node:assert/strict";
import test from "node:test";
import {
  X402QuestionInputError,
  buildX402QuestionOperation,
  parseX402QuestionRequest,
} from "~~/lib/x402/questionPayload";

const VALID_REQUEST = {
  bounty: {
    amount: "1000000",
    asset: "USDC",
    requiredSettledRounds: "1",
    requiredVoters: "3",
    rewardPoolExpiresAt: "0",
  },
  chainId: 42220,
  clientRequestId: "youtube:abc123",
  question: {
    categoryId: "5",
    contextUrl: "https://example.com/watch?v=abc123",
    description: "Vote based on the source material and the prompt.",
    imageUrls: ["https://example.com/preview.jpg"],
    tags: ["Media", "Video"],
    title: "Is this clip worth watching?",
  },
};

test("parseX402QuestionRequest normalizes a valid paid question payload", () => {
  const payload = parseX402QuestionRequest(VALID_REQUEST);

  assert.equal(payload.chainId, 42220);
  assert.equal(payload.contextUrl, "https://example.com/watch?v=abc123");
  assert.equal(payload.bounty.amount, 1_000_000n);
  assert.equal(payload.bounty.requiredVoters, 3n);
  assert.equal(payload.roundConfig.epochDuration, 1200n);
  assert.equal(payload.tags, "Media,Video");
  assert.deepEqual(payload.imageUrls, ["https://example.com/preview.jpg"]);
});

test("parseX402QuestionRequest accepts explicit governed round config", () => {
  const payload = parseX402QuestionRequest({
    ...VALID_REQUEST,
    question: {
      ...VALID_REQUEST.question,
      roundConfig: {
        epochDuration: "600",
        maxDuration: "7200",
        minVoters: "5",
        maxVoters: "50",
      },
    },
  });

  assert.equal(payload.roundConfig.epochDuration, 600n);
  assert.equal(payload.roundConfig.maxDuration, 7200n);
  assert.equal(payload.roundConfig.minVoters, 5n);
  assert.equal(payload.roundConfig.maxVoters, 50n);
});

test("buildX402QuestionOperation binds round config into the payload hash", () => {
  const first = buildX402QuestionOperation(parseX402QuestionRequest(VALID_REQUEST));
  const second = buildX402QuestionOperation(
    parseX402QuestionRequest({
      ...VALID_REQUEST,
      question: {
        ...VALID_REQUEST.question,
        roundConfig: {
          epochDuration: "600",
          maxDuration: "7200",
          minVoters: "5",
          maxVoters: "50",
        },
      },
    }),
  );

  assert.notEqual(first.operationKey, second.operationKey);
  assert.notEqual(first.payloadHash, second.payloadHash);
});

test("buildX402QuestionOperation is stable for equivalent payloads", () => {
  const first = buildX402QuestionOperation(parseX402QuestionRequest(VALID_REQUEST));
  const second = buildX402QuestionOperation(parseX402QuestionRequest({ ...VALID_REQUEST }));

  assert.equal(first.operationKey, second.operationKey);
  assert.equal(first.payloadHash, second.payloadHash);
});

test("parseX402QuestionRequest rejects non-USDC x402 bounties", () => {
  assert.throws(
    () =>
      parseX402QuestionRequest({
        ...VALID_REQUEST,
        bounty: { ...VALID_REQUEST.bounty, asset: "cREP" },
      }),
    X402QuestionInputError,
  );
});

test("parseX402QuestionRequest rejects unsupported media combinations before payment", () => {
  assert.throws(
    () =>
      parseX402QuestionRequest({
        ...VALID_REQUEST,
        question: {
          ...VALID_REQUEST.question,
          videoUrl: "https://www.youtube.com/watch?v=abc123",
        },
      }),
    /Use imageUrls or videoUrl/,
  );
});
