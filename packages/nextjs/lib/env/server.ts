const isProduction = process.env.NODE_ENV === "production";

function readEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
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
  return readEnv("TMDB_API_KEY") ?? readEnv("NEXT_PUBLIC_TMDB_API_KEY");
}
