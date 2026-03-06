import type { Config } from "drizzle-kit";
import { getDatabaseConfig } from "./lib/env/server";

export default {
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: getDatabaseConfig(),
} satisfies Config;
