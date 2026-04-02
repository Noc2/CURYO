import "server-only";
import { RPC_OVERRIDES } from "~~/config/shared";
import { isLocalE2EProductionBuildEnabled } from "~~/utils/env/e2eProduction";
import {
  DEFAULT_DEV_TARGET_NETWORKS,
  type SupportedTargetNetwork,
  resolveTargetNetworks,
} from "~~/utils/env/targetNetworks";
import { mergeRpcOverrides, resolveRpcOverrides } from "~~/utils/rpcUrls";

const isProduction = process.env.NODE_ENV === "production";
const defaultDevDatabaseUrl = "postgresql://postgres:postgres@127.0.0.1:5432/curyo_app";
const allowLocalE2EProductionBuild = isLocalE2EProductionBuildEnabled();

function readEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function isLocalhostHostname(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function normalizeDatabaseUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
      return rawUrl;
    }

    const useLibpqCompat = parsed.searchParams.get("uselibpqcompat");
    if (useLibpqCompat === "true") {
      return rawUrl;
    }

    parsed.searchParams.delete("uselibpqcompat");

    const sslMode = parsed.searchParams.get("sslmode");
    if (sslMode === "prefer" || sslMode === "require" || sslMode === "verify-ca") {
      parsed.searchParams.set("sslmode", "verify-full");
      return parsed.toString();
    }

    return parsed.toString();
  } catch {
    return rawUrl;
  }
}

export function resolveAppUrl(
  rawValue: string | undefined,
  production: boolean,
  allowLocalhostInProduction = false,
): string | null {
  const resolvedValue = rawValue?.trim() || (!production ? "http://localhost:3000" : undefined);

  if (!resolvedValue) {
    return null;
  }

  try {
    const url = new URL(resolvedValue);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    if (production && !allowLocalhostInProduction && isLocalhostHostname(url.hostname)) {
      return null;
    }
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

export function resolveServerPonderUrl(
  rawValue: string | undefined,
  production: boolean,
  allowLocalhostInProduction = false,
): string | null {
  const resolvedValue = rawValue?.trim() || (!production ? "http://localhost:42069" : undefined);

  if (!resolvedValue) {
    return null;
  }

  try {
    const url = new URL(resolvedValue);
    if (production && !allowLocalhostInProduction && isLocalhostHostname(url.hostname)) {
      return null;
    }
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

export function getOptionalPonderUrl(): string | null {
  return resolveServerPonderUrl(readEnv("NEXT_PUBLIC_PONDER_URL"), isProduction, allowLocalE2EProductionBuild);
}

export function resolveServerTargetNetworks(
  rawValue: string | undefined,
  production: boolean,
  options?: { allowFoundryInProduction?: boolean },
): [SupportedTargetNetwork, ...SupportedTargetNetwork[]] | null {
  try {
    const rpcOverrides = mergeRpcOverrides(
      RPC_OVERRIDES,
      resolveRpcOverrides({
        31337: readEnv("NEXT_PUBLIC_RPC_URL_31337"),
        11142220: readEnv("NEXT_PUBLIC_RPC_URL_11142220"),
        42220: readEnv("NEXT_PUBLIC_RPC_URL_42220"),
      }),
    );

    return resolveTargetNetworks(rawValue, {
      alchemyApiKey: readEnv("NEXT_PUBLIC_ALCHEMY_API_KEY"),
      production,
      fallback: !production ? DEFAULT_DEV_TARGET_NETWORKS : undefined,
      allowFoundryInProduction: options?.allowFoundryInProduction ?? allowLocalE2EProductionBuild,
      rpcOverrides,
    });
  } catch {
    return null;
  }
}

function getServerTargetNetworks(): [SupportedTargetNetwork, ...SupportedTargetNetwork[]] | null {
  return resolveServerTargetNetworks(readEnv("NEXT_PUBLIC_TARGET_NETWORKS"), isProduction);
}

export function getPrimaryServerTargetNetwork(): SupportedTargetNetwork | null {
  return getServerTargetNetworks()?.[0] ?? null;
}

export function getServerTargetNetworkById(chainId: number): SupportedTargetNetwork | null {
  return getServerTargetNetworks()?.find(network => network.id === chainId) ?? null;
}

export function getServerRpcOverrides(): Partial<Record<number, string>> {
  return mergeRpcOverrides(
    RPC_OVERRIDES,
    resolveRpcOverrides({
      31337: readEnv("NEXT_PUBLIC_RPC_URL_31337"),
      11142220: readEnv("NEXT_PUBLIC_RPC_URL_11142220"),
      42220: readEnv("NEXT_PUBLIC_RPC_URL_42220"),
    }),
  );
}

export function getDatabaseConfig() {
  const rawDatabaseUrl = readEnv("DATABASE_URL");
  const usesLegacyLocalDatabaseUrl =
    rawDatabaseUrl === "file:local.db" ||
    rawDatabaseUrl?.startsWith("file:") === true ||
    rawDatabaseUrl?.startsWith("sqlite:") === true;
  const url = rawDatabaseUrl
    ? usesLegacyLocalDatabaseUrl
      ? !isProduction
        ? "memory:"
        : undefined
      : normalizeDatabaseUrl(rawDatabaseUrl)
    : !isProduction
      ? defaultDevDatabaseUrl
      : undefined;

  if (!url) {
    throw new Error("DATABASE_URL is required in production.");
  }

  return {
    url,
  };
}

export function getTmdbApiKey(): string | undefined {
  return readEnv("TMDB_API_KEY");
}

export function getOptionalAppUrl(): string | undefined {
  return (
    resolveAppUrl(readEnv("APP_URL") ?? readEnv("NEXT_PUBLIC_APP_URL"), isProduction, allowLocalE2EProductionBuild) ??
    undefined
  );
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

export function getThirdwebClientId(): string | undefined {
  return readEnv("NEXT_PUBLIC_THIRDWEB_CLIENT_ID");
}

export function getThirdwebServerVerifierSecret(): string | undefined {
  return readEnv("THIRDWEB_SERVER_VERIFIER_SECRET");
}

export function getFreeTransactionLimit(): number {
  const rawValue = readEnv("FREE_TRANSACTION_LIMIT");
  const parsedValue = rawValue ? Number.parseInt(rawValue, 10) : Number.NaN;

  if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
    return 25;
  }

  return parsedValue;
}

export function getServerEnvironmentScope(): string {
  return (
    readEnv("APP_ENV") ??
    readEnv("VERCEL_ENV") ??
    readEnv("RAILWAY_ENVIRONMENT_NAME") ??
    process.env.NODE_ENV ??
    "development"
  );
}
