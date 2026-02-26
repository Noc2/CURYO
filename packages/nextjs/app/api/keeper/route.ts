/**
 * DEPRECATED: Use packages/keeper/ for production. This route remains for local dev convenience.
 *
 * Keeper API Route -- Trustless tlock-based round resolution.
 *
 * The keeper reads on-chain ciphertexts and decrypts them using drand beacons.
 * No secret data is received from voters -- all reveal data comes from the chain.
 *
 * Runs on a 30-second interval when NODE_ENV === "development".
 * Uses explicit keeper env overrides when set; otherwise prefers the first
 * target network and falls back to other configured target networks if needed.
 * Uses keystore or raw private key for transaction signing.
 *
 * Round lifecycle managed by keeper:
 *   1. revealVote        -- Decrypt tlock ciphertexts whose epoch has ended
 *   2. settleRound       -- Settle rounds with >= minVoters revealed votes
 *   3. processUnrevealedVotes -- Forfeit/refund unrevealed stakes after settlement
 *   4. cancelExpiredRound -- Cancel Open rounds past maxDuration deadline
 *   5. Dormancy sweep    -- Mark inactive content as dormant
 *
 * Round states:
 *   0: Open       (accepting votes, reveals happen as epochs end)
 *   1: Settled    (>= minVoters votes revealed, rewards distributed)
 *   2: Cancelled  (expired without >= minVoters votes, full refund)
 *   3: Tied       (equal pools, refund revealed voters)
 *
 * Endpoints:
 *   GET  /api/keeper -- Check keeper status
 *   POST /api/keeper -- Trigger immediate round resolution
 */
