import { getDatabaseConfig, resolveAppUrl, resolveServerPonderUrl, resolveServerTargetNetworks } from "./server";
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

const env = process.env as Record<string, string | undefined>;
const originalDatabaseUrl = env.DATABASE_URL;

afterEach(() => {
  if (originalDatabaseUrl === undefined) {
    delete env.DATABASE_URL;
  } else {
    env.DATABASE_URL = originalDatabaseUrl;
  }
});

test("resolveAppUrl keeps the local default outside production", () => {
  assert.equal(resolveAppUrl(undefined, false), "http://localhost:3000");
});

test("resolveAppUrl rejects localhost in production", () => {
  assert.equal(resolveAppUrl("http://localhost:3000", true), null);
});

test("resolveAppUrl normalizes valid public app URLs", () => {
  assert.equal(resolveAppUrl("https://curyo.xyz/", true), "https://curyo.xyz");
});

test("resolveServerPonderUrl keeps the local default outside production", () => {
  assert.equal(resolveServerPonderUrl(undefined, false), "http://localhost:42069");
});

test("resolveServerPonderUrl treats localhost production URLs as unavailable", () => {
  assert.equal(resolveServerPonderUrl("http://localhost:42069", true), null);
});

test("resolveServerTargetNetworks tolerates local-chain builds in production mode", () => {
  const networks = resolveServerTargetNetworks("31337,11142220", true);
  assert.deepEqual(
    networks?.map(network => network.id),
    [31337, 11142220],
  );
});

test("resolveServerTargetNetworks returns null for invalid production values", () => {
  assert.equal(resolveServerTargetNetworks("not-a-chain", true), null);
});

test("getDatabaseConfig maps legacy sqlite-style local urls to memory in development", () => {
  env.DATABASE_URL = "file:local.db";
  assert.deepEqual(getDatabaseConfig(), { url: "memory:" });
});

test("getDatabaseConfig preserves explicit postgres urls", () => {
  env.DATABASE_URL = "postgresql://alice:secret@127.0.0.1:5432/curyo_app";
  assert.deepEqual(getDatabaseConfig(), {
    url: "postgresql://alice:secret@127.0.0.1:5432/curyo_app",
  });
});

test("getDatabaseConfig upgrades legacy sslmode values to verify-full", () => {
  env.DATABASE_URL = "postgresql://alice:secret@db.example.com:5432/curyo_app?sslmode=require&pool_max=1";
  assert.deepEqual(getDatabaseConfig(), {
    url: "postgresql://alice:secret@db.example.com:5432/curyo_app?sslmode=verify-full&pool_max=1",
  });
});

test("getDatabaseConfig preserves libpq-compatible sslmode urls", () => {
  env.DATABASE_URL = "postgresql://alice:secret@db.example.com:5432/curyo_app?uselibpqcompat=true&sslmode=require";
  assert.deepEqual(getDatabaseConfig(), {
    url: "postgresql://alice:secret@db.example.com:5432/curyo_app?uselibpqcompat=true&sslmode=require",
  });
});
