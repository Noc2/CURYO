import type { Config } from "drizzle-kit";

const defaultDatabaseUrl = "postgresql://postgres:postgres@127.0.0.1:5432/curyo_app";
const url = process.env.DATABASE_URL?.trim() || defaultDatabaseUrl;

export default {
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url,
  },
} satisfies Config;
