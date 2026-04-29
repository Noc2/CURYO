import type { Config } from "drizzle-kit";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const defaultDatabaseUrl = "postgresql://postgres:postgres@127.0.0.1:5432/curyo_app";
const currentFile = fileURLToPath(import.meta.url);
const projectDir = path.dirname(currentFile);

function stripMatchingQuotes(value: string) {
  if (
    value.length >= 2 &&
    ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function readEnvFileDatabaseUrl(filePath: string): string | undefined {
  if (!existsSync(filePath)) return undefined;

  for (const rawLine of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) continue;

    const key = line
      .slice(0, separatorIndex)
      .trim()
      .replace(/^export\s+/, "");
    if (key !== "DATABASE_URL") continue;

    const value = stripMatchingQuotes(line.slice(separatorIndex + 1).trim()).trim();
    return value || undefined;
  }

  return undefined;
}

const rawDatabaseUrl = process.env.DATABASE_URL?.trim() ?? readEnvFileDatabaseUrl(path.join(projectDir, ".env.local"));
const url = rawDatabaseUrl || defaultDatabaseUrl;

export default {
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url,
  },
} satisfies Config;
