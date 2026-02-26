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
 * After many test runs the keeper exhausts its gas budget for vote reveals.
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
 * Verify the keeper has a signing key configured.
 * Hits GET /api/keeper which returns { status: "disabled" } when no key is set.
 * Without a key, settlement tests silently skip instead of exercising the full lifecycle.
 */
async function checkKeeperConfigured(): Promise<void> {
  try {
    const res = await fetch("http://localhost:3000/api/keeper", {
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return; // Keeper route returned an error status — non-fatal here

    const data = await res.json();
    if (data.status === "disabled") {
      throw new Error(
        `\n\n  ✗ Keeper is not configured: ${data.reason}\n` +
          `    Set KEEPER_PRIVATE_KEY in .env.local (e.g., Anvil account #1: 0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d)\n` +
          `    Without it, settlement-lifecycle, reward-claim, and tied-round tests will not exercise the full round lifecycle.\n`,
      );
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes("Keeper is not configured")) {
      throw err;
    }
    // Network error or unexpected response — don't block, the service check already passed
  }
}

/**
 * Wait for drand beacons to become available by polling chain age.
 * Tlock decryption requires ~15 min of real wall-clock time after chain start.
 * Blocks until chain age >= 15 min, logging progress every 30s.
 */
async function waitForDrandReadiness(): Promise<void> {
  const ANVIL_RPC = "http://localhost:8545";
  const MIN_AGE_MINUTES = 15;
  const MAX_WAIT_MS = 20 * 60 * 1000; // 20 min max

  async function getChainAgeMinutes(): Promise<number> {
    const res = await fetch(ANVIL_RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "eth_getBlockByNumber",
        params: ["0x1", false],
        id: 1,
      }),
      signal: AbortSignal.timeout(5_000),
    });
    const { result } = await res.json();
    if (!result?.timestamp) return 0;
    const blockTimestamp = parseInt(result.timestamp, 16);
    return (Math.floor(Date.now() / 1000) - blockTimestamp) / 60;
  }

  const age = await getChainAgeMinutes();
  if (age >= MIN_AGE_MINUTES) {
    console.log(`  ✓ Chain is ${age.toFixed(0)} min old — drand beacons available`);
    return;
  }

  const waitMinutes = Math.ceil(MIN_AGE_MINUTES - age);
  console.log(`  ⏳ Chain is ${age.toFixed(1)} min old — waiting ~${waitMinutes} min for drand beacons...`);

  const start = Date.now();
  while (Date.now() - start < MAX_WAIT_MS) {
    await new Promise(resolve => setTimeout(resolve, 30_000));
    const currentAge = await getChainAgeMinutes();
    if (currentAge >= MIN_AGE_MINUTES) {
      console.log(`  ✓ Chain is ${currentAge.toFixed(0)} min old — drand beacons available`);
      return;
    }
    const remaining = Math.ceil(MIN_AGE_MINUTES - currentAge);
    console.log(`  ⏳ Chain is ${currentAge.toFixed(1)} min old (~${remaining} min remaining)`);
  }

  throw new Error(
    "\n\n  ✗ Drand beacons not available after 20 min wait\n" +
      "    Settlement tests require ~15 min of wall-clock time after chain start.\n",
  );
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
        "  Start all services:\n" +
        "    Terminal 1: yarn chain\n" +
        "    Terminal 2: yarn deploy  (once chain is up)\n" +
        "    Terminal 3: yarn ponder:dev\n" +
        "    Terminal 4: yarn start\n",
    );
  }

  // Top up keeper balance to prevent gas exhaustion during vote reveals
  await topUpKeeperBalance();

  // Validate keeper has a signing key (prevents silent test skips)
  await checkKeeperConfigured();

  // Wait for drand beacons — settlement tests need ~15 min chain age
  await waitForDrandReadiness();

  console.log("  ✓ All services ready\n");
}

export default globalSetup;
