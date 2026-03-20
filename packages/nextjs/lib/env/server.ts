import "server-only";
import { RPC_OVERRIDES } from "~~/config/shared";
import {
  DEFAULT_DEV_TARGET_NETWORKS,
  type SupportedTargetNetwork,
  resolveTargetNetworks,
} from "~~/utils/env/targetNetworks";

const isProduction = process.env.NODE_ENV === "production";

function readEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function isLocalhostHostname(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

export function resolveServerPonderUrl(rawValue: string | undefined, production: boolean): string | null {
  const resolvedValue = rawValue?.trim() || (!production ? "http://localhost:42069" : undefined);

  if (!resolvedValue) {
    return null;
  }

  try {
    const url = new URL(resolvedValue);
    if (production && isLocalhostHostname(url.hostname)) {
      return null;
    }
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

export function getOptionalPonderUrl(): string | null {
  return resolveServerPonderUrl(readEnv("NEXT_PUBLIC_PONDER_URL"), isProduction);
}

export function resolveServerTargetNetworks(
  rawValue: string | undefined,
  production: boolean,
): [SupportedTargetNetwork, ...SupportedTargetNetwork[]] | null {
  try {
    return resolveTargetNetworks(rawValue, {
      production,
      fallback: !production ? DEFAULT_DEV_TARGET_NETWORKS : undefined,
      allowFoundryInProduction: true,
    });
  } catch {
    return null;
  }
}

export function getServerTargetNetworks(): [SupportedTargetNetwork, ...SupportedTargetNetwork[]] | null {
  return resolveServerTargetNetworks(readEnv("NEXT_PUBLIC_TARGET_NETWORKS"), isProduction);
}

export function getPrimaryServerTargetNetwork(): SupportedTargetNetwork | null {
  return getServerTargetNetworks()?.[0] ?? null;
}

export function getServerRpcOverrides(): Partial<Record<number, string>> {
  return RPC_OVERRIDES;
}

export function getDatabaseConfig() {
  const url = readEnv("DATABASE_URL") ?? (!isProduction ? "file:local.db" : undefined);

  if (!url) {
    throw new Error("DATABASE_URL is required in production.");
  }

  return {
    url,
    authToken: readEnv("DATABASE_AUTH_TOKEN"),
  };
}

export function getTmdbApiKey(): string | undefined {
  return readEnv("TMDB_API_KEY");
}

export function getOptionalAppUrl(): string | undefined {
  return readEnv("APP_URL") ?? readEnv("NEXT_PUBLIC_APP_URL") ?? (!isProduction ? "http://localhost:3000" : undefined);
}

export function getResendConfig() {
  return {
    apiKey: readEnv("RESEND_API_KEY"),
    fromEmail: readEnv("RESEND_FROM_EMAIL"),
    appUrl: getOptionalAppUrl(),
  };
}

export function getNotificationDeliverySecret(): string | undefined {
  return readEnv("NOTIFICATION_DELIVERY_SECRET");
}
