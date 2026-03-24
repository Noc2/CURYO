import { resolveNotificationEmailAppUrl } from "./emailUrls";
import assert from "node:assert/strict";
import test from "node:test";

test("resolveNotificationEmailAppUrl prefers the request origin when it is public", () => {
  assert.equal(
    resolveNotificationEmailAppUrl({
      requestOrigin: "https://www.curyo.xyz",
      fallbackAppUrl: "https://info.curyo.xyz",
      production: true,
    }),
    "https://www.curyo.xyz",
  );
});

test("resolveNotificationEmailAppUrl falls back to the configured app URL when request origin is not public", () => {
  assert.equal(
    resolveNotificationEmailAppUrl({
      requestOrigin: "http://localhost:3000",
      fallbackAppUrl: "https://www.curyo.xyz",
      production: true,
    }),
    "https://www.curyo.xyz",
  );
});
