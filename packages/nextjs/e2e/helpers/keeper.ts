/**
 * Settlement lifecycle helpers for E2E tests.
 * Uses Anvil JSON-RPC to fast-forward time and the keeper API to trigger reveals/settlements.
 */

const ANVIL_RPC = "http://localhost:8545";

/**
 * Check if drand beacons are likely available based on chain age.
 * Tlock decryption requires real wall-clock time (~15 min after chain start)
 * for drand beacons to become available. Call this in beforeAll to skip early
 * instead of waiting for mid-test retries to fail.
 */
export async function checkDrandReadiness(): Promise<{ ready: boolean; message: string }> {
  try {
    const res = await fetch(ANVIL_RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "eth_getBlockByNumber",
        params: ["0x1", false],
        id: 1,
      }),
    });

    const { result } = await res.json();
    if (!result?.timestamp) {
      return { ready: false, message: "Could not read block #1 timestamp from Anvil" };
    }

    const blockTimestamp = parseInt(result.timestamp, 16);
    const nowSeconds = Math.floor(Date.now() / 1000);
    const chainAgeMinutes = (nowSeconds - blockTimestamp) / 60;

    if (chainAgeMinutes < 15) {
      return {
        ready: false,
        message: `Chain is ${chainAgeMinutes.toFixed(1)} min old (need ~15 min for drand beacons)`,
      };
    }

    return { ready: true, message: `Chain is ${chainAgeMinutes.toFixed(0)} min old` };
  } catch {
    return { ready: false, message: "Could not connect to Anvil at localhost:8545" };
  }
}

/**
 * Fast-forward Anvil's block timestamp by the given number of seconds,
 * then mine a block to make the new timestamp take effect.
 */
export async function fastForwardTime(seconds = 901): Promise<void> {
  // evm_increaseTime advances the clock
  await fetch(ANVIL_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "evm_increaseTime",
      params: [seconds],
      id: 1,
    }),
  });

  // evm_mine forces a new block with the updated timestamp
  await fetch(ANVIL_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "evm_mine",
      params: [],
      id: 2,
    }),
  });
}

export type KeeperResult = {
  configured: boolean;
  votesRevealed: number;
  roundsSettled: number;
  roundsCancelled: number;
  unrevealedProcessed: number;
  contentMarkedDormant: number;
  error?: string;
};

/**
 * Trigger the keeper to reveal votes and settle rounds immediately.
 * Returns the keeper result with counts of actions taken.
 */
export async function triggerKeeper(
  baseURL = "http://localhost:3000",
): Promise<{ success: boolean; result: KeeperResult }> {
  const response = await fetch(`${baseURL}/api/keeper`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });

  if (!response.ok) {
    throw new Error(`Keeper API returned ${response.status}: ${await response.text()}`);
  }

  const data = await response.json();

  // Fail fast if keeper has no signing key — don't let tests interpret
  // 0 reveals as "drand not ready" when the real problem is misconfiguration.
  if (data.result && data.result.configured === false) {
    throw new Error(
      "Keeper is not configured (no KEEPER_PRIVATE_KEY or keystore). " +
        "Set KEEPER_PRIVATE_KEY in .env.local to a funded Anvil account.",
    );
  }

  return data;
}

/**
 * Call cancelExpiredRound directly on the RoundVotingEngine contract via Anvil.
 * Bypasses the keeper's off-chain Date.now() check, which doesn't work with
 * evm_increaseTime (only chain block.timestamp advances, not wall-clock time).
 *
 * Uses viem's encodeFunctionData for ABI encoding.
 */
export async function cancelExpiredRoundDirect(
  contentId: number | bigint,
  roundId: number | bigint,
  contractAddress: string,
  fromAddress: string,
): Promise<boolean> {
  // ABI-encode cancelExpiredRound(uint256,uint256) using viem
  const { encodeFunctionData } = await import("viem");
  const data = encodeFunctionData({
    abi: [
      {
        name: "cancelExpiredRound",
        type: "function",
        inputs: [
          { name: "contentId", type: "uint256" },
          { name: "roundId", type: "uint256" },
        ],
        outputs: [],
        stateMutability: "nonpayable",
      },
    ],
    functionName: "cancelExpiredRound",
    args: [BigInt(contentId), BigInt(roundId)],
  });

  const res = await fetch(ANVIL_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "eth_sendTransaction",
      params: [{ from: fromAddress, to: contractAddress, data, gas: "0x7A120" }],
      id: Date.now(),
    }),
  });

  const json = await res.json();
  return !json.error;
}

/**
 * Wait for Ponder to index the settlement by polling the content endpoint.
 * Returns true if the content has a settled round, false on timeout.
 */
export async function waitForSettlementIndexed(
  contentId: string | number,
  ponderURL = "http://localhost:42069",
  maxWaitMs = 30_000,
): Promise<boolean> {
  const start = Date.now();
  const pollInterval = 2_000;

  while (Date.now() - start < maxWaitMs) {
    try {
      const res = await fetch(`${ponderURL}/content/${contentId}`);
      if (res.ok) {
        const data = await res.json();
        // Check if any round has state=1 (Settled) or state=3 (Tied)
        const hasSettledRound = data.rounds?.some((r: { state: number }) => r.state === 1 || r.state === 3);
        if (hasSettledRound) return true;
      }
    } catch {
      // Ponder may not be ready yet, keep polling
    }
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }

  return false;
}
