import { resolveAppUrl } from "../env/server";
import { createHmac, timingSafeEqual } from "crypto";

interface ResolveNotificationEmailAppUrlOptions {
  requestOrigin?: string | null;
  fallbackAppUrl?: string | null;
  production?: boolean;
}

export function resolveNotificationEmailAppUrl(options: ResolveNotificationEmailAppUrlOptions) {
  const production = options.production ?? process.env.NODE_ENV === "production";
  const requestAppUrl = resolveAppUrl(options.requestOrigin ?? undefined, production);
  if (requestAppUrl) {
    return requestAppUrl;
  }

  return resolveAppUrl(options.fallbackAppUrl ?? undefined, production);
}

interface NotificationEmailUnsubscribePayload {
  walletAddress: string;
  email: string;
}

function signNotificationEmailUnsubscribePayload(encodedPayload: string, secret: string) {
  return createHmac("sha256", secret).update(`notification-email-unsubscribe:${encodedPayload}`).digest("base64url");
}

function constantTimeEquals(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function isValidNotificationEmailUnsubscribePayload(payload: unknown): payload is NotificationEmailUnsubscribePayload {
  if (!payload || typeof payload !== "object") {
    return false;
  }

  const candidate = payload as Record<string, unknown>;
  return (
    typeof candidate.walletAddress === "string" &&
    /^0x[a-fA-F0-9]{40}$/.test(candidate.walletAddress) &&
    typeof candidate.email === "string" &&
    candidate.email.length > 0
  );
}

export function buildNotificationEmailUnsubscribeToken(payload: NotificationEmailUnsubscribePayload, secret: string) {
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = signNotificationEmailUnsubscribePayload(encodedPayload, secret);
  return `${encodedPayload}.${signature}`;
}

export function verifyNotificationEmailUnsubscribeToken(token: string, secret: string) {
  const [encodedPayload, providedSignature, ...rest] = token.split(".");
  if (!encodedPayload || !providedSignature || rest.length > 0) {
    return null;
  }

  const expectedSignature = signNotificationEmailUnsubscribePayload(encodedPayload, secret);
  if (!constantTimeEquals(providedSignature, expectedSignature)) {
    return null;
  }

  try {
    const decodedPayload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
    if (!isValidNotificationEmailUnsubscribePayload(decodedPayload)) {
      return null;
    }
    return decodedPayload;
  } catch {
    return null;
  }
}

export function buildNotificationEmailUnsubscribeUrl(args: {
  appUrl: string;
  walletAddress: string;
  email: string;
  secret: string;
}) {
  const url = new URL("/api/notifications/email/unsubscribe", args.appUrl);
  url.searchParams.set(
    "token",
    buildNotificationEmailUnsubscribeToken(
      {
        walletAddress: args.walletAddress,
        email: args.email,
      },
      args.secret,
    ),
  );
  return url.toString();
}
