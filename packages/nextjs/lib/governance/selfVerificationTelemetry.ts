import { isAddress } from "viem";

export const SELF_QRCODE_SDK_VERSION = "1.0.22";

export const SELF_VERIFICATION_TELEMETRY_EVENTS = [
  "self_flow_loaded",
  "wrong_chain_detected",
  "wallet_switch_started",
  "wallet_chain_ready",
  "claim_authorization_started",
  "claim_authorization_failed",
  "claim_authorization_signed",
  "self_qr_created",
  "self_verification_failed",
  "self_verification_succeeded",
  "self_claim_poll_started",
  "self_claim_poll_timeout",
  "self_claim_detected",
] as const;

export type SelfVerificationTelemetryEvent = (typeof SELF_VERIFICATION_TELEMETRY_EVENTS)[number];

export type SanitizedSelfVerificationTelemetry = {
  attemptId: string | null;
  contractAddress: string | null;
  elapsedMs: number | null;
  endpointType: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  errorName: string | null;
  errorReason: string | null;
  errorStatus: string | null;
  event: SelfVerificationTelemetryEvent;
  faucetClaimStatus: string | null;
  isMobile: boolean | null;
  requiredChainId: number | null;
  sdkVersion: string | null;
  walletAddress: string | null;
  walletChainId: number | null;
  walletId: string | null;
  walletName: string | null;
};

const MAX_TEXT_LENGTH = 220;
const MAX_ATTEMPT_ID_LENGTH = 96;
const VALID_EVENTS = new Set<string>(SELF_VERIFICATION_TELEMETRY_EVENTS);

function sanitizeText(value: unknown, maxLength = MAX_TEXT_LENGTH): string | null {
  if (typeof value !== "string" && typeof value !== "number") {
    return null;
  }

  const trimmed = String(value).trim();
  if (!trimmed) {
    return null;
  }

  return trimmed.slice(0, maxLength);
}

function sanitizeNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    return null;
  }

  return value;
}

function sanitizeBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function sanitizeAddress(value: unknown): string | null {
  const text = sanitizeText(value, 64);
  if (!text || !isAddress(text)) {
    return null;
  }

  return text.toLowerCase();
}

export function sanitizeSelfVerificationTelemetry(input: unknown): SanitizedSelfVerificationTelemetry | null {
  if (!input || typeof input !== "object") {
    return null;
  }

  const payload = input as Record<string, unknown>;
  const event = sanitizeText(payload.event, 64);
  if (!event || !VALID_EVENTS.has(event)) {
    return null;
  }

  return {
    attemptId: sanitizeText(payload.attemptId, MAX_ATTEMPT_ID_LENGTH),
    contractAddress: sanitizeAddress(payload.contractAddress),
    elapsedMs: sanitizeNumber(payload.elapsedMs),
    endpointType: sanitizeText(payload.endpointType, 32),
    errorCode: sanitizeText(payload.errorCode),
    errorMessage: sanitizeText(payload.errorMessage),
    errorName: sanitizeText(payload.errorName, 80),
    errorReason: sanitizeText(payload.errorReason),
    errorStatus: sanitizeText(payload.errorStatus, 80),
    event: event as SelfVerificationTelemetryEvent,
    faucetClaimStatus: sanitizeText(payload.faucetClaimStatus, 80),
    isMobile: sanitizeBoolean(payload.isMobile),
    requiredChainId: sanitizeNumber(payload.requiredChainId),
    sdkVersion: sanitizeText(payload.sdkVersion, 32),
    walletAddress: sanitizeAddress(payload.walletAddress),
    walletChainId: sanitizeNumber(payload.walletChainId),
    walletId: sanitizeText(payload.walletId, 80),
    walletName: sanitizeText(payload.walletName, 80),
  };
}

export function extractSelfVerificationErrorTelemetry(error: unknown) {
  if (!error || typeof error !== "object") {
    return {
      errorCode: null,
      errorMessage: sanitizeText(error),
      errorName: null,
      errorReason: null,
      errorStatus: null,
    };
  }

  const candidate = error as {
    code?: unknown;
    error_code?: unknown;
    message?: unknown;
    name?: unknown;
    reason?: unknown;
    shortMessage?: unknown;
    status?: unknown;
  };

  return {
    errorCode: sanitizeText(candidate.error_code ?? candidate.code, 80),
    errorMessage: sanitizeText(candidate.message ?? candidate.shortMessage),
    errorName: sanitizeText(candidate.name, 80),
    errorReason: sanitizeText(candidate.reason),
    errorStatus: sanitizeText(candidate.status, 80),
  };
}

export function sendSelfVerificationTelemetry(payload: Record<string, unknown>) {
  if (typeof window === "undefined") {
    return;
  }

  const body = JSON.stringify(payload);
  const url = "/api/governance/self-verification/telemetry";

  if (navigator.sendBeacon) {
    const blob = new Blob([body], { type: "application/json" });
    if (navigator.sendBeacon(url, blob)) {
      return;
    }
  }

  void fetch(url, {
    body,
    headers: { "content-type": "application/json" },
    keepalive: true,
    method: "POST",
  }).catch(() => undefined);
}