import { NextResponse } from "next/server";
import { BaseError, ContractFunctionRevertedError, createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import deployedContracts from "~~/contracts/deployedContracts";
import externalContracts from "~~/contracts/externalContracts";
import scaffoldConfig from "~~/scaffold.config";
import { getKeystoreAccount } from "~~/utils/keystore";
import { decryptVote } from "~~/utils/tlock";

// --- Round states (mirrors RoundVotingEngine.RoundState enum) ---
const RoundState = {
  Open: 0,
  Settled: 1,
  Cancelled: 2,
  Tied: 3,
} as const;

type TargetChain = (typeof scaffoldConfig.targetNetworks)[number];

const CHAIN_NAME_ALIASES: Record<string, string> = {
  hardhat: "foundry",
  localhost: "foundry",
};

function normalizeChainName(value: string): string {
  return value.replace(/[\s_-]/g, "").toLowerCase();
}

function chainLabel(chain: TargetChain): string {
  return `${chain.name} (chain ${chain.id})`;
}

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

/** Extract the human-readable revert reason from a viem error. */
function getRevertReason(err: unknown): string {
  if (err instanceof BaseError) {
    const revertError = err.walk(e => e instanceof ContractFunctionRevertedError);
    if (revertError instanceof ContractFunctionRevertedError) {
      return revertError.data?.errorName ?? revertError.shortMessage;
    }
    return err.shortMessage;
  }
  return (err as any)?.shortMessage || (err as any)?.message || String(err);
}

function resolvePreferredTargetChain(): TargetChain {
  const configuredChains = scaffoldConfig.targetNetworks;

  const explicitChainIdRaw = process.env.KEEPER_CHAIN_ID?.trim();
  if (explicitChainIdRaw) {
    const explicitChainId = Number.parseInt(explicitChainIdRaw, 10);
    if (Number.isNaN(explicitChainId)) {
      console.warn(
        `[Keeper] Invalid KEEPER_CHAIN_ID='${explicitChainIdRaw}', falling back to default network selection`,
      );
    } else {
      const chainById = configuredChains.find(chain => chain.id === explicitChainId);
      if (chainById) return chainById;
      console.warn(
        `[Keeper] KEEPER_CHAIN_ID=${explicitChainId} is not in scaffold targetNetworks, falling back to default network selection`,
      );
    }
  }

  const explicitNetworkRaw = process.env.KEEPER_NETWORK?.trim();
  if (explicitNetworkRaw) {
    const explicitNetwork = normalizeChainName(explicitNetworkRaw);
    const resolvedName = CHAIN_NAME_ALIASES[explicitNetwork] ?? explicitNetwork;
    const chainByName = configuredChains.find(chain => normalizeChainName(chain.name) === resolvedName);
    if (chainByName) return chainByName;
    console.warn(
      `[Keeper] KEEPER_NETWORK='${explicitNetworkRaw}' is not in scaffold targetNetworks, falling back to default network selection`,
    );
  }

  return configuredChains[0];
}

function getRpcUrlForChain(chain: TargetChain): string {
  const rpcOverrides = scaffoldConfig.rpcOverrides as Record<number, string> | undefined;
  const overrideUrl =
    process.env.KEEPER_RPC_URL || process.env.RPC_URL || rpcOverrides?.[chain.id] || chain.rpcUrls.default.http?.[0];

  if (!overrideUrl) {
    throw new Error(`No RPC URL configured for ${chainLabel(chain)}`);
  }
  return overrideUrl;
}

const preferredTargetChain = resolvePreferredTargetChain();
const hasExplicitTargetOverride = Boolean(
  process.env.KEEPER_CHAIN_ID || process.env.KEEPER_NETWORK || process.env.KEEPER_RPC_URL,
);

let currentTargetChain: TargetChain = preferredTargetChain;
let currentRpcUrl: string = getRpcUrlForChain(preferredTargetChain);
let lastTargetSelectionKey: string | null = null;
let lastConnectivityFailure: string | null = null;

async function resolveKeeperTarget(): Promise<{ chain: TargetChain; rpcUrl: string } | null> {
  const candidates = hasExplicitTargetOverride
    ? [preferredTargetChain]
    : [preferredTargetChain, ...scaffoldConfig.targetNetworks.filter(chain => chain.id !== preferredTargetChain.id)];

  const failures: string[] = [];

  for (const candidate of candidates) {
    const rpcUrl = getRpcUrlForChain(candidate);
    const probeClient = createPublicClient({
      chain: candidate,
      transport: http(rpcUrl),
    });

    try {
      const remoteChainId = await probeClient.getChainId();
      if (remoteChainId !== candidate.id) {
        failures.push(`${chainLabel(candidate)} via ${rpcUrl} returned chainId ${remoteChainId}`);
        continue;
      }

      currentTargetChain = candidate;
      currentRpcUrl = rpcUrl;
      lastConnectivityFailure = null;

      const selectionKey = `${candidate.id}:${rpcUrl}`;
      if (lastTargetSelectionKey !== selectionKey) {
        if (candidate.id !== preferredTargetChain.id && !hasExplicitTargetOverride) {
          console.log(`[Keeper] Using fallback target ${chainLabel(candidate)} via ${rpcUrl}`);
        } else {
          console.log(`[Keeper] Using target ${chainLabel(candidate)} via ${rpcUrl}`);
        }
        lastTargetSelectionKey = selectionKey;
      }

      return { chain: candidate, rpcUrl };
    } catch (err) {
      failures.push(`${chainLabel(candidate)} via ${rpcUrl}: ${getErrorMessage(err)}`);
    }
  }

  const failureSummary = failures.join(" | ");
  if (lastConnectivityFailure !== failureSummary) {
    if (hasExplicitTargetOverride) {
      console.log(`[Keeper] Could not connect to configured keeper target: ${failureSummary}`);
    } else {
      console.log(`[Keeper] Could not connect to any configured keeper target: ${failureSummary}`);
    }
    lastConnectivityFailure = failureSummary;
  }

  return null;
}

// --- Configuration ---
const ENABLED = process.env.NODE_ENV === "development";
const INTERVAL_MS = 30_000; // 30 seconds
const KEEPER_KEY = process.env.KEEPER_PRIVATE_KEY;
const KEEPER_ACCOUNT = getKeystoreAccount();

// --- Tuning constants ---
const UNREVEALED_BATCH_SIZE = 50n; // Process unrevealed votes in batches
const DORMANCY_PERIOD = 30n * 24n * 60n * 60n; // 30 days in seconds
const REVEAL_BY_COMMIT_KEY_ABI = [
  {
    type: "function",
    name: "revealVoteByCommitKey",
    inputs: [
      { name: "contentId", type: "uint256" },
      { name: "roundId", type: "uint256" },
      { name: "commitKey", type: "bytes32" },
      { name: "isUp", type: "bool" },
      { name: "salt", type: "bytes32" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;

// --- State ---
let intervalId: ReturnType<typeof setInterval> | null = null;
let isRunning = false;
let lastRunTime: Date | null = null;
let lastResult: (KeeperResult & { error?: string }) | null = null;
let currentRun: Promise<KeeperResult & { error?: string }> | null = null;

// --- Types ---
interface KeeperResult {
  configured: boolean;
  votesRevealed: number;
  roundsSettled: number;
  roundsCancelled: number;
  unrevealedProcessed: number;
  contentMarkedDormant: number;
}

interface RoundData {
  startTime: bigint;
  state: number;
  voteCount: bigint;
  revealedCount: bigint;
  totalStake: bigint;
  upPool: bigint;
  downPool: bigint;
  upCount: bigint;
  downCount: bigint;
  upWins: boolean;
}

interface CommitData {
  voter: string;
  stakeAmount: bigint;
  ciphertext: `0x${string}`;
  frontend: string;
  revealableAfter: bigint;
  revealed: boolean;
  isUp: boolean;
}

interface ConfigData {
  epochDuration: bigint;
  maxDuration: bigint;
  minVoters: bigint;
  maxVoters: bigint;
}

/**
 * Main keeper logic: process all round lifecycle transitions
 */
async function resolveRounds(): Promise<KeeperResult> {
  const target = await resolveKeeperTarget();
  if (!target) return emptyResult();

  const { chain: targetChain, rpcUrl } = target;
  const chainId = targetChain.id;
  const contracts = {
    ...(deployedContracts[chainId as keyof typeof deployedContracts] as any),
    ...(externalContracts[chainId as keyof typeof externalContracts] as any),
  };

  if (!contracts?.RoundVotingEngine) {
    console.log(`[Keeper] No RoundVotingEngine deployed on chain ${chainId}`);
    return emptyResult();
  }

  // Resolve account: keystore first, then raw private key fallback
  const account = KEEPER_ACCOUNT ?? (KEEPER_KEY ? privateKeyToAccount(KEEPER_KEY as `0x${string}`) : null);
  if (!account) {
    console.log("[Keeper] No keystore or KEEPER_PRIVATE_KEY configured, skipping");
    return emptyResult();
  }

  const engineAddr = contracts.RoundVotingEngine.address as `0x${string}`;
  const engineAbi = contracts.RoundVotingEngine.abi;

  const publicClient = createPublicClient({
    chain: targetChain,
    transport: http(rpcUrl),
  });

  const walletClient = createWalletClient({
    account,
    chain: targetChain,
    transport: http(rpcUrl),
  });

  // Wall-clock time for phase checks. On Anvil (automine), block.timestamp is stale
  // when no transactions are mined. When we send a tx, Anvil mines with current time.
  const now = BigInt(Math.floor(Date.now() / 1000));

  const result: KeeperResult = {
    configured: true,
    votesRevealed: 0,
    roundsSettled: 0,
    roundsCancelled: 0,
    unrevealedProcessed: 0,
    contentMarkedDormant: 0,
  };

  // --- Get all content IDs from ContentRegistry ---
  const registryContracts = contracts?.ContentRegistry;
  if (!registryContracts) {
    console.log("[Keeper] No ContentRegistry deployed, skipping");
    return emptyResult();
  }

  const registryAddr = registryContracts.address as `0x${string}`;
  const registryAbi = registryContracts.abi;

  let nextContentId: bigint;
  try {
    nextContentId = (await publicClient.readContract({
      address: registryAddr,
      abi: registryAbi,
      functionName: "nextContentId",
      args: [],
    })) as bigint;
  } catch (err: any) {
    console.log(
      `[Keeper] Could not query ContentRegistry on ${chainLabel(targetChain)} via ${rpcUrl}: ${err.shortMessage || err.message}`,
    );
    return emptyResult();
  }

  // --- Read config for maxDuration and minVoters ---
  // config() returns multiple outputs (not a tuple), so viem returns an array
  let config: ConfigData;
  try {
    const configArr = (await publicClient.readContract({
      address: engineAddr,
      abi: engineAbi,
      functionName: "config",
      args: [],
    })) as readonly [bigint, bigint, bigint, bigint];
    config = {
      epochDuration: configArr[0],
      maxDuration: configArr[1],
      minVoters: configArr[2],
      maxVoters: configArr[3],
    };
  } catch {
    console.log("[Keeper] Could not read config from RoundVotingEngine");
    return emptyResult();
  }

  // --- Process each content item ---
  for (let contentId = 1n; contentId < nextContentId; contentId++) {
    try {
      // Get the active round for this content
      let activeRoundId: bigint;
      try {
        activeRoundId = (await publicClient.readContract({
          address: engineAddr,
          abi: engineAbi,
          functionName: "getActiveRoundId",
          args: [contentId],
        })) as bigint;
      } catch {
        // No active round for this content -- skip round processing
        activeRoundId = 0n;
      }

      // Process the active round and a few recent past rounds
      const roundsToCheck: bigint[] = [];

      // Always check the active round
      if (activeRoundId > 0n) {
        roundsToCheck.push(activeRoundId);
      }

      // Also check a small lookback window for rounds that may need settling/cleanup
      const lookback = 5n;
      const startRound = activeRoundId > lookback ? activeRoundId - lookback : 1n;
      for (let roundId = startRound; roundId <= activeRoundId; roundId++) {
        if (!roundsToCheck.includes(roundId)) {
          roundsToCheck.push(roundId);
        }
      }

      for (const roundId of roundsToCheck) {
        let round: RoundData;
        try {
          round = (await publicClient.readContract({
            address: engineAddr,
            abi: engineAbi,
            functionName: "getRound",
            args: [contentId, roundId],
          })) as RoundData;
        } catch {
          continue; // Round doesn't exist
        }

        const { state } = round;

        // --- 1. REVEAL: Decrypt tlock ciphertexts whose epoch has ended ---
        if (state === RoundState.Open) {
          let commitCount: bigint;
          try {
            commitCount = (await publicClient.readContract({
              address: engineAddr,
              abi: engineAbi,
              functionName: "getRoundCommitCount",
              args: [contentId, roundId],
            })) as bigint;
          } catch {
            commitCount = 0n;
          }

          for (let i = 0n; i < commitCount; i++) {
            let commitKey: `0x${string}`;
            try {
              commitKey = (await publicClient.readContract({
                address: engineAddr,
                abi: engineAbi,
                functionName: "getRoundCommitHash",
                args: [contentId, roundId, i],
              })) as `0x${string}`;
            } catch {
              continue;
            }

            // Read full commit data from chain
            let commit: CommitData;
            try {
              commit = (await publicClient.readContract({
                address: engineAddr,
                abi: engineAbi,
                functionName: "getCommit",
                args: [contentId, roundId, commitKey],
              })) as CommitData;
            } catch {
              continue;
            }

            // Skip already revealed or empty commits
            if (commit.revealed || commit.voter === "0x0000000000000000000000000000000000000000") {
              continue;
            }

            // Skip if epoch hasn't ended yet (ciphertext not yet decryptable)
            if (now < commit.revealableAfter) {
              continue;
            }

            // Decrypt the on-chain ciphertext using tlock/drand
            let decrypted: { isUp: boolean; salt: `0x${string}`; contentId: bigint };
            try {
              decrypted = await decryptVote(commit.ciphertext);
            } catch (err: any) {
              console.log(
                `[Keeper] Failed to decrypt vote for content #${contentId} round #${roundId}: ${err.message}`,
              );
              continue;
            }

            // Validate: decrypted contentId must match
            if (decrypted.contentId !== contentId) {
              console.log(
                `[Keeper] Decrypted contentId mismatch: expected ${contentId}, got ${decrypted.contentId} — skipping`,
              );
              continue;
            }

            // Submit the reveal on-chain.
            // Explicit gas skips eth_estimateGas which uses Anvil's stale block.timestamp
            // and would revert with EpochNotEnded even though the mined tx succeeds.
            try {
              await walletClient.writeContract({
                address: engineAddr,
                abi: REVEAL_BY_COMMIT_KEY_ABI,
                functionName: "revealVoteByCommitKey",
                args: [contentId, roundId, commitKey, decrypted.isUp, decrypted.salt],
                gas: 500_000n,
              });
              result.votesRevealed++;
              console.log(`[Keeper] Revealed vote for ${commit.voter} on content #${contentId} round #${roundId}`);
            } catch (err: unknown) {
              const reason = getRevertReason(err);
              console.log(
                `[Keeper] Failed to reveal vote: ${reason} (content #${contentId} round #${roundId} voter ${commit.voter}, revealableAfter=${commit.revealableAfter}, now=${now})`,
              );
            }
          }
        }

        // --- 2. SETTLE: If enough votes have been revealed ---
        // Re-read round data if we revealed votes to get fresh revealedCount
        let currentRevealedCount = round.revealedCount;
        if (result.votesRevealed > 0) {
          try {
            const freshRound = (await publicClient.readContract({
              address: engineAddr,
              abi: engineAbi,
              functionName: "getRound",
              args: [contentId, roundId],
            })) as RoundData;
            currentRevealedCount = freshRound.revealedCount;
          } catch {
            // Fall back to stale count
          }
        }
        if (state === RoundState.Open && currentRevealedCount >= config.minVoters) {
          try {
            await walletClient.writeContract({
              address: engineAddr,
              abi: engineAbi,
              functionName: "settleRound",
              args: [contentId, roundId],
              gas: 1_000_000n,
            });
            console.log(`[Keeper] Settled round #${roundId} for content #${contentId}`);
            result.roundsSettled++;
            // State changed -- skip further checks for this round
            continue;
          } catch (err: unknown) {
            const reason = getRevertReason(err);
            if (!reason.toLowerCase().includes("already settled")) {
              console.log(`[Keeper] Failed settleRound content #${contentId} round #${roundId}: ${reason}`);
            }
          }
        }

        // --- 3. PROCESS: Forfeit/refund unrevealed votes after settlement ---
        if (state === RoundState.Settled || state === RoundState.Tied) {
          let commitCount: bigint;
          try {
            commitCount = (await publicClient.readContract({
              address: engineAddr,
              abi: engineAbi,
              functionName: "getRoundCommitCount",
              args: [contentId, roundId],
            })) as bigint;
          } catch {
            commitCount = 0n;
          }

          if (commitCount > 0n) {
            // Check if there are unrevealed commits
            let hasUnrevealed = false;
            for (let i = 0n; i < commitCount; i++) {
              try {
                const commitKey = (await publicClient.readContract({
                  address: engineAddr,
                  abi: engineAbi,
                  functionName: "getRoundCommitHash",
                  args: [contentId, roundId, i],
                })) as `0x${string}`;
                const commit = (await publicClient.readContract({
                  address: engineAddr,
                  abi: engineAbi,
                  functionName: "getCommit",
                  args: [contentId, roundId, commitKey],
                })) as CommitData;
                if (!commit.revealed && commit.stakeAmount > 0n) {
                  hasUnrevealed = true;
                  break;
                }
              } catch {
                continue;
              }
            }

            if (hasUnrevealed) {
              try {
                await walletClient.writeContract({
                  address: engineAddr,
                  abi: engineAbi,
                  functionName: "processUnrevealedVotes",
                  args: [contentId, roundId, 0n, UNREVEALED_BATCH_SIZE],
                  gas: 2_000_000n,
                });
                console.log(`[Keeper] Processed unrevealed votes for content #${contentId} round #${roundId}`);
                result.unrevealedProcessed++;
              } catch (err: unknown) {
                console.log(`[Keeper] Could not process unrevealed votes: ${getRevertReason(err)}`);
              }
            }
          }
        }

        // --- 4. CANCEL: Open rounds past maxDuration deadline ---
        if (state === RoundState.Open && round.startTime > 0n) {
          if (now > round.startTime + config.maxDuration) {
            try {
              await walletClient.writeContract({
                address: engineAddr,
                abi: engineAbi,
                functionName: "cancelExpiredRound",
                args: [contentId, roundId],
                gas: 500_000n,
              });
              console.log(`[Keeper] Cancelled expired round #${roundId} for content #${contentId}`);
              result.roundsCancelled++;
            } catch (err: unknown) {
              console.log(
                `[Keeper] Failed cancelExpiredRound content #${contentId} round #${roundId}: ${getRevertReason(err)}`,
              );
            }
          }
        }
      }

      // --- 5. Dormancy sweep ---
      try {
        const content = (await publicClient.readContract({
          address: registryAddr,
          abi: registryAbi,
          functionName: "getContent",
          args: [contentId],
        })) as { status: number; lastActivityAt: bigint };

        // Only process Active content (status === 0)
        if (content.status === 0 && now > content.lastActivityAt + DORMANCY_PERIOD) {
          await walletClient.writeContract({
            address: registryAddr,
            abi: registryAbi,
            functionName: "markDormant",
            args: [contentId],
          });
          console.log(`[Keeper] Marked content #${contentId} as dormant`);
          result.contentMarkedDormant++;
        }
      } catch (err: unknown) {
        // Will revert if content has pending votes -- that's expected
        const reason = getRevertReason(err);
        if (!reason.includes("pending votes")) {
          console.log(`[Keeper] Could not mark dormant #${contentId}: ${reason}`);
        }
      }
    } catch (err: unknown) {
      console.log(`[Keeper] Error processing content #${contentId}: ${getRevertReason(err)}`);
    }
  }

  // Log summary only when something happened
  const { votesRevealed, roundsSettled, roundsCancelled, unrevealedProcessed, contentMarkedDormant } = result;
  if (votesRevealed + roundsSettled + roundsCancelled + unrevealedProcessed + contentMarkedDormant > 0) {
    console.log(
      `[Keeper] Done: ${votesRevealed} revealed, ${roundsSettled} settled, ${roundsCancelled} cancelled, ${unrevealedProcessed} unrevealed processed, ${contentMarkedDormant} dormant`,
    );
  }

  return result;
}

function emptyResult(): KeeperResult {
  return {
    configured: false,
    votesRevealed: 0,
    roundsSettled: 0,
    roundsCancelled: 0,
    unrevealedProcessed: 0,
    contentMarkedDormant: 0,
  };
}

/**
 * Run the keeper with error handling.
 * If a run is already in progress, returns the existing promise so callers
 * always get the result of the active run (fixes POST returning null).
 */
async function runKeeper(): Promise<KeeperResult & { error?: string }> {
  if (isRunning && currentRun) return currentRun;

  isRunning = true;
  currentRun = (async () => {
    try {
      const result = await resolveRounds();
      lastResult = result;
      lastRunTime = new Date();
      return result;
    } catch (err: any) {
      console.error("[Keeper] Error:", err.message);
      const errorResult = { ...emptyResult(), error: err.message };
      lastResult = errorResult;
      lastRunTime = new Date();
      return errorResult;
    } finally {
      isRunning = false;
      currentRun = null;
    }
  })();

  return currentRun;
}

// Start the interval when this module loads (dev only, requires keystore or KEEPER_PRIVATE_KEY)
if (ENABLED && (KEEPER_ACCOUNT || KEEPER_KEY) && !intervalId) {
  console.log(
    `[Keeper] Starting tlock reveal keeper (preferred ${chainLabel(preferredTargetChain)}, every 30s${
      hasExplicitTargetOverride ? ", explicit target override enabled" : ", fallback enabled"
    })`,
  );
  // Run immediately on startup
  runKeeper();
  // Then run on interval
  intervalId = setInterval(runKeeper, INTERVAL_MS);
}

/**
 * GET /api/keeper -- Check keeper status
 */
export async function GET() {
  if (!ENABLED) {
    return NextResponse.json({ error: "Keeper only runs in development" }, { status: 403 });
  }

  if (!KEEPER_ACCOUNT && !KEEPER_KEY) {
    return NextResponse.json({ status: "disabled", reason: "No keystore or KEEPER_PRIVATE_KEY configured" });
  }

  return NextResponse.json({
    status: intervalId ? "running" : "stopped",
    chain: {
      id: currentTargetChain.id,
      name: currentTargetChain.name,
      rpcUrl: currentRpcUrl,
    },
    preferredChain: {
      id: preferredTargetChain.id,
      name: preferredTargetChain.name,
      explicitOverride: hasExplicitTargetOverride,
    },
    interval: INTERVAL_MS,
    lastRun: lastRunTime?.toISOString() || null,
    lastResult,
  });
}

/**
 * POST /api/keeper -- Trigger immediate round resolution
 */
export async function POST() {
  if (!ENABLED) {
    return NextResponse.json({ error: "Keeper only runs in development" }, { status: 403 });
  }

  const result = await runKeeper();

  return NextResponse.json({
    success: true,
    result,
  });
}
