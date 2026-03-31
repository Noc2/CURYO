const isProduction = process.env.NODE_ENV === "production";

function readEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function normalizeDatabaseUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
      return rawUrl;
    }

    parsed.searchParams.delete("uselibpqcompat");
    return parsed.toString();
  } catch {
    return rawUrl;
  }
}

export function getDatabaseConfig() {
  const rawUrl = readEnv("DATABASE_URL");
  const url = rawUrl ? normalizeDatabaseUrl(rawUrl) : !isProduction ? "file:local.db" : undefined;

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
