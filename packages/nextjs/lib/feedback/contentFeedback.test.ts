import { ROUND_STATE } from "@curyo/contracts/protocol";
import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";

process.env.DATABASE_URL = "memory:";

type ContentFeedbackModule = typeof import("./contentFeedback");
type NormalizedContentFeedbackInput = import("./contentFeedback").NormalizedContentFeedbackInput;
type ContentFeedbackRoundContext = import("./contentFeedback").ContentFeedbackRoundContext;
type DbModule = typeof import("../db");
type DbTestMemoryModule = typeof import("../db/testMemory");

let contentFeedback: ContentFeedbackModule;
let dbModule: DbModule;
let dbTestMemory: DbTestMemoryModule;

const WALLET = "0x1234567890abcdef1234567890abcdef12345678" as const;
const OTHER_WALLET = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd" as const;
const CHAIN_ID = 31337;
const SIGNATURE = `0x${"11".repeat(65)}` as `0x${string}`;
let nonceCounter = 1n;

function nextNonce(): `0x${string}` {
  return `0x${(nonceCounter++).toString(16).padStart(64, "0")}` as `0x${string}`;
}

function prepareFeedback(payload: NormalizedContentFeedbackInput, context: ContentFeedbackRoundContext) {
  assert.ok(context.currentRoundId);
  return contentFeedback.buildPreparedContentFeedbackInput(payload, {
    chainId: CHAIN_ID,
    roundId: context.currentRoundId,
    clientNonce: nextNonce(),
    payloadSignature: SIGNATURE,
  });
}

before(async () => {
  dbModule = await import("../db");
  dbTestMemory = await import("../db/testMemory");
  dbModule.__setDatabaseResourcesForTests(dbTestMemory.createMemoryDatabaseResources());
  contentFeedback = await import("./contentFeedback");
});

beforeEach(async () => {
  await dbModule.dbClient.execute("DELETE FROM content_feedback");
});

after(() => {
  dbModule.__setDatabaseResourcesForTests(null);
});

test("normalizes structured feedback input", () => {
  const normalized = contentFeedback.normalizeContentFeedbackInput({
    address: "0x1234567890ABCDEF1234567890ABCDEF12345678",
    contentId: "00042",
    feedbackType: "AI_NOTE",
    body: "  This needs the publication date checked.  ",
    sourceUrl: "https://example.com/source",
  });

  assert.equal(normalized.ok, true);
  if (!normalized.ok) return;
  assert.deepEqual(normalized.payload, {
    normalizedAddress: WALLET,
    contentId: "42",
    feedbackType: "ai_note",
    body: "This needs the publication date checked.",
    sourceUrl: "https://example.com/source",
  });
});

test("rejects invalid feedback fields", () => {
  assert.equal(
    contentFeedback.normalizeContentFeedbackInput({
      address: WALLET,
      contentId: "1",
      feedbackType: "chat",
      body: "Valid body",
    }).ok,
    false,
  );
  assert.equal(
    contentFeedback.normalizeContentFeedbackInput({
      address: WALLET,
      contentId: "1",
      feedbackType: "evidence",
      body: "x",
    }).ok,
    false,
  );
  assert.equal(
    contentFeedback.normalizeContentFeedbackInput({
      address: WALLET,
      contentId: "1",
      feedbackType: "evidence",
      body: "Valid body",
      sourceUrl: "ipfs://example",
    }).ok,
    false,
  );
});

test("builds stable canonical feedback hash metadata", () => {
  const context = contentFeedback.buildContentFeedbackRoundContext([{ roundId: "7", state: ROUND_STATE.Open }]);
  const payload = contentFeedback.normalizeContentFeedbackInput({
    address: WALLET,
    contentId: "12",
    feedbackType: "concern",
    body: "The wording could be interpreted two different ways.",
  });
  assert.equal(payload.ok, true);
  if (!payload.ok) return;

  const clientNonce = nextNonce();
  const prepared = contentFeedback.buildPreparedContentFeedbackInput(payload.payload, {
    chainId: CHAIN_ID,
    roundId: context.currentRoundId!,
    clientNonce,
    payloadSignature: SIGNATURE,
  });
  const preparedAgain = contentFeedback.buildPreparedContentFeedbackInput(payload.payload, {
    chainId: CHAIN_ID,
    roundId: context.currentRoundId!,
    clientNonce,
    feedbackHash: prepared.feedbackHash,
    payloadSignature: SIGNATURE,
  });

  assert.equal(prepared.feedbackHash, preparedAgain.feedbackHash);
  assert.equal(prepared.feedbackHash.length, 66);
  assert.equal(prepared.chainId, CHAIN_ID);
  assert.equal(prepared.roundId, "7");
  assert.equal(prepared.clientNonce, clientNonce);
});

