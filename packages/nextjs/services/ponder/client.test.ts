import { fetchPonderJson, ponderApi, resolvePonderUrl } from "./client";
import assert from "node:assert/strict";
import { test } from "node:test";

test("resolvePonderUrl uses the local default outside production", () => {
  assert.equal(resolvePonderUrl(undefined, false), "http://localhost:42069");
});

test("resolvePonderUrl allows missing config in production until runtime use", () => {
  assert.equal(resolvePonderUrl(undefined, true), null);
});

test("resolvePonderUrl normalizes valid production URLs", () => {
  assert.equal(resolvePonderUrl("https://ponder.curyo.xyz/", true), "https://ponder.curyo.xyz");
});

test("resolvePonderUrl rejects invalid production URLs", () => {
  assert.throws(() => resolvePonderUrl("not-a-url", true), /NEXT_PUBLIC_PONDER_URL must be a valid URL/);
});

test("resolvePonderUrl disables localhost URLs in production without crashing module evaluation", () => {
  assert.equal(resolvePonderUrl("http://localhost:42069", true), null);
});

test("resolvePonderUrl can allow localhost URLs for local production-style E2E", () => {
  assert.equal(resolvePonderUrl("http://localhost:42069", true, true), "http://localhost:42069");
});

test("fetchPonderJson returns parsed json responses", async () => {
  const response = new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

  const result = await fetchPonderJson<{ ok: boolean }>("https://ponder.curyo.xyz/content", 1000, async () => response);

  assert.deepEqual(result, { ok: true });
});

test("fetchPonderJson surfaces request timeouts clearly", async () => {
  const abortError = Object.assign(new Error("aborted"), { name: "AbortError" });

  await assert.rejects(
    () =>
      fetchPonderJson("https://ponder.curyo.xyz/content", 1234, async () => {
        throw abortError;
      }),
    /Ponder request timed out after 1234ms/,
  );
});

test("fetchPonderJson wraps fetch failures", async () => {
  await assert.rejects(
    () =>
      fetchPonderJson("https://ponder.curyo.xyz/content", 1000, async () => {
        throw new Error("socket hang up");
      }),
    /Ponder request failed: socket hang up/,
  );
});

test("ponderApi.getContentWindow respects hasMore when search totals are omitted", async () => {
  const originalGetContent = ponderApi.getContent;
  let callCount = 0;

  ponderApi.getContent = async () => {
    callCount += 1;

    if (callCount === 1) {
      return {
        items: Array.from({ length: 200 }, (_, index) => ({ id: String(index + 1) })) as any,
        total: null,
        limit: 200,
        offset: 0,
        hasMore: true,
      };
    }

    return {
      items: Array.from({ length: 50 }, (_, index) => ({ id: String(index + 201) })) as any,
      total: null,
      limit: 50,
      offset: 200,
      hasMore: true,
    };
  };

  try {
    const response = await ponderApi.getContentWindow({ limit: "250", search: "curyo" });

    assert.equal(response.items.length, 250);
    assert.equal(response.total, null);
    assert.equal(response.hasMore, true);
  } finally {
    ponderApi.getContent = originalGetContent;
  }
});

test("ponderApi.getAllRounds paginates every round for a content item", async () => {
  const originalGetRounds = ponderApi.getRounds;
  const offsets: string[] = [];
  const submitters: Array<string | undefined> = [];

  ponderApi.getRounds = async params => {
    offsets.push(params?.offset ?? "0");
    submitters.push(params?.submitter);
    const offset = Number(params?.offset ?? 0);
    const length = offset === 0 ? 200 : 25;

    return {
      items: Array.from({ length }, (_, index) => ({ roundId: String(offset + index + 1) })) as any,
      total: 225,
      limit: 200,
      offset,
    };
  };

  try {
    const rounds = await ponderApi.getAllRounds({
      contentId: "7",
      state: "2",
      submitter: "0x0000000000000000000000000000000000000001",
    });

    assert.equal(rounds.length, 225);
    assert.deepEqual(offsets, ["0", "200"]);
    assert.deepEqual(submitters, [
      "0x0000000000000000000000000000000000000001",
      "0x0000000000000000000000000000000000000001",
    ]);
  } finally {
    ponderApi.getRounds = originalGetRounds;
  }
});
