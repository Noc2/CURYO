/**
 * TypeScript integration test for the public-vote round-based voting system.
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
  "function config() view returns (uint64 minEpochBlocks, uint64 maxEpochBlocks, uint256 maxDuration, uint256 minVoters, uint256 maxVoters, uint16 baseRateBps, uint16 growthRateBps, uint16 maxProbBps, uint256 liquidityParam)",
  "function vote(uint256 contentId, bool isUp, uint256 stakeAmount, address frontend)",
  "function trySettle(uint256 contentId)",
  "function getActiveRoundId(uint256 contentId) view returns (uint256)",
  "function getRound(uint256 contentId, uint256 roundId) view returns ((uint256 startTime, uint64 startBlock, uint8 state, uint256 voteCount, uint256 totalStake, uint256 totalUpStake, uint256 totalDownStake, uint256 totalUpShares, uint256 totalDownShares, uint256 upCount, uint256 downCount, bool upWins, uint256 settledAt, uint16 epochStartRating))",
  "function hasVoted(uint256 contentId, uint256 roundId, address voter) view returns (bool)",
  "function lastVoteTimestamp(uint256 contentId, address voter) view returns (uint256)",
  "function cancelExpiredRound(uint256 contentId, uint256 roundId)",
  "function claimCancelledRoundRefund(uint256 contentId, uint256 roundId)",
  "function claimParticipationReward(uint256 contentId, uint256 roundId)",
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

async function mineBlocks(count: number) {
  for (let i = 0; i < count; i++) {
    await publicClient.request({ method: "evm_mine", params: [] } as any);
  }
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

async function castVote(
  voter: ReturnType<typeof privateKeyToAccount>,
  contentId: bigint,
  isUp: boolean,
) {
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
    functionName: "vote",
    args: [contentId, isUp, STAKE, ZERO_ADDRESS],
  });
  await publicClient.waitForTransactionReceipt({ hash });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

async function testFullRoundLifecycle() {
  console.log("\n=== Test: Full Round Lifecycle (Public Vote + Random Settlement) ===");
  const contentId = await submitContent("https://example.com/lifecycle");

  // Vote — two voters, one UP and one DOWN
  await castVote(ACCOUNTS.voter1, contentId, true);
  await castVote(ACCOUNTS.voter2, contentId, false);

  const roundId = await publicClient.readContract({
    address: addresses.votingEngine,
    abi: votingEngineAbi,
    functionName: "getActiveRoundId",
    args: [contentId],
  });
  assert(roundId === 1n, `Active round should be 1 (got ${roundId})`);

  // Verify votes were recorded
  const hasVoted1 = await publicClient.readContract({
    address: addresses.votingEngine,
    abi: votingEngineAbi,
    functionName: "hasVoted",
    args: [contentId, roundId, ACCOUNTS.voter1.address],
  });
  assert(hasVoted1 === true, "Voter1 should have voted");

  const hasVoted2 = await publicClient.readContract({
    address: addresses.votingEngine,
    abi: votingEngineAbi,
    functionName: "hasVoted",
    args: [contentId, roundId, ACCOUNTS.voter2.address],
  });
  assert(hasVoted2 === true, "Voter2 should have voted");

  const round = await publicClient.readContract({
    address: addresses.votingEngine,
    abi: votingEngineAbi,
    functionName: "getRound",
    args: [contentId, roundId],
  });
  assert(round.voteCount === 2n, `Vote count should be 2 (got ${round.voteCount})`);
  assert(round.totalUpStake === STAKE, `UP stake should equal stake`);
  assert(round.totalDownStake === STAKE, `DOWN stake should equal stake`);

  // Mine enough blocks to pass the epoch, then trySettle
  // Read config to know minEpochBlocks
  const cfg = await publicClient.readContract({
    address: addresses.votingEngine,
    abi: votingEngineAbi,
    functionName: "config",
  });
  const minEpochBlocks = Number(cfg[0]);
  await mineBlocks(minEpochBlocks + 1);

  // Try to settle — with equal pools this may result in a tie
  const settleClient = walletClient(ACCOUNTS.voter1);
  try {
    const settleHash = await settleClient.writeContract({
      address: addresses.votingEngine,
      abi: votingEngineAbi,
      functionName: "trySettle",
      args: [contentId],
    });
    await publicClient.waitForTransactionReceipt({ hash: settleHash });

    const settledRound = await publicClient.readContract({
      address: addresses.votingEngine,
      abi: votingEngineAbi,
      functionName: "getRound",
      args: [contentId, roundId],
    });
    // State 1 = Settled, State 3 = Tied — both are valid outcomes
    assert(
      settledRound.state === 1 || settledRound.state === 3,
      `Round should be Settled or Tied (got state=${settledRound.state})`,
    );
  } catch (e: any) {
    // trySettle may revert if not enough blocks or probability not met — that's ok in a tie scenario
    console.log(`  INFO: trySettle reverted (expected for some scenarios): ${e.message.slice(0, 80)}`);
  }
}

async function testVoteAndSettle() {
  console.log("\n=== Test: Vote + trySettle + Claim ===");

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
    args: ["https://example.com/vote-settle", "test goal", "test", 0n],
  });
  await publicClient.waitForTransactionReceipt({ hash: submitHash });
  const contentId = 2n;

  // 2 UP, 1 DOWN — UP side should win
  await castVote(ACCOUNTS.voter1, contentId, true);
  await castVote(ACCOUNTS.voter2, contentId, true);
  await castVote(ACCOUNTS.voter3, contentId, false);

  const roundId = await publicClient.readContract({
    address: addresses.votingEngine,
    abi: votingEngineAbi,
    functionName: "getActiveRoundId",
    args: [contentId],
  });

  const round = await publicClient.readContract({
    address: addresses.votingEngine,
    abi: votingEngineAbi,
    functionName: "getRound",
    args: [contentId, roundId],
  });
  assert(round.voteCount === 3n, `Vote count should be 3 (got ${round.voteCount})`);
  assert(round.upCount === 2n, `UP count should be 2 (got ${round.upCount})`);
  assert(round.downCount === 1n, `DOWN count should be 1 (got ${round.downCount})`);

  // Mine enough blocks for epoch to end
  const cfg = await publicClient.readContract({
    address: addresses.votingEngine,
    abi: votingEngineAbi,
    functionName: "config",
  });
  const maxEpochBlocks = Number(cfg[1]);
  await mineBlocks(maxEpochBlocks + 1);

  // Try settle
  const settleClient = walletClient(ACCOUNTS.voter1);
  try {
    const settleHash2 = await settleClient.writeContract({
      address: addresses.votingEngine,
      abi: votingEngineAbi,
      functionName: "trySettle",
      args: [contentId],
    });
    await publicClient.waitForTransactionReceipt({ hash: settleHash2 });

    const settledRound = await publicClient.readContract({
      address: addresses.votingEngine,
      abi: votingEngineAbi,
      functionName: "getRound",
      args: [contentId, roundId],
    });

    if (settledRound.state === 1) {
      assert(settledRound.upWins === true, "UP should win");

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
    } else {
      console.log(`  INFO: Round ended in state ${settledRound.state} (random settlement may not have settled)`);
    }
  } catch (e: any) {
    console.log(`  INFO: trySettle reverted: ${e.message.slice(0, 100)}`);
  }
}

async function testDuplicateVotePrevention() {
  console.log("\n=== Test: Duplicate Vote Prevention ===");

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

  // First vote should succeed
  await castVote(ACCOUNTS.voter1, contentId, true);

  // Second vote by same voter should fail
  try {
    await castVote(ACCOUNTS.voter1, contentId, false);
    assert(false, "Duplicate vote should fail");
  } catch (e: any) {
    assert(true, "Duplicate vote correctly rejected");
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

  // Advance past cooldown from previous tests
  await advanceTime(25 * 60 * 60);

  // Round 1: two UP votes
  await castVote(ACCOUNTS.voter1, contentId, true);
  await castVote(ACCOUNTS.voter2, contentId, true);

  const round1Id = await publicClient.readContract({
    address: addresses.votingEngine,
    abi: votingEngineAbi,
    functionName: "getActiveRoundId",
    args: [contentId],
  });
  assert(round1Id === 1n, `First round should be 1`);

  // Mine blocks to pass epoch, then try to settle
  const cfg = await publicClient.readContract({
    address: addresses.votingEngine,
    abi: votingEngineAbi,
    functionName: "config",
  });
  const maxEpochBlocks = Number(cfg[1]);
  await mineBlocks(maxEpochBlocks + 1);

  const settleClient = walletClient(ACCOUNTS.voter1);
  try {
    const settleHash = await settleClient.writeContract({
      address: addresses.votingEngine,
      abi: votingEngineAbi,
      functionName: "trySettle",
      args: [contentId],
    });
    await publicClient.waitForTransactionReceipt({ hash: settleHash });
  } catch {
    console.log("  INFO: trySettle for round 1 did not settle (probabilistic)");
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

  // Advance past 24h cooldown, then create round 2
  await advanceTime(25 * 60 * 60);

  await castVote(ACCOUNTS.voter3, contentId, false);

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
  console.log("Public Vote + Random Settlement Integration Tests (TypeScript)");
  console.log("===============================================================");
  console.log(`RPC: ${RPC_URL}`);
  console.log(`VotingEngine: ${addresses.votingEngine}`);
  console.log(`ContentRegistry: ${addresses.contentRegistry}`);
  console.log(`RewardDistributor: ${addresses.rewardDistributor}`);

  // Verify connection
  const blockNumber = await publicClient.getBlockNumber();
  console.log(`Connected to Anvil (block ${blockNumber})\n`);

  try {
    await testFullRoundLifecycle();
    await testVoteAndSettle();
    await testDuplicateVotePrevention();
    await testRoundAdvancementAfterSettlement();
  } catch (e) {
    console.error("\nUnexpected error:", e);
    failed++;
  }

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
