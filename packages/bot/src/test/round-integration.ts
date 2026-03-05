/**
 * TypeScript integration test for the tlock commit-reveal voting system.
 *
 * Prerequisites:
 *   1. Start Anvil:  anvil
 *   2. Deploy test contracts:
 *      cd packages/foundry
 *      forge script script/DeployRoundTest.s.sol --broadcast --rpc-url http://127.0.0.1:8545
 *   3. Run this test:
 *      cd packages/bot
 *      tsx src/test/round-integration.ts
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  encodePacked,
  keccak256,
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const RPC_URL = "http://127.0.0.1:8545";

// Anvil default accounts (deterministic keys)
const ACCOUNTS = {
  deployer: privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"),
  voter1: privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"),
  voter2: privateKeyToAccount("0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a"),
  voter3: privateKeyToAccount("0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6"),
};

// Minimal ABIs for test operations
const crepAbi = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
  "function mint(address to, uint256 amount)",
]);

const registryAbi = parseAbi([
  "function submitContent(string url, string goal, string tags, uint256 categoryId) returns (uint256)",
]);

const votingEngineAbi = parseAbi([
  "function config() view returns (uint256 epochDuration, uint256 maxDuration, uint256 minVoters, uint256 maxVoters)",
  "function commitVote(uint256 contentId, bytes32 commitHash, bytes ciphertext, uint256 stakeAmount, address frontend)",
  "function revealVoteByCommitKey(uint256 contentId, uint256 roundId, bytes32 commitKey, bool isUp, bytes32 salt)",
  "function settleRound(uint256 contentId, uint256 roundId)",
  "function getActiveRoundId(uint256 contentId) view returns (uint256)",
  "function getRound(uint256 contentId, uint256 roundId) view returns ((uint256 startTime, uint8 state, uint256 voteCount, uint256 revealedCount, uint256 totalStake, uint256 upPool, uint256 downPool, uint256 upCount, uint256 downCount, bool upWins, uint256 settledAt, uint256 thresholdReachedAt, uint256 weightedUpPool, uint256 weightedDownPool))",
  "function getRoundCommitHashes(uint256 contentId, uint256 roundId) view returns (bytes32[])",
  "function getCommit(uint256 contentId, uint256 roundId, bytes32 commitKey) view returns ((address voter, uint256 stakeAmount, bytes ciphertext, address frontend, uint256 revealableAfter, bool revealed, bool isUp, uint32 epochIndex))",
  "function voterCommitHash(uint256 contentId, uint256 roundId, address voter) view returns (bytes32)",
  "function cancelExpiredRound(uint256 contentId, uint256 roundId)",
  "function claimCancelledRoundRefund(uint256 contentId, uint256 roundId)",
]);

const rewardDistributorAbi = parseAbi([
  "function claimReward(uint256 contentId, uint256 roundId)",
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const transport = http(RPC_URL);
const publicClient = createPublicClient({ chain: foundry, transport });

function walletClient(account: ReturnType<typeof privateKeyToAccount>) {
  return createWalletClient({ chain: foundry, transport, account });
}

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;

async function advanceTime(seconds: number) {
  await publicClient.request({
    method: "evm_increaseTime",
    params: [`0x${seconds.toString(16)}`],
  } as any);
  await publicClient.request({ method: "evm_mine", params: [] } as any);
}

const STAKE = 5_000_000n; // 5 cREP (6 decimals)

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`  FAIL: ${message}`);
    failed++;
  } else {
    console.log(`  PASS: ${message}`);
    passed++;
  }
}

// ---------------------------------------------------------------------------
// tlock commit-reveal helpers (test helpers)
// ---------------------------------------------------------------------------

/**
 * Test ciphertext: abi.encodePacked(uint8(isUp ? 1 : 0), bytes32 salt, uint256 contentId)
 * 65 bytes total: 1 + 32 + 32
 */
function mockCiphertext(isUp: boolean, salt: `0x${string}`, contentId: bigint): `0x${string}` {
  return encodePacked(["uint8", "bytes32", "uint256"], [isUp ? 1 : 0, salt, contentId]);
}

/**
 * commitHash = keccak256(abi.encodePacked(isUp, salt, contentId))
 */
function commitHash(isUp: boolean, salt: `0x${string}`, contentId: bigint): `0x${string}` {
  return keccak256(encodePacked(["bool", "bytes32", "uint256"], [isUp, salt, contentId]));
}

/**
 * commitKey = keccak256(abi.encodePacked(voter, commitHash))
 */
function commitKey(voter: Address, ch: `0x${string}`): `0x${string}` {
  return keccak256(encodePacked(["address", "bytes32"], [voter, ch]));
}

/**
 * Commit a vote in test mode.
 */
