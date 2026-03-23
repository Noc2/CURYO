import * as schema from "./schema";
import { drizzle as drizzleNodePg } from "drizzle-orm/node-postgres";
import { drizzle as drizzlePgProxy } from "drizzle-orm/pg-proxy";
import * as fs from "node:fs";
import { createRequire } from "node:module";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { Pool, type PoolConfig, type QueryResult, type QueryResultRow } from "pg";
import "server-only";
import { getDatabaseConfig } from "~~/lib/env/server";

type QueryInput = string | { sql: string; args?: unknown[] };

type DatabaseClient = {
  execute: (input: QueryInput) => Promise<QueryResult<QueryResultRow>>;
};

type DatabaseResources = {
  client: DatabaseClient;
  database: ReturnType<typeof drizzleNodePg>;
  pool: Pool;
};

const MIGRATION_BREAKPOINT = "--> statement-breakpoint";
const require = createRequire(import.meta.url);

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

function createMemoryPool(): Pool {
  const migrationDirectory = getMigrationDirectory();
  const { newDb } = require("pg-mem") as typeof import("pg-mem");
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
  return new adapter.Pool() as unknown as Pool;
}

function createPool(config: { url: string }): Pool {
  const poolConfig: PoolConfig = {
    connectionString: config.url,
  };

  return new Pool(poolConfig);
}

function createDatabaseClient(pool: Pool): DatabaseClient {
  return {
    async execute(input) {
      const query = normalizeQuery(input);
      return pool.query(query);
    },
  };
}

function createDatabaseResources(): DatabaseResources {
  const config = getDatabaseConfig();

  if (config.url === "memory:") {
    const pool = createMemoryPool();
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
    ) as unknown as ReturnType<typeof drizzleNodePg>;

    return {
      client,
      database,
      pool,
    };
  }

  const pool = createPool(config);
  const client = createDatabaseClient(pool);
  const database = drizzleNodePg(pool, { schema });

  return {
    client,
    database,
    pool,
  };
}

let resources: DatabaseResources | null = null;

function getDatabaseResources(): DatabaseResources {
  if (!resources) {
    resources = createDatabaseResources();
  }

  return resources;
}

function createLazyProxy<T extends object>(getValue: () => T): T {
  return new Proxy({} as T, {
    get(_target, property) {
      const target = getValue();
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
    has(_target, property) {
      return Reflect.has(getValue(), property);
    },
    ownKeys() {
      return Reflect.ownKeys(getValue());
    },
    getOwnPropertyDescriptor(_target, property) {
      const descriptor = Reflect.getOwnPropertyDescriptor(getValue(), property);
      return descriptor ? { ...descriptor, configurable: true } : undefined;
    },
  });
}

export const db = createLazyProxy(() => getDatabaseResources().database);
export const dbClient = createLazyProxy(() => getDatabaseResources().client);
export const dbPool = createLazyProxy(() => getDatabaseResources().pool);
