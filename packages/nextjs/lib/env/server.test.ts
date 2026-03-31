import { getDatabaseConfig } from "./server";
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

const env = process.env as Record<string, string | undefined>;
const originalDatabaseUrl = env.DATABASE_URL;
const originalDatabaseAuthToken = env.DATABASE_AUTH_TOKEN;

afterEach(() => {
  if (originalDatabaseUrl === undefined) {
    delete env.DATABASE_URL;
  } else {
    env.DATABASE_URL = originalDatabaseUrl;
  }

  if (originalDatabaseAuthToken === undefined) {
    delete env.DATABASE_AUTH_TOKEN;
  } else {
    env.DATABASE_AUTH_TOKEN = originalDatabaseAuthToken;
  }
});

test("getDatabaseConfig strips the unsupported libpq compat flag from postgres urls", () => {
  env.DATABASE_URL = "postgresql://alice:secret@db.example.com:5432/curyo_app?uselibpqcompat=true&sslmode=require";
  env.DATABASE_AUTH_TOKEN = "db-token";

  assert.deepEqual(getDatabaseConfig(), {
    url: "postgresql://alice:secret@db.example.com:5432/curyo_app?sslmode=require",
    authToken: "db-token",
  });
});

test("getDatabaseConfig preserves database urls that do not use the unsupported flag", () => {
  env.DATABASE_URL = "file:local.db";

  assert.deepEqual(getDatabaseConfig(), {
    url: "file:local.db",
    authToken: undefined,
  });
});
