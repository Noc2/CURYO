import * as schema from "./schema";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import "server-only";
import { getDatabaseConfig } from "~~/lib/env/server";

function createDatabaseResources() {
  const client = createClient(getDatabaseConfig());
  const database = drizzle(client, { schema });

  return {
    client,
    database,
  };
}

type DatabaseResources = ReturnType<typeof createDatabaseResources>;

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