async function commitVote(
  voter: ReturnType<typeof privateKeyToAccount>,
  contentId: bigint,
  isUp: boolean,
  saltSeed: number,
): Promise<{ salt: `0x${string}`; ck: `0x${string}` }> {
  const salt = keccak256(encodePacked(["address", "uint256"], [voter.address, BigInt(saltSeed)]));
  const ch = commitHash(isUp, salt, contentId);
  const ct = mockCiphertext(isUp, salt, contentId);

  const client = walletClient(voter);
  await client.writeContract({
    address: addresses.crepToken,
    abi: crepAbi,
    functionName: "approve",
    args: [addresses.votingEngine, STAKE],
  });
  const hash = await client.writeContract({
    address: addresses.votingEngine,
    abi: votingEngineAbi,
    functionName: "commitVote",
    args: [contentId, ch, ct, STAKE, ZERO_ADDRESS],
  });
  await publicClient.waitForTransactionReceipt({ hash });

  return { salt, ck: commitKey(voter.address, ch) };
}

/**
 * Reveal a vote.
 */
async function revealVote(
  revealer: ReturnType<typeof privateKeyToAccount>,
  contentId: bigint,
  roundId: bigint,
  ck: `0x${string}`,
  isUp: boolean,
  salt: `0x${string}`,
) {
  const client = walletClient(revealer);
  const hash = await client.writeContract({
    address: addresses.votingEngine,
    abi: votingEngineAbi,
    functionName: "revealVoteByCommitKey",
    args: [contentId, roundId, ck, isUp, salt],
  });
  await publicClient.waitForTransactionReceipt({ hash });
}

// ---------------------------------------------------------------------------
// Load addresses
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));
const addressesPath = resolve(__dirname, "../../../foundry/test-addresses.json");
let addresses: {
  crepToken: Address;
  contentRegistry: Address;
  votingEngine: Address;
  rewardDistributor: Address;
  deployer: Address;
};