test("builds round context from terminal and open rounds", () => {
  const context = contentFeedback.buildContentFeedbackRoundContext([
    { roundId: "1", state: ROUND_STATE.Settled },
    { roundId: "2", state: ROUND_STATE.Open },
  ]);

  assert.equal(context.openRoundId, "2");
  assert.equal(context.currentRoundId, "2");
  assert.equal(context.settlementComplete, false);
  assert.equal(context.terminalRoundIds.has("1"), true);
  assert.equal(context.terminalRoundIds.has("2"), false);
});

test("public reads hide active round feedback while owner reads include it", async () => {
  const activeContext = contentFeedback.buildContentFeedbackRoundContext([{ roundId: "7", state: ROUND_STATE.Open }]);
  const payload = contentFeedback.normalizeContentFeedbackInput({
    address: WALLET,
    contentId: "12",
    feedbackType: "concern",
    body: "The wording could be interpreted two different ways.",
  });
  assert.equal(payload.ok, true);
  if (!payload.ok) return;

  await contentFeedback.addContentFeedback(prepareFeedback(payload.payload, activeContext), activeContext);

  const publicResult = await contentFeedback.listContentFeedback({
    contentId: "12",
    context: activeContext,
  });
  assert.equal(publicResult.count, 0);
  assert.equal(publicResult.publicCount, 0);

  const ownerResult = await contentFeedback.listContentFeedback({
    contentId: "12",
    context: activeContext,
    viewerAddress: WALLET,
  });
  assert.equal(ownerResult.count, 1);
  assert.equal(ownerResult.ownHiddenCount, 1);
  assert.equal(ownerResult.items[0]?.chainId, CHAIN_ID);
  assert.equal(ownerResult.items[0]?.feedbackHash?.length, 66);

  const otherResult = await contentFeedback.listContentFeedback({
    contentId: "12",
    context: activeContext,
    viewerAddress: OTHER_WALLET,
  });
  assert.equal(otherResult.count, 0);
});

test("terminal round feedback becomes public", async () => {
  const activeContext = contentFeedback.buildContentFeedbackRoundContext([{ roundId: "8", state: ROUND_STATE.Open }]);
  const settledContext = contentFeedback.buildContentFeedbackRoundContext([
    { roundId: "8", state: ROUND_STATE.Settled },
  ]);
  const payload = contentFeedback.normalizeContentFeedbackInput({
    address: WALLET,
    contentId: "13",
    feedbackType: "evidence",
    body: "The cited report confirms the central claim.",
  });
  assert.equal(payload.ok, true);
  if (!payload.ok) return;

  await contentFeedback.addContentFeedback(prepareFeedback(payload.payload, activeContext), activeContext);

  const result = await contentFeedback.listContentFeedback({
    contentId: "13",
    context: settledContext,
  });
  assert.equal(result.count, 1);
  assert.equal(result.publicCount, 1);
  assert.equal(result.items[0]?.isPublic, true);
});

test("rejects duplicate feedback from the same author in the same round", async () => {
  const activeContext = contentFeedback.buildContentFeedbackRoundContext([{ roundId: "9", state: ROUND_STATE.Open }]);
  const payload = contentFeedback.normalizeContentFeedbackInput({
    address: WALLET,
    contentId: "14",
    feedbackType: "clarification",
    body: "The question should specify which source of truth wins.",
  });
  assert.equal(payload.ok, true);
  if (!payload.ok) return;

  await contentFeedback.addContentFeedback(prepareFeedback(payload.payload, activeContext), activeContext);
  await assert.rejects(
    () => contentFeedback.addContentFeedback(prepareFeedback(payload.payload, activeContext), activeContext),
    contentFeedback.ContentFeedbackDuplicateError,
  );
});
