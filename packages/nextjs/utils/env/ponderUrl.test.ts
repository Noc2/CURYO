import { resolvePonderUrlValue } from "./ponderUrl";
import assert from "node:assert/strict";
import { test } from "node:test";

test("resolvePonderUrlValue falls back to the local dev Ponder URL outside production", () => {
  assert.deepEqual(resolvePonderUrlValue(undefined, false), {
    url: "http://localhost:42069",
    invalid: false,
  });
});

test("resolvePonderUrlValue treats blank production config as optional", () => {
  assert.deepEqual(resolvePonderUrlValue("  ", true), {
    url: null,
    invalid: false,
  });
});

test("resolvePonderUrlValue reports malformed explicit values without throwing", () => {
  assert.deepEqual(resolvePonderUrlValue("not-a-url", true), {
    url: null,
    invalid: true,
  });
});

test("resolvePonderUrlValue rejects localhost in production unless explicitly allowed", () => {
  assert.deepEqual(resolvePonderUrlValue("http://127.0.0.1:42069/", true), {
    url: null,
    invalid: false,
  });

  assert.deepEqual(resolvePonderUrlValue("http://127.0.0.1:42069/", true, true), {
    url: "http://127.0.0.1:42069",
    invalid: false,
  });
});
