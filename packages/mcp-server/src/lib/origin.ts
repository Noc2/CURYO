import type { IncomingMessage } from "node:http";

export function normalizeOrigin(value: string, label = "Origin"): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${label} must not be empty`);
  }

  if (trimmed === "*") {
    throw new Error(`${label} must not be "*"`);
  }

  const parsed = new URL(trimmed);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`${label} must use http or https`);
  }

  return parsed.origin;
}

export function extractRequestOrigin(request: IncomingMessage): string | null {
  const header = request.headers.origin;
  if (!header) {
    return null;
  }

  const value = Array.isArray(header) ? header[0] : header;
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function isOriginAllowed(origin: string, allowedOrigins: readonly string[]): boolean {
  return allowedOrigins.includes(origin);
}
