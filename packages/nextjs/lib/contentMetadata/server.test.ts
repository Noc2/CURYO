import { resolveContentMetadata } from "./server";
import assert from "node:assert/strict";
import { afterEach } from "node:test";
import test from "node:test";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("resolveContentMetadata returns direct image URLs without fetching metadata", async () => {
  assert.deepEqual(await resolveContentMetadata("https://example.com/photo.webp?size=large"), {
    thumbnailUrl: "https://example.com/photo.webp?size=large",
  });
});

test("resolveContentMetadata does not follow redirects when fetching page metadata", async () => {
  let observedRedirect: RequestRedirect | undefined;
  globalThis.fetch = async (_input, init) => {
    observedRedirect = init?.redirect;
    return new Response(null, {
      headers: {
        location: "https://169.254.169.254/latest/meta-data/",
      },
      status: 302,
      statusText: "Found",
    });
  };

  assert.deepEqual(await resolveContentMetadata("https://example.com/article"), {
    thumbnailUrl: null,
  });
  assert.equal(observedRedirect, "manual");
});
