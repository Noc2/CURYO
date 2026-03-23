/**
 * Playwright global setup — validates that all required services are running
 * before any test executes.  Fails fast with actionable error messages.
 */

const SERVICES = [
  {
    name: "Anvil (local chain)",
    url: "http://localhost:8545",
    method: "POST" as const,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method: "eth_blockNumber", params: [], id: 1 }),
    hint: "yarn chain",
  },
  {
    name: "Next.js (frontend)",
    url: "http://localhost:3000",
    hint: "yarn start",
  },
  {
    name: "Ponder (indexer)",
    url: "http://localhost:42069/content?limit=1",
    hint: "yarn ponder:dev",
  },
];

const MAX_WAIT_MS = 30_000;
const POLL_INTERVAL_MS = 2_000;

async function checkService(service: (typeof SERVICES)[number]): Promise<void> {
  const start = Date.now();

  while (Date.now() - start < MAX_WAIT_MS) {
    try {
      const res = await fetch(service.url, {
        method: service.method ?? "GET",
        headers: service.headers,
        body: service.body,
        signal: AbortSignal.timeout(5_000),
      });
      if (res.ok) return;
    } catch {
      // Service not ready yet
    }
    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  throw new Error(
    `\n\n  ✗ ${service.name} not responding at ${service.url}\n` + `    Start it with: ${service.hint}\n`,
  );
}

/**
 * Top up the keeper account (Anvil account #1) with ETH.
 * After many test runs the keeper exhausts its gas budget for settlements.
 * anvil_setBalance is a local-only Anvil cheat code — safe and instant.
 */
async function topUpKeeperBalance(): Promise<void> {
  // Keeper = Anvil account #1 (0x70997970C51812dc3A010C7d01b50e0d17dc79C8)
  const KEEPER_ADDRESS = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
  // 10,000 ETH in hex (0x21E19E0C9BAB2400000)
  const BALANCE_HEX = "0x21E19E0C9BAB2400000";

  try {
    const res = await fetch("http://localhost:8545", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "anvil_setBalance",
        params: [KEEPER_ADDRESS, BALANCE_HEX],
        id: 1,
      }),
      signal: AbortSignal.timeout(5_000),
    });
    const json = await res.json();
    if (!json.error) {
      console.log("  ✓ Keeper (account #1) balance topped up to 10,000 ETH");
    }
  } catch {
    // Non-fatal — keeper may still have enough balance
  }
}

/**
 * Ensure the Next.js Postgres database schema is up to date.
 * Runs `drizzle-kit push` which creates any missing tables.
 * This is idempotent — safe to run on every test start.
 */
async function ensureDatabaseSchema(): Promise<void> {
  const { execSync } = await import("child_process");
  try {
    execSync("npx drizzle-kit push", {
      cwd: `${process.cwd()}`,
      stdio: "pipe",
      timeout: 15_000,
    });
    console.log("  ✓ Postgres database schema up to date");
  } catch (err: any) {
    console.warn("  ⚠ drizzle-kit push failed:", err.stderr?.toString().trim() || err.message);
  }
}

async function globalSetup() {
  console.log("\n  Checking E2E infrastructure...");

  const results = await Promise.allSettled(SERVICES.map(checkService));

  const failures = results
    .filter((r): r is PromiseRejectedResult => r.status === "rejected")
    .map(r => r.reason.message);

  if (failures.length > 0) {
    throw new Error(
      `E2E infrastructure not ready:\n${failures.join("\n")}\n\n` +
        "  Quick start:\n" +
        "    Terminal 1: yarn chain\n" +
        "    Terminal 2: yarn deploy\n" +
        "    Terminal 3: yarn dev:stack\n\n" +
        "  Or start services manually:\n" +
        "    Terminal 1: yarn chain\n" +
        "    Terminal 2: yarn deploy  (once chain is up)\n" +
        "    Terminal 3: yarn ponder:dev\n" +
        "    Terminal 4: yarn start\n",
    );
  }

  // Ensure the app database schema exists for API routes that use server-side persistence.
  await ensureDatabaseSchema();

  // Top up keeper balance to prevent gas exhaustion during settlements
  await topUpKeeperBalance();

  // Keeper health check. The dedicated keeper-backed settlement project
  // requires a live keeper process with metrics enabled.
  try {
    const keeperRes = await fetch("http://localhost:9090/health", { signal: AbortSignal.timeout(3_000) });
    if (keeperRes.ok) {
      console.log("  ✓ Keeper (settlement service) running with metrics");
    } else {
      if (process.env.REQUIRE_E2E_KEEPER === "1") {
        throw new Error("Keeper health check returned non-OK");
      }
      console.warn("  ⚠ Keeper health check returned non-OK — keeper-backed settlement tests may fail");
    }
  } catch {
    if (process.env.REQUIRE_E2E_KEEPER === "1") {
      throw new Error(
        "E2E keeper-backed settlement tests require a running keeper at http://localhost:9090/health.\n" +
          "  Start it with: yarn keeper:dev\n",
      );
    }
    console.log("  ⓘ Keeper health endpoint not available — start with: yarn keeper:dev");
  }

  console.log("  ✓ All services ready\n");
}

export default globalSetup;
