import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";

process.env.DATABASE_URL = "memory:";

type DbModule = typeof import("~~/lib/db");
type DbTestMemoryModule = typeof import("~~/lib/db/testMemory");
type SignedReadSessionsModule = typeof import("./signedReadSessions");
type SignedRouteHelpersModule = typeof import("./signedRouteHelpers");

const WALLET = "0x1234567890abcdef1234567890abcdef12345678" as const;

let dbModule: DbModule;
let dbTestMemory: DbTestMemoryModule;
let signedReadSessions: SignedReadSessionsModule;
let signedRouteHelpers: SignedRouteHelpersModule;

before(async () => {
  dbModule = await import("~~/lib/db");
  dbTestMemory = await import("~~/lib/db/testMemory");
  dbModule.__setDatabaseResourcesForTests(dbTestMemory.createMemoryDatabaseResources());
  signedReadSessions = await import("./signedReadSessions");
  signedRouteHelpers = await import("./signedRouteHelpers");
});

beforeEach(async () => {
  await dbModule.dbClient.execute("DELETE FROM signed_read_sessions");
});

after(() => {
  dbModule.__setDatabaseResourcesForTests(null);
});

test("signed read responses only issue the verified read scope", async () => {
  const response = await signedRouteHelpers.createSignedReadResponse(WALLET, "content_feedback", { ok: true });

  const feedbackCookie = response.cookies.get(signedReadSessions.CONTENT_FEEDBACK_SIGNED_READ_SESSION_COOKIE_NAME);
  const agentPoliciesCookie = response.cookies.get(signedReadSessions.AGENT_POLICIES_SIGNED_READ_SESSION_COOKIE_NAME);

  assert.ok(feedbackCookie?.value, "requested read scope cookie should be set");
  assert.equal(agentPoliciesCookie, undefined);
  assert.equal(
    await signedReadSessions.verifySignedReadSession(feedbackCookie.value, WALLET, "content_feedback"),
    true,
  );
  assert.equal(await signedReadSessions.verifySignedReadSession(feedbackCookie.value, WALLET, "agent_policies"), false);
});