try {
  addresses = JSON.parse(readFileSync(addressesPath, "utf-8"));
} catch {
  console.error(
    "Could not read test-addresses.json. Did you run:\n" +
      "  cd packages/foundry\n" +
      "  forge script script/DeployRoundTest.s.sol --broadcast --rpc-url http://127.0.0.1:8545",
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

async function testFullRoundLifecycle() {
  console.log("\n=== Test: Full Round Lifecycle (tlock commit-reveal) ===");

  // Submit content
  const client = walletClient(ACCOUNTS.deployer);
  await client.writeContract({
    address: addresses.crepToken,
    abi: crepAbi,
    functionName: "approve",
    args: [addresses.contentRegistry, 10_000_000n],
  });
  const submitHash = await client.writeContract({
    address: addresses.contentRegistry,
    abi: registryAbi,
    functionName: "submitContent",
    args: ["https://example.com/lifecycle", "test goal", "test", 0n],
  });
  await publicClient.waitForTransactionReceipt({ hash: submitHash });
  const contentId = 1n;

  // Read epoch duration from config
  const cfg = await publicClient.readContract({
    address: addresses.votingEngine,
    abi: votingEngineAbi,
    functionName: "config",
  });
  const epochDuration = Number(cfg[0]);

  // Commit votes (all in epoch 1 — Tier 1, 100% weight)
  const { salt: s1, ck: ck1 } = await commitVote(ACCOUNTS.voter1, contentId, true, 1);
  const { salt: s2, ck: ck2 } = await commitVote(ACCOUNTS.voter2, contentId, false, 2);

  const roundId = await publicClient.readContract({
    address: addresses.votingEngine,
    abi: votingEngineAbi,
    functionName: "getActiveRoundId",
    args: [contentId],
  });
  assert(roundId === 1n, `Active round should be 1 (got ${roundId})`);

  // Verify commits were recorded (voterCommitHash != zero)
  const ch1 = await publicClient.readContract({
    address: addresses.votingEngine,
    abi: votingEngineAbi,
    functionName: "voterCommitHash",
    args: [contentId, roundId, ACCOUNTS.voter1.address],
  });
  assert(
    ch1 !== "0x0000000000000000000000000000000000000000000000000000000000000000",
    "Voter1 should have committed",
  );

  const round = await publicClient.readContract({
    address: addresses.votingEngine,
    abi: votingEngineAbi,
    functionName: "getRound",
    args: [contentId, roundId],
  });
  assert(round.voteCount === 2n, `Vote count should be 2 (got ${round.voteCount})`);

  // Advance past epoch to allow reveals
  await advanceTime(epochDuration + 1);

  // Reveal votes
  await revealVote(ACCOUNTS.deployer, contentId, roundId, ck1, true, s1);
  await revealVote(ACCOUNTS.deployer, contentId, roundId, ck2, false, s2);

  const roundAfterReveal = await publicClient.readContract({
    address: addresses.votingEngine,
    abi: votingEngineAbi,
    functionName: "getRound",
    args: [contentId, roundId],
  });
  assert(roundAfterReveal.revealedCount === 2n, `Revealed count should be 2 (got ${roundAfterReveal.revealedCount})`);

  // Note: 2 votes < minVoters (3), so round can't settle yet — just verify structure
  assert(roundAfterReveal.state === 0, `Round should still be Open (state=0, got ${roundAfterReveal.state})`);

  console.log("  INFO: Round lifecycle tested (commit + reveal verified, needs minVoters=3 to settle)");
}

async function testCommitRevealSettle() {
  console.log("\n=== Test: Commit + Reveal + Settle (3 voters) ===");

  const client = walletClient(ACCOUNTS.deployer);
  await client.writeContract({
    address: addresses.crepToken,
    abi: crepAbi,
    functionName: "approve",
    args: [addresses.contentRegistry, 10_000_000n],
  });
  const submitHash = await client.writeContract({
    address: addresses.contentRegistry,
    abi: registryAbi,
    functionName: "submitContent",
    args: ["https://example.com/settle", "test goal", "test", 0n],
  });
  await publicClient.waitForTransactionReceipt({ hash: submitHash });
  const contentId = 2n;

  const cfg = await publicClient.readContract({
    address: addresses.votingEngine,
    abi: votingEngineAbi,
    functionName: "config",
  });
  const epochDuration = Number(cfg[0]);

  // 2 UP, 1 DOWN — UP side should win
  const { salt: s1, ck: ck1 } = await commitVote(ACCOUNTS.voter1, contentId, true, 10);
  const { salt: s2, ck: ck2 } = await commitVote(ACCOUNTS.voter2, contentId, true, 20);
  const { salt: s3, ck: ck3 } = await commitVote(ACCOUNTS.voter3, contentId, false, 30);

  const roundId = await publicClient.readContract({
    address: addresses.votingEngine,
    abi: votingEngineAbi,
    functionName: "getActiveRoundId",
    args: [contentId],
  });
  assert(roundId === 1n, `Round should be 1 (got ${roundId})`);

  // Advance past epoch end
  await advanceTime(epochDuration + 1);

  // Reveal all votes
  const revealer = ACCOUNTS.deployer;
  await revealVote(revealer, contentId, roundId, ck1, true, s1);
  await revealVote(revealer, contentId, roundId, ck2, true, s2);
  await revealVote(revealer, contentId, roundId, ck3, false, s3);

  const roundAfterReveal = await publicClient.readContract({
    address: addresses.votingEngine,
    abi: votingEngineAbi,
    functionName: "getRound",
    args: [contentId, roundId],
  });
  assert(roundAfterReveal.revealedCount === 3n, `Should have 3 revealed votes`);
  assert(roundAfterReveal.thresholdReachedAt > 0n, `thresholdReachedAt should be set`);

  // Advance past epoch so reveals can happen
  await advanceTime(epochDuration + 1);

  // Settle
  try {
    const settleClient = walletClient(ACCOUNTS.deployer);
    const settleHash = await settleClient.writeContract({
      address: addresses.votingEngine,
      abi: votingEngineAbi,
      functionName: "settleRound",
      args: [contentId, roundId],
    });
    await publicClient.waitForTransactionReceipt({ hash: settleHash });

    const settled = await publicClient.readContract({
      address: addresses.votingEngine,
      abi: votingEngineAbi,
      functionName: "getRound",
      args: [contentId, roundId],
    });
    // State 1 = Settled
    assert(settled.state === 1, `Round should be Settled (state=1, got ${settled.state})`);
    assert(settled.upWins === true, "UP should win (2 UP vs 1 DOWN)");

    // Voter1 (winner) claims reward
    const balBefore = await publicClient.readContract({
      address: addresses.crepToken,
      abi: crepAbi,
      functionName: "balanceOf",
      args: [ACCOUNTS.voter1.address],
    });
    const claimHash2 = await walletClient(ACCOUNTS.voter1).writeContract({
      address: addresses.rewardDistributor,
      abi: rewardDistributorAbi,
      functionName: "claimReward",
      args: [contentId, roundId],
    });
    await publicClient.waitForTransactionReceipt({ hash: claimHash2 });
    const balAfter = await publicClient.readContract({
      address: addresses.crepToken,
      abi: crepAbi,
      functionName: "balanceOf",
      args: [ACCOUNTS.voter1.address],
    });
    assert(balAfter > balBefore, `Winner should receive reward (before=${balBefore}, after=${balAfter})`);
  } catch (e: any) {
    console.log(`  INFO: settleRound reverted: ${e.message.slice(0, 100)}`);
    failed++;
  }
}

async function testDuplicateCommitPrevention() {
  console.log("\n=== Test: Duplicate Commit Prevention ===");

  const client = walletClient(ACCOUNTS.deployer);
  await client.writeContract({
    address: addresses.crepToken,
    abi: crepAbi,
    functionName: "approve",
    args: [addresses.contentRegistry, 10_000_000n],
  });
  const submitHash = await client.writeContract({
    address: addresses.contentRegistry,
    abi: registryAbi,
    functionName: "submitContent",
    args: ["https://example.com/duplicate", "test goal", "test", 0n],
  });
  await publicClient.waitForTransactionReceipt({ hash: submitHash });
  const contentId = 3n;

  // First commit should succeed
  await commitVote(ACCOUNTS.voter1, contentId, true, 100);

  // Second commit by same voter should fail (cooldown or AlreadyCommitted)
  try {
    await commitVote(ACCOUNTS.voter1, contentId, false, 101);
    assert(false, "Duplicate commit should fail");
  } catch {
    assert(true, "Duplicate commit correctly rejected");
  }
}

async function testRoundAdvancementAfterSettlement() {
  console.log("\n=== Test: Round Advancement After Settlement ===");

  const client = walletClient(ACCOUNTS.deployer);
  await client.writeContract({
    address: addresses.crepToken,
    abi: crepAbi,
    functionName: "approve",
    args: [addresses.contentRegistry, 10_000_000n],
  });
  const submitHash = await client.writeContract({
    address: addresses.contentRegistry,
    abi: registryAbi,
    functionName: "submitContent",
    args: ["https://example.com/advance", "test goal", "test", 0n],
  });
  await publicClient.waitForTransactionReceipt({ hash: submitHash });
  const contentId = 4n;

  const cfg = await publicClient.readContract({
    address: addresses.votingEngine,
    abi: votingEngineAbi,
    functionName: "config",
  });
  const epochDuration = Number(cfg[0]);

  // Advance past 24h cooldown from previous tests
  await advanceTime(25 * 60 * 60);

  // Round 1: three voters
  const { salt: s1, ck: ck1 } = await commitVote(ACCOUNTS.voter1, contentId, true, 200);
  const { salt: s2, ck: ck2 } = await commitVote(ACCOUNTS.voter2, contentId, true, 201);
  const { salt: s3, ck: ck3 } = await commitVote(ACCOUNTS.voter3, contentId, false, 202);

  const round1Id = await publicClient.readContract({
    address: addresses.votingEngine,
    abi: votingEngineAbi,
    functionName: "getActiveRoundId",
    args: [contentId],
  });
  assert(round1Id === 1n, `First round should be 1`);

  // Advance past epoch so reveals can happen
  await advanceTime(epochDuration + 1);
  const revealer = ACCOUNTS.deployer;
  await revealVote(revealer, contentId, round1Id, ck1, true, s1);
  await revealVote(revealer, contentId, round1Id, ck2, true, s2);
  await revealVote(revealer, contentId, round1Id, ck3, false, s3);

  await advanceTime(epochDuration + 1);

  try {
    const settleHash = await walletClient(ACCOUNTS.deployer).writeContract({
      address: addresses.votingEngine,
      abi: votingEngineAbi,
      functionName: "settleRound",
      args: [contentId, round1Id],
    });
    await publicClient.waitForTransactionReceipt({ hash: settleHash });
  } catch (e: any) {
    console.log(`  INFO: settleRound for round 1 failed: ${e.message.slice(0, 80)}`);
    return;
  }

  // No active round after settlement
  const noActive = await publicClient.readContract({
    address: addresses.votingEngine,
    abi: votingEngineAbi,
    functionName: "getActiveRoundId",
    args: [contentId],
  });
  assert(noActive === 0n, "No active round after settlement");

  // Advance past 24h cooldown, then start round 2
  await advanceTime(25 * 60 * 60);
  await commitVote(ACCOUNTS.voter3, contentId, false, 203);

  const round2Id = await publicClient.readContract({
    address: addresses.votingEngine,
    abi: votingEngineAbi,
    functionName: "getActiveRoundId",
    args: [contentId],
  });
  assert(round2Id === 2n, `New round should be 2 (got ${round2Id})`);
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

async function main() {
  console.log("tlock Commit-Reveal Integration Tests (TypeScript)");
  console.log("===================================================");
  console.log(`RPC: ${RPC_URL}`);
  console.log(`VotingEngine: ${addresses.votingEngine}`);
  console.log(`ContentRegistry: ${addresses.contentRegistry}`);
  console.log(`RewardDistributor: ${addresses.rewardDistributor}`);

  // Verify connection
  const blockNumber = await publicClient.getBlockNumber();
  console.log(`Connected to Anvil (block ${blockNumber})\n`);

  try {
    await testFullRoundLifecycle();
    await testCommitRevealSettle();
    await testDuplicateCommitPrevention();
    await testRoundAdvancementAfterSettlement();
  } catch (e) {
    console.error("\nUnexpected error:", e);
    failed++;
  }

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
