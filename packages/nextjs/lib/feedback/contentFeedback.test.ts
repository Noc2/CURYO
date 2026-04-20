import { ROUND_STATE } from "@curyo/contracts/protocol";
import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";

process.env.DATABASE_URL = "memory:";

type ContentFeedbackModule = typeof import("./contentFeedback");
type DbModule = typeof import("../db");
type DbTestMemoryModule = typeof import("../db/testMemory");

let contentFeedback: ContentFeedbackModule;
let dbModule: DbModule;
let dbTestMemory: DbTestMemoryModule;

const WALLET = "0x1234567890abcdef1234567890abcdef12345678" as const;
const OTHER_WALLET = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd" as const;

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

  await contentFeedback.addContentFeedback(payload.payload, activeContext);

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

  await contentFeedback.addContentFeedback(payload.payload, activeContext);

  const result = await contentFeedback.listContentFeedback({
    contentId: "13",
    context: settledContext,
  });
  assert.equal(result.count, 1);
  assert.equal(result.publicCount, 1);
  assert.equal(result.items[0]?.isPublic, true);
});
