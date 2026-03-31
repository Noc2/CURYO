import assert from "node:assert/strict";
import { test } from "node:test";
import { shouldPerformLiveValidation } from "./liveValidation";

test("generic URLs are left unvalidated server-side", () => {
  assert.equal(shouldPerformLiveValidation("https://example.com/articles/security"), false);
  assert.equal(shouldPerformLiveValidation("https://en.wikipedia.org/wiki/Bitcoin"), true);
  assert.equal(shouldPerformLiveValidation("https://www.youtube.com/watch?v=dQw4w9WgXcQ"), true);
});
