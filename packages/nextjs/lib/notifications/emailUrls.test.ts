import {
  buildNotificationEmailUnsubscribeToken,
  buildNotificationEmailUnsubscribeUrl,
  buildNotificationSettingsRedirectUrl,
  resolveNotificationEmailAppUrl,
  verifyNotificationEmailUnsubscribeToken,
} from "./emailUrls";
import assert from "node:assert/strict";
import test from "node:test";

test("resolveNotificationEmailAppUrl prefers the configured app URL in production", () => {
  assert.equal(
    resolveNotificationEmailAppUrl({
      requestOrigin: "https://www.curyo.xyz",
      fallbackAppUrl: "https://info.curyo.xyz",
      production: true,
    }),
    "https://info.curyo.xyz",
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

test("resolveNotificationEmailAppUrl uses the request origin when no configured app URL is available", () => {
  assert.equal(
    resolveNotificationEmailAppUrl({
      requestOrigin: "https://www.curyo.xyz",
      fallbackAppUrl: undefined,
      production: true,
    }),
    "https://www.curyo.xyz",
  );
});

test("buildNotificationSettingsRedirectUrl returns the configured app URL in production", () => {
  const url = buildNotificationSettingsRedirectUrl({
    requestOrigin: "https://evil.example",
    fallbackAppUrl: "https://www.curyo.xyz",
    production: true,
    status: "verified",
  });

  assert.equal(url?.toString(), "https://www.curyo.xyz/settings?tab=notifications&email=verified");
});

test("buildNotificationSettingsRedirectUrl returns null when no safe base URL is available", () => {
  assert.equal(
    buildNotificationSettingsRedirectUrl({
      requestOrigin: "notaurl",
      fallbackAppUrl: undefined,
      production: true,
      status: "invalid",
    }),
    null,
  );
});

test("notification email unsubscribe tokens round-trip and reject tampering", () => {
  const secret = "notification-secret";
  const payload = {
    walletAddress: "0x1234567890abcdef1234567890abcdef12345678",
    email: "alice@example.com",
  };

  const token = buildNotificationEmailUnsubscribeToken(payload, secret);
  assert.deepEqual(verifyNotificationEmailUnsubscribeToken(token, secret), payload);
  const tamperedToken = `${token.slice(0, -1)}${token.endsWith("A") ? "B" : "A"}`;
  assert.equal(verifyNotificationEmailUnsubscribeToken(tamperedToken, secret), null);
});

test("buildNotificationEmailUnsubscribeUrl includes the signed token", () => {
  const url = buildNotificationEmailUnsubscribeUrl({
    appUrl: "https://www.curyo.xyz",
    walletAddress: "0x1234567890abcdef1234567890abcdef12345678",
    email: "alice@example.com",
    secret: "notification-secret",
  });

  const parsed = new URL(url);
  assert.equal(parsed.origin + parsed.pathname, "https://www.curyo.xyz/api/notifications/email/unsubscribe");
  const token = parsed.searchParams.get("token");
  assert.ok(token);
  assert.deepEqual(verifyNotificationEmailUnsubscribeToken(token!, "notification-secret"), {
    walletAddress: "0x1234567890abcdef1234567890abcdef12345678",
    email: "alice@example.com",
  });
});
