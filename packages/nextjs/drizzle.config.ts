import { getDatabaseConfig } from "./lib/env/server";
import type { Config } from "drizzle-kit";

export default {
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: getDatabaseConfig(),
} satisfies Config;
