import * as schema from "./schema";
import { drizzle as drizzleNodePg } from "drizzle-orm/node-postgres";
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
    throw new Error("In-memory database support is only available through test helpers.");
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
let resourcesOverride: DatabaseResources | null = null;

function getDatabaseResources(): DatabaseResources {
  if (resourcesOverride) {
    return resourcesOverride;
  }

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

export function __setDatabaseResourcesForTests(value: DatabaseResources | null) {
  resourcesOverride = value;
}

export type { DatabaseClient, DatabaseResources, QueryInput };
