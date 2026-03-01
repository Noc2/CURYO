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

  // Top up keeper balance to prevent gas exhaustion during settlements
  await topUpKeeperBalance();

  console.log("  ✓ All services ready\n");
}

export default globalSetup;
