import { resolvePonderUrl } from "./client";
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
  assert.throws(
    () => resolvePonderUrl("http://localhost:42069", true),
    /NEXT_PUBLIC_PONDER_URL must not point to localhost in production/,
  );
});
