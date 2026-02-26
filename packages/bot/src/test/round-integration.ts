/**
 * TypeScript integration test for the round-based voting system.
 *
 * Prerequisites:
 *   1. Start Anvil:  anvil
 *   2. Deploy test contracts:
 *      cd packages/foundry
 *      forge script script/DeployRoundTest.s.sol --broadcast --rpc-url http://127.0.0.1:8545
 *   3. Run this test:
 *      cd packages/bot
 *      TLOCK_MOCK=true tsx src/test/round-integration.ts
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import {
  createPublicClient,
  createWalletClient,
  http,
  encodePacked,
  keccak256,
  parseAbi,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";
import crypto from "crypto";

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
  "function revealVote(uint256 contentId, uint256 roundId, bytes32 commitHash, bool isUp, bytes32 salt)",
  "function settleRound(uint256 contentId, uint256 roundId)",
  "function getActiveRoundId(uint256 contentId) view returns (uint256)",
  "function getRound(uint256 contentId, uint256 roundId) view returns ((uint256 startTime, uint8 state, uint256 voteCount, uint256 revealedCount, uint256 totalStake, uint256 upPool, uint256 downPool, uint256 upCount, uint256 downCount, bool upWins, uint256 settledAt, uint256 thresholdReachedAt))",
  "function hasCommitted(uint256 contentId, uint256 roundId, address voter) view returns (bool)",
  "function processUnrevealedVotes(uint256 contentId, uint256 roundId, uint256 startIndex, uint256 count)",
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

function generateSalt(): Hex {
  return `0x${crypto.randomBytes(32).toString("hex")}` as Hex;
}

function computeCommitHash(isUp: boolean, salt: Hex, contentId: bigint): Hex {
  return keccak256(encodePacked(["bool", "bytes32", "uint256"], [isUp, salt, contentId]));
}

// Mock ciphertext: in mock mode the contract ignores it
function mockCiphertext(): Hex {
  return "0x";
}

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
// Test helpers
// ---------------------------------------------------------------------------

async function submitContent(url: string): Promise<bigint> {
  const client = walletClient(ACCOUNTS.deployer);
  // Approve submitter stake
  await client.writeContract({
    address: addresses.crepToken,
    abi: crepAbi,
    functionName: "approve",
    args: [addresses.contentRegistry, 10_000_000n],
  });
  const hash = await client.writeContract({
    address: addresses.contentRegistry,
    abi: registryAbi,
    functionName: "submitContent",
    args: [url, "test goal", "test", 0n],
  });
  await publicClient.waitForTransactionReceipt({ hash });
  // Assume contentId increments from 1
  return 1n; // first content
}

async function commitVote(
  voter: ReturnType<typeof privateKeyToAccount>,
  contentId: bigint,
  isUp: boolean,
  salt: Hex,
): Promise<Hex> {
  const client = walletClient(voter);
  const commitHash = computeCommitHash(isUp, salt, contentId);

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
    args: [contentId, commitHash, mockCiphertext(), STAKE, "0x0000000000000000000000000000000000000000" as Address],
  });
  await publicClient.waitForTransactionReceipt({ hash });
  return commitHash;
}

async function revealVote(
  caller: ReturnType<typeof privateKeyToAccount>,
  contentId: bigint,
  roundId: bigint,
  commitHash: Hex,
  isUp: boolean,
  salt: Hex,
) {
  const client = walletClient(caller);
  const hash = await client.writeContract({
    address: addresses.votingEngine,
    abi: votingEngineAbi,
    functionName: "revealVote",
    args: [contentId, roundId, commitHash, isUp, salt],
  });
  await publicClient.waitForTransactionReceipt({ hash });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

async function testFullRoundLifecycle() {
  console.log("\n=== Test: Full Round Lifecycle ===");
  const contentId = await submitContent("https://example.com/lifecycle");

  const salt1 = generateSalt();
  const salt2 = generateSalt();
  const hash1 = await commitVote(ACCOUNTS.voter1, contentId, true, salt1);
  const hash2 = await commitVote(ACCOUNTS.voter2, contentId, false, salt2);

  const roundId = await publicClient.readContract({
    address: addresses.votingEngine,
    abi: votingEngineAbi,
    functionName: "getActiveRoundId",
    args: [contentId],
  });
  assert(roundId === 1n, `Active round should be 1 (got ${roundId})`);

  // Try reveal before epoch end — should fail
  try {
    await revealVote(ACCOUNTS.voter1, contentId, roundId, hash1, true, salt1);
    assert(false, "Reveal before epoch end should fail");
  } catch (e: any) {
    assert(e.message.includes("Epoch not ended yet"), "Correct error: Epoch not ended yet");
  }

  // Advance past epoch end (16 minutes)
  await advanceTime(16 * 60);

  // Reveal both votes (voter1 self-reveals, voter2 revealed by voter1 = multi-keeper)
  await revealVote(ACCOUNTS.voter1, contentId, roundId, hash1, true, salt1);
  await revealVote(ACCOUNTS.voter1, contentId, roundId, hash2, false, salt2);

  const round = await publicClient.readContract({
    address: addresses.votingEngine,
    abi: votingEngineAbi,
    functionName: "getRound",
    args: [contentId, roundId],
  });
  assert(round.revealedCount === 2n, `Revealed count should be 2 (got ${round.revealedCount})`);
  assert(round.upPool === STAKE, `UP pool should equal stake`);
  assert(round.downPool === STAKE, `DOWN pool should equal stake`);

  // Try settle before delay — should fail
  try {
    const client = walletClient(ACCOUNTS.voter1);
    const h = await client.writeContract({
      address: addresses.votingEngine,
      abi: votingEngineAbi,
      functionName: "settleRound",
      args: [contentId, roundId],
    });
    await publicClient.waitForTransactionReceipt({ hash: h });
    assert(false, "Settle before delay should fail");
  } catch (e: any) {
    assert(e.message.includes("Settlement delay not elapsed"), "Correct error: Settlement delay not elapsed");
  }

  // Advance past settlement delay (16 more minutes)
  await advanceTime(16 * 60);

  // Settle (tie: equal pools)
  const settleClient = walletClient(ACCOUNTS.voter1);
  const settleHash = await settleClient.writeContract({
    address: addresses.votingEngine,
    abi: votingEngineAbi,
    functionName: "settleRound",
    args: [contentId, roundId],
  });
  await publicClient.waitForTransactionReceipt({ hash: settleHash });

  const settledRound = await publicClient.readContract({
    address: addresses.votingEngine,
    abi: votingEngineAbi,
    functionName: "getRound",
    args: [contentId, roundId],
  });
  // State 3 = Tied
  assert(settledRound.state === 3, `Round should be Tied (state=3, got ${settledRound.state})`);
}

async function testMultiKeeperReveal() {
  console.log("\n=== Test: Multi-Keeper Reveal ===");

  // Submit new content (contentId = 2)
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
    args: ["https://example.com/multikeeper", "test goal", "test", 0n],
  });
  await publicClient.waitForTransactionReceipt({ hash: submitHash });
  const contentId = 2n;

  const salt1 = generateSalt();
  const salt2 = generateSalt();
  const hash1 = await commitVote(ACCOUNTS.voter1, contentId, true, salt1);
  const hash2 = await commitVote(ACCOUNTS.voter2, contentId, false, salt2);

  const roundId = await publicClient.readContract({
    address: addresses.votingEngine,
    abi: votingEngineAbi,
    functionName: "getActiveRoundId",
    args: [contentId],
  });

  await advanceTime(16 * 60);

  // Keeper 1 (voter1) reveals vote 1
  await revealVote(ACCOUNTS.voter1, contentId, roundId, hash1, true, salt1);
  // Keeper 2 (voter2) reveals vote 2
  await revealVote(ACCOUNTS.voter2, contentId, roundId, hash2, false, salt2);

  const round = await publicClient.readContract({
    address: addresses.votingEngine,
    abi: votingEngineAbi,
    functionName: "getRound",
    args: [contentId, roundId],
  });
  assert(round.revealedCount === 2n, "Both votes revealed by different keepers");

  // Double reveal should fail
  try {
    await revealVote(ACCOUNTS.voter3, contentId, roundId, hash1, true, salt1);
    assert(false, "Double reveal should fail");
  } catch (e: any) {
    assert(e.message.includes("Already revealed"), "Correct error: Already revealed");
  }
}

async function testSettlementWithClaim() {
  console.log("\n=== Test: Settlement with Reward Claim ===");

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
    args: ["https://example.com/claim", "test goal", "test", 0n],
  });
  await publicClient.waitForTransactionReceipt({ hash: submitHash });
  const contentId = 3n;

  // Need to advance past 24h cooldown from previous tests for voter1 and voter2
  await advanceTime(25 * 60 * 60);

  // 2 UP, 1 DOWN
  const salt1 = generateSalt();
  const salt2 = generateSalt();
  const salt3 = generateSalt();
  const hash1 = await commitVote(ACCOUNTS.voter1, contentId, true, salt1);
  const hash2 = await commitVote(ACCOUNTS.voter2, contentId, true, salt2);
  const hash3 = await commitVote(ACCOUNTS.voter3, contentId, false, salt3);

  const roundId = await publicClient.readContract({
    address: addresses.votingEngine,
    abi: votingEngineAbi,
    functionName: "getActiveRoundId",
    args: [contentId],
  });

  // Advance past epoch + reveal
  await advanceTime(16 * 60);
  await revealVote(ACCOUNTS.voter1, contentId, roundId, hash1, true, salt1);
  await revealVote(ACCOUNTS.voter1, contentId, roundId, hash2, true, salt2);
  await revealVote(ACCOUNTS.voter1, contentId, roundId, hash3, false, salt3);

  // Advance past settlement delay
  await advanceTime(16 * 60);

  // Settle
  const settleClient = walletClient(ACCOUNTS.voter1);
  const settleHash = await settleClient.writeContract({
    address: addresses.votingEngine,
    abi: votingEngineAbi,
    functionName: "settleRound",
    args: [contentId, roundId],
  });
  await publicClient.waitForTransactionReceipt({ hash: settleHash });

  const round = await publicClient.readContract({
    address: addresses.votingEngine,
    abi: votingEngineAbi,
    functionName: "getRound",
    args: [contentId, roundId],
  });
  // State 1 = Settled
  assert(round.state === 1, `Round should be Settled (state=1, got ${round.state})`);
  assert(round.upWins === true, "UP should win");

  // Winner claims reward
  const balBefore = await publicClient.readContract({
    address: addresses.crepToken,
    abi: crepAbi,
    functionName: "balanceOf",
    args: [ACCOUNTS.voter1.address],
  });

  const claimClient = walletClient(ACCOUNTS.voter1);
  const claimHash = await claimClient.writeContract({
    address: addresses.rewardDistributor,
    abi: rewardDistributorAbi,
    functionName: "claimReward",
    args: [contentId, roundId],
  });
  await publicClient.waitForTransactionReceipt({ hash: claimHash });

  const balAfter = await publicClient.readContract({
    address: addresses.crepToken,
    abi: crepAbi,
    functionName: "balanceOf",
    args: [ACCOUNTS.voter1.address],
  });
  assert(balAfter > balBefore, `Winner should receive reward (before=${balBefore}, after=${balAfter})`);
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

  // Advance past cooldown from previous tests
  await advanceTime(25 * 60 * 60);

  // Round 1
  const salt1 = generateSalt();
  const salt2 = generateSalt();
  const hash1 = await commitVote(ACCOUNTS.voter1, contentId, true, salt1);
  const hash2 = await commitVote(ACCOUNTS.voter2, contentId, true, salt2);

  const round1Id = await publicClient.readContract({
    address: addresses.votingEngine,
    abi: votingEngineAbi,
    functionName: "getActiveRoundId",
    args: [contentId],
  });
  assert(round1Id === 1n, `First round should be 1`);

  // Reveal + settle round 1
  await advanceTime(16 * 60);
  await revealVote(ACCOUNTS.voter1, contentId, round1Id, hash1, true, salt1);
  await revealVote(ACCOUNTS.voter1, contentId, round1Id, hash2, true, salt2);
  await advanceTime(16 * 60);

  const settleClient = walletClient(ACCOUNTS.voter1);
  const settleHash = await settleClient.writeContract({
    address: addresses.votingEngine,
    abi: votingEngineAbi,
    functionName: "settleRound",
    args: [contentId, round1Id],
  });
  await publicClient.waitForTransactionReceipt({ hash: settleHash });

  // No active round after settlement
  const noActive = await publicClient.readContract({
    address: addresses.votingEngine,
    abi: votingEngineAbi,
    functionName: "getActiveRoundId",
    args: [contentId],
  });
  assert(noActive === 0n, "No active round after settlement");

  // Advance past 24h cooldown, then create round 2
  await advanceTime(25 * 60 * 60);

  const salt3 = generateSalt();
  await commitVote(ACCOUNTS.voter3, contentId, false, salt3);

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
  console.log("Round-Based Voting Integration Tests (TypeScript)");
  console.log("=================================================");
  console.log(`RPC: ${RPC_URL}`);
  console.log(`VotingEngine: ${addresses.votingEngine}`);
  console.log(`ContentRegistry: ${addresses.contentRegistry}`);
  console.log(`RewardDistributor: ${addresses.rewardDistributor}`);

  // Verify connection
  const blockNumber = await publicClient.getBlockNumber();
  console.log(`Connected to Anvil (block ${blockNumber})\n`);

  try {
    await testFullRoundLifecycle();
    await testMultiKeeperReveal();
    await testSettlementWithClaim();
    await testRoundAdvancementAfterSettlement();
  } catch (e) {
    console.error("\nUnexpected error:", e);
    failed++;
  }

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
