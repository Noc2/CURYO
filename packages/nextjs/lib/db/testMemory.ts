import type { DatabaseClient, DatabaseResources, QueryInput } from "./index";
import * as schema from "./schema";
import { drizzle as drizzlePgProxy } from "drizzle-orm/pg-proxy";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { type Pool } from "pg";
import { newDb } from "pg-mem";

const MIGRATION_BREAKPOINT = "--> statement-breakpoint";

function normalizeQuery(input: QueryInput) {
  const text = typeof input === "string" ? input : input.sql;
  const values = typeof input === "string" ? [] : (input.args ?? []);

  let placeholderIndex = 0;
  const parameterizedText = values.length > 0 ? text.replace(/\?/g, () => `$${++placeholderIndex}`) : text;

  return {
    text: parameterizedText,
    values,
  };
}

function getMigrationDirectory() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../drizzle");
}

function applySqlStatements(sqlText: string, execute: (statement: string) => void) {
  for (const statement of sqlText
    .split(MIGRATION_BREAKPOINT)
    .map(part => part.trim())
    .filter(Boolean)) {
    execute(statement);
  }
}

function createDatabaseClient(pool: Pool): DatabaseClient {
  return {
    async execute(input) {
      const query = normalizeQuery(input);
      return pool.query(query);
    },
  };
}

export function createMemoryDatabaseResources(): DatabaseResources {
  const migrationDirectory = getMigrationDirectory();
  const memoryDb = newDb();

  if (fs.existsSync(migrationDirectory)) {
    const files = fs
      .readdirSync(migrationDirectory)
      .filter(file => file.endsWith(".sql"))
      .sort((a, b) => a.localeCompare(b));

    for (const file of files) {
      const sqlText = fs.readFileSync(path.join(migrationDirectory, file), "utf8");
      applySqlStatements(sqlText, statement => {
        memoryDb.public.none(statement);
      });
    }
  }

  const adapter = memoryDb.adapters.createPg();
  const pool = new adapter.Pool() as unknown as Pool;
  const client = createDatabaseClient(pool);
  const database = drizzlePgProxy(
    async (query, params) => {
      const result = await pool.query({
        text: query,
        values: params,
      });

      return {
        rows: result.rows,
      };
    },
    { schema },
  ) as unknown as DatabaseResources["database"];

  return {
    client,
    database,
    pool,
  };
}
