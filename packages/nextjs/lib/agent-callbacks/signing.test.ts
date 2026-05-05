import {
  CALLBACK_ID_HEADER,
  CALLBACK_SIGNATURE_HEADER,
  CALLBACK_TIMESTAMP_HEADER,
  buildCallbackHeaders,
  canonicalJson,
  signCallbackPayload,
  verifyCallbackSignature,
} from "./signing";
import assert from "node:assert/strict";
import { test } from "node:test";

test("canonicalJson sorts object keys recursively", () => {
  assert.equal(canonicalJson({ z: 1, a: { c: 3, b: 2 } }), '{"a":{"b":2,"c":3},"z":1}');
});

test("signCallbackPayload signs the event id, timestamp, and body", () => {
  const input = {
    body: '{"ok":true}',
    eventId: "event-1",
    secret: "secret-a",
    timestamp: "2026-04-23T12:00:00.000Z",
  };
  const signature = signCallbackPayload(input);

  assert.match(signature, /^v1=[a-f0-9]{64}$/);
  assert.equal(verifyCallbackSignature({ ...input, signature }), true);
  assert.equal(verifyCallbackSignature({ ...input, body: '{"ok":false}', signature }), false);
});

test("buildCallbackHeaders returns stable HMAC metadata headers", () => {
  const headers = buildCallbackHeaders({
    body: "{}",
    eventId: "event-2",
    secret: "secret-b",
    timestamp: "2026-04-23T12:00:00.000Z",
  });

  assert.equal(headers[CALLBACK_ID_HEADER], "event-2");
  assert.equal(headers[CALLBACK_TIMESTAMP_HEADER], "2026-04-23T12:00:00.000Z");
  assert.match(headers[CALLBACK_SIGNATURE_HEADER], /^v1=[a-f0-9]{64}$/);
});
