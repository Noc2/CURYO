import { createHmac, timingSafeEqual } from "node:crypto";

export const CALLBACK_SIGNATURE_VERSION = "v1";
export const CALLBACK_ID_HEADER = "x-curyo-callback-id";
export const CALLBACK_TIMESTAMP_HEADER = "x-curyo-callback-timestamp";
export const CALLBACK_SIGNATURE_HEADER = "x-curyo-callback-signature";

export type CallbackSignatureInput = {
  body: string;
  eventId: string;
  secret: string;
  timestamp: string;
};

function assertSecret(secret: string) {
  if (!secret.trim()) {
    throw new Error("Callback secret is required.");
  }
}

function signaturePayload(input: Omit<CallbackSignatureInput, "secret">) {
  return `${CALLBACK_SIGNATURE_VERSION}.${input.eventId}.${input.timestamp}.${input.body}`;
}

export function canonicalJson(value: unknown): string {
  const text = JSON.stringify(sortJsonValue(value));
  if (typeof text !== "string") {
    throw new Error("Callback payload must be JSON-serializable.");
  }
  return text;
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJsonValue);
  }

  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, sortJsonValue(nested)]),
    );
  }

  return value;
}

export function signCallbackPayload(input: CallbackSignatureInput) {
  assertSecret(input.secret);
  const digest = createHmac("sha256", input.secret).update(signaturePayload(input)).digest("hex");

  return `${CALLBACK_SIGNATURE_VERSION}=${digest}`;
}

export function buildCallbackHeaders(input: CallbackSignatureInput): Record<string, string> {
  return {
    "content-type": "application/json",
    [CALLBACK_ID_HEADER]: input.eventId,
    [CALLBACK_TIMESTAMP_HEADER]: input.timestamp,
    [CALLBACK_SIGNATURE_HEADER]: signCallbackPayload(input),
  };
}

export function verifyCallbackSignature(input: CallbackSignatureInput & { signature: string }) {
  const expected = signCallbackPayload(input);
  const actualBuffer = Buffer.from(input.signature);
  const expectedBuffer = Buffer.from(expected);

  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}
