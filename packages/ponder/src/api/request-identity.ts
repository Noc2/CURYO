import { createHash } from "node:crypto";

const FORWARDED_FOR_HEADER = "x-forwarded-for";
const FORWARDED_HEADER = "forwarded";
const REAL_IP_HEADER = "x-real-ip";
const FALLBACK_FINGERPRINT_HEADERS = ["user-agent", "accept-language", "accept", "origin", "referer"] as const;

let warnedMissingHeaders = false;

function parseTrustedRateLimitHeaders(configuredValue = process.env.RATE_LIMIT_TRUSTED_IP_HEADERS): string[] {
  return (configuredValue ?? "")
    .split(",")
    .map(header => header.trim().toLowerCase())
    .filter(Boolean);
}

function getTrustedRateLimitHeaders(configuredValue = process.env.RATE_LIMIT_TRUSTED_IP_HEADERS): string[] {
  const headers = parseTrustedRateLimitHeaders(configuredValue);

  if (headers.length === 0 && !warnedMissingHeaders) {
    warnedMissingHeaders = true;
    console.warn(
      "[ponder] RATE_LIMIT_TRUSTED_IP_HEADERS is not set — rate limiting will fall back to request fingerprinting. " +
      "Set this to your reverse proxy's IP header (e.g. x-forwarded-for) in production.",
    );
  }

  return headers;
}

export function hasTrustedRateLimitHeadersConfigured(configuredValue = process.env.RATE_LIMIT_TRUSTED_IP_HEADERS): boolean {
  return parseTrustedRateLimitHeaders(configuredValue).length > 0;
}

function parseForwardedIp(value: string): string | null {
  const match = value.match(/for=(?:"?\[?)([^;\],"]+)/i);
  return match?.[1]?.trim() || null;
}

function extractIpFromHeader(headerName: string, value: string | null | undefined): string | null {
  if (!value?.trim()) return null;

  if (headerName === FORWARDED_HEADER) {
    return parseForwardedIp(value);
  }

  return (
    value
      .split(",")
      .map(part => part.trim())
      .find(Boolean) || null
  );
}

function buildFingerprint(getHeader: (name: string) => string | undefined, requestUrl?: string): string {
  const parts = FALLBACK_FINGERPRINT_HEADERS.map(header => getHeader(header)?.trim() ?? "");
  const fallback = parts.some(Boolean) ? parts.join("\n") : requestUrl ?? "unknown";
  return `fingerprint:${createHash("sha256").update(fallback).digest("hex")}`;
}

export function resolveRateLimitIdentifier(
  getHeader: (name: string) => string | undefined,
  options: { nodeEnv?: string; requestUrl?: string } = {},
): string {
  const nodeEnv = options.nodeEnv ?? process.env.NODE_ENV;
  const trustedHeaders =
    nodeEnv === "development" ? [REAL_IP_HEADER, FORWARDED_FOR_HEADER, FORWARDED_HEADER] : getTrustedRateLimitHeaders();

  for (const headerName of trustedHeaders) {
    const ip = extractIpFromHeader(headerName, getHeader(headerName));
    if (ip) {
      return `ip:${ip}`;
    }
  }

  return buildFingerprint(getHeader, options.requestUrl);
}

export function isLoopbackRateLimitIdentifier(identifier: string): boolean {
  return (
    identifier === "ip:127.0.0.1"
    || identifier === "ip:::1"
    || identifier === "ip:localhost"
    || identifier === "ip:[::1]"
  );
}
