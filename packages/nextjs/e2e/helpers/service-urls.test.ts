import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

const env = process.env as Record<string, string | undefined>;
const originalBaseUrl = env.E2E_BASE_URL;
const originalRpcUrl = env.E2E_RPC_URL;
const originalKeeperUrl = env.E2E_KEEPER_URL;
const originalPonderUrl = env.NEXT_PUBLIC_PONDER_URL;

async function importServiceUrls(cacheKey: string) {
  return import(new URL(`./service-urls.ts?${cacheKey}`, import.meta.url).href);
}

afterEach(() => {
  if (originalBaseUrl === undefined) {
    delete env.E2E_BASE_URL;
  } else {
    env.E2E_BASE_URL = originalBaseUrl;
  }

  if (originalRpcUrl === undefined) {
    delete env.E2E_RPC_URL;
  } else {
    env.E2E_RPC_URL = originalRpcUrl;
  }

  if (originalKeeperUrl === undefined) {
    delete env.E2E_KEEPER_URL;
  } else {
    env.E2E_KEEPER_URL = originalKeeperUrl;
  }

  if (originalPonderUrl === undefined) {
    delete env.NEXT_PUBLIC_PONDER_URL;
  } else {
    env.NEXT_PUBLIC_PONDER_URL = originalPonderUrl;
  }
});

test("service URL helpers fall back to the local stack defaults", async () => {
  delete env.E2E_BASE_URL;
  delete env.E2E_RPC_URL;
  delete env.E2E_KEEPER_URL;
  delete env.NEXT_PUBLIC_PONDER_URL;

  const serviceUrls = await importServiceUrls("defaults");

  assert.equal(serviceUrls.E2E_BASE_URL, "http://localhost:3000");
  assert.equal(serviceUrls.E2E_RPC_URL, "http://localhost:8545");
  assert.equal(serviceUrls.E2E_KEEPER_URL, "http://localhost:9090");
  assert.equal(serviceUrls.E2E_KEEPER_HEALTH_URL, "http://localhost:9090/health");
  assert.equal(serviceUrls.PONDER_URL, "http://localhost:42069");
});

test("service URL helpers honor trimmed custom endpoints", async () => {
  env.E2E_BASE_URL = " https://frontend.example.test/app/ ";
  env.E2E_RPC_URL = " https://rpc.example.test ";
  env.E2E_KEEPER_URL = " https://keeper.example.test/internal/ ";
  env.NEXT_PUBLIC_PONDER_URL = " https://ponder.example.test/api/ ";

  const serviceUrls = await importServiceUrls("custom");

  assert.equal(serviceUrls.E2E_BASE_URL, "https://frontend.example.test/app/");
  assert.equal(serviceUrls.E2E_RPC_URL, "https://rpc.example.test");
  assert.equal(serviceUrls.E2E_KEEPER_URL, "https://keeper.example.test/internal/");
  assert.equal(serviceUrls.E2E_KEEPER_HEALTH_URL, "https://keeper.example.test/health");
  assert.equal(serviceUrls.PONDER_URL, "https://ponder.example.test/api/");
});
