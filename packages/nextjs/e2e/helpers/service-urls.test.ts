import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { promisify } from "node:util";
import { DEFAULT_E2E_RPC_URL, resolveE2ERpcUrl } from "./service-urls";

const execFileAsync = promisify(execFile);
const nextjsPackageDir = dirname(fileURLToPath(import.meta.url));
const serviceUrlsModuleUrl = new URL("./service-urls.ts", import.meta.url).href;

const SERVICE_URLS_SNAPSHOT_PROGRAM = `
  const serviceUrlsModule = await import(${JSON.stringify(serviceUrlsModuleUrl)});
  const serviceUrls = serviceUrlsModule.default ?? serviceUrlsModule["module.exports"] ?? serviceUrlsModule;
  process.stdout.write(JSON.stringify({
    E2E_BASE_URL: serviceUrls.E2E_BASE_URL,
    E2E_RPC_URL: serviceUrls.E2E_RPC_URL,
    E2E_KEEPER_URL: serviceUrls.E2E_KEEPER_URL,
    E2E_KEEPER_HEALTH_URL: serviceUrls.E2E_KEEPER_HEALTH_URL,
    PONDER_URL: serviceUrls.PONDER_URL,
    DEFAULT_E2E_RPC_URL: serviceUrls.DEFAULT_E2E_RPC_URL,
  }));
`;

function buildSnapshotEnv(overrides: Record<string, string | undefined>) {
  const env = { ...process.env };

  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete env[key];
    } else {
      env[key] = value;
    }
  }

  return env;
}

async function snapshotServiceUrls(overrides: Record<string, string | undefined>) {
  const { stdout } = await execFileAsync(
    process.execPath,
    ["--import", "tsx", "--eval", SERVICE_URLS_SNAPSHOT_PROGRAM],
    {
      cwd: nextjsPackageDir,
      env: buildSnapshotEnv(overrides),
    },
  );

  return JSON.parse(stdout) as {
    E2E_BASE_URL: string;
    E2E_RPC_URL: string;
    E2E_KEEPER_URL: string;
    E2E_KEEPER_HEALTH_URL: string;
    PONDER_URL: string;
    DEFAULT_E2E_RPC_URL: string;
  };
}

test("resolveE2ERpcUrl defaults to the browser-safe local Anvil origin", () => {
  assert.equal(DEFAULT_E2E_RPC_URL, "http://127.0.0.1:8545");
  assert.equal(resolveE2ERpcUrl(undefined), DEFAULT_E2E_RPC_URL);
  assert.equal(resolveE2ERpcUrl(null), DEFAULT_E2E_RPC_URL);
});

test("resolveE2ERpcUrl preserves explicit overrides", () => {
  assert.equal(resolveE2ERpcUrl(" http://localhost:9545 "), "http://localhost:9545");
});

test("service URL helpers fall back to the local stack defaults", async () => {
  const serviceUrls = await snapshotServiceUrls({
    E2E_BASE_URL: undefined,
    E2E_RPC_URL: undefined,
    E2E_KEEPER_URL: undefined,
    NEXT_PUBLIC_PONDER_URL: undefined,
  });

  assert.equal(serviceUrls.E2E_BASE_URL, "http://localhost:3000");
  assert.equal(serviceUrls.E2E_RPC_URL, DEFAULT_E2E_RPC_URL);
  assert.equal(serviceUrls.E2E_KEEPER_URL, "http://localhost:9090");
  assert.equal(serviceUrls.E2E_KEEPER_HEALTH_URL, "http://localhost:9090/health");
  assert.equal(serviceUrls.PONDER_URL, "http://localhost:42069");
});

test("service URL helpers honor trimmed custom endpoints", async () => {
  const serviceUrls = await snapshotServiceUrls({
    E2E_BASE_URL: " https://frontend.example.test/app/ ",
    E2E_RPC_URL: " https://rpc.example.test ",
    E2E_KEEPER_URL: " https://keeper.example.test/internal/ ",
    NEXT_PUBLIC_PONDER_URL: " https://ponder.example.test/api/ ",
  });

  assert.equal(serviceUrls.E2E_BASE_URL, "https://frontend.example.test/app/");
  assert.equal(serviceUrls.E2E_RPC_URL, "https://rpc.example.test");
  assert.equal(serviceUrls.E2E_KEEPER_URL, "https://keeper.example.test/internal/");
  assert.equal(serviceUrls.E2E_KEEPER_HEALTH_URL, "https://keeper.example.test/health");
  assert.equal(serviceUrls.PONDER_URL, "https://ponder.example.test/api/");
});
