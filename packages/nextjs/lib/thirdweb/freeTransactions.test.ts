import deployedContracts from "@curyo/contracts/deployedContracts";
import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { type Abi, encodeAbiParameters, encodeEventTopics, encodeFunctionData, parseAbiItem } from "viem";

const env = process.env as Record<string, string | undefined>;
const originalAppEnv = env.APP_ENV;
const originalDatabaseUrl = env.DATABASE_URL;
const originalFreeTransactionLimit = env.FREE_TRANSACTION_LIMIT;
const originalNodeEnv = env.NODE_ENV;
const originalTargetNetworks = env.NEXT_PUBLIC_TARGET_NETWORKS;

env.APP_ENV = "test";
env.DATABASE_URL = "memory:";
env.FREE_TRANSACTION_LIMIT = "2";
env.NODE_ENV = "test";
env.NEXT_PUBLIC_TARGET_NETWORKS = "31337";

type DbModule = typeof import("../db");
type DatabaseResources = import("../db").DatabaseResources;
type DbTestMemoryModule = typeof import("../db/testMemory");
type FreeTransactionsModule = typeof import("./freeTransactions");
type OperationModule = typeof import("./freeTransactionOperation");

type ContractRecord = {
  address: `0x${string}`;
  abi: Abi;
};

type EncodedCall = {
  data: `0x${string}`;
  to: `0x${string}`;
  value?: `0x${string}`;
};

const CHAIN_ID = 31337;
const ENTRY_POINT = "0x1111111111111111111111111111111111111111" as const;
const EXECUTOR = "0x2222222222222222222222222222222222222222" as const;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;
const SUCCESS_HASH = `0x${"1".repeat(64)}` as const;
const WALLET = "0x1234567890abcdef1234567890abcdef12345678" as const;
const USER_OPERATION_EVENT = parseAbiItem(
  "event UserOperationEvent(bytes32 indexed userOpHash, address indexed sender, address indexed paymaster, uint256 nonce, bool success, uint256 actualGasCost, uint256 actualGasUsed)",
);
const EXECUTED_EVENT = parseAbiItem(
  "event Executed(address indexed user, address indexed signer, address indexed executor, uint256 batchSize)",
);
const contractsForChain = (deployedContracts as Record<number, Record<string, ContractRecord>>)[CHAIN_ID];
const crepContract = contractsForChain.CuryoReputation;
const contentRegistryContract = contractsForChain.ContentRegistry;
const categoryRegistryContract = contractsForChain.CategoryRegistry;
const frontendRegistryContract = contractsForChain.FrontendRegistry;
const rewardDistributorContract = contractsForChain.RoundRewardDistributor;
const votingEngineContract = contractsForChain.RoundVotingEngine;

let dbModule: DbModule;
let dbTestMemory: DbTestMemoryModule;
let freeTransactions: FreeTransactionsModule;
let operationModule: OperationModule;
let memoryResources: DatabaseResources;

function encodeCall(
  contract: ContractRecord,
  functionName: string,
  args: readonly unknown[] = [],
  value?: `0x${string}`,
): EncodedCall {
  return {
    data: encodeFunctionData({
      abi: contract.abi,
      functionName: functionName as never,
      args: args as never,
    }),
    to: contract.address,
    ...(value ? { value } : {}),
  };
}

function buildRequest(calls: readonly EncodedCall[]) {
  return {
    chainId: CHAIN_ID,
    userOp: {
      sender: WALLET,
      data: {
        targets: calls.map(call => call.to),
        callDatas: calls.map(call => call.data),
        values: calls.map(call => call.value ?? "0x0"),
      },
    },
  };
}

function buildOperationKey(calls: readonly EncodedCall[]) {
  const operationKey = operationModule.buildFreeTransactionOperationKey({
    chainId: CHAIN_ID,
    calls: calls.map(call => ({
      data: call.data,
      to: call.to,
      value: call.value ?? "0x0",
    })),
    sender: WALLET,
  });

  assert.ok(operationKey, "operation key should be derived from the verifier payload");
  return operationKey;
}

function buildUserOperationEventLog(sender: `0x${string}`) {
  return {
    address: ENTRY_POINT,
    data: encodeAbiParameters(
      [
        { name: "nonce", type: "uint256" },
        { name: "success", type: "bool" },
        { name: "actualGasCost", type: "uint256" },
        { name: "actualGasUsed", type: "uint256" },
      ],
      [0n, true, 0n, 0n],
    ),
    topics: encodeEventTopics({
      abi: [USER_OPERATION_EVENT],
      eventName: "UserOperationEvent",
      args: {
        paymaster: ZERO_ADDRESS,
        sender,
        userOpHash: SUCCESS_HASH,
      },
    }).filter((topic): topic is `0x${string}` => !!topic),
  };
}

function buildExecutedEventLog(user: `0x${string}`) {
  return {
    address: EXECUTOR,
    data: encodeAbiParameters([{ name: "batchSize", type: "uint256" }], [1n]),
    topics: encodeEventTopics({
      abi: [EXECUTED_EVENT],
      eventName: "Executed",
      args: {
        executor: EXECUTOR,
        signer: WALLET,
        user,
      },
    }).filter((topic): topic is `0x${string}` => !!topic),
  };
}

const voteCall = (voteMarker: `0x${string}`) =>
  encodeCall(crepContract, "transferAndCall", [votingEngineContract.address, 1n, voteMarker]);

function createStoreUnavailableError() {
  return new Error("database offline", {
    cause: {
      code: "SELF_SIGNED_CERT_IN_CHAIN",
    },
  });
}

function createStoreUnavailableResources(base: DatabaseResources): DatabaseResources {
  const storeUnavailableError = createStoreUnavailableError();
  const database = new Proxy(base.database as object, {
    get(target, property, receiver) {
      if (property === "insert" || property === "transaction") {
        return () => {
          throw storeUnavailableError;
        };
      }

      const value = Reflect.get(target, property, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  }) as DatabaseResources["database"];

  return {
    client: base.client,
    database,
    pool: base.pool,
  };
}

before(async () => {
  dbModule = await import("../db");
  dbTestMemory = await import("../db/testMemory");
  memoryResources = dbTestMemory.createMemoryDatabaseResources();
  dbModule.__setDatabaseResourcesForTests(memoryResources);
  freeTransactions = await import("./freeTransactions");
  operationModule = await import("./freeTransactionOperation");
});

beforeEach(async () => {
  dbModule.__setDatabaseResourcesForTests(memoryResources);
  freeTransactions.__setFreeTransactionTestOverridesForTests({
    allTransactionHashesSucceeded: async () => true,
    resolveVoterIdTokenId: async () => "42",
  });

  await dbModule.dbClient.execute("DELETE FROM free_transaction_reservations");
  await dbModule.dbClient.execute("DELETE FROM free_transaction_quotas");
});

after(() => {
  freeTransactions.__setFreeTransactionTestOverridesForTests(null);
  dbModule.__setDatabaseResourcesForTests(null);

  if (originalAppEnv === undefined) {
    delete env.APP_ENV;
  } else {
    env.APP_ENV = originalAppEnv;
  }

  if (originalDatabaseUrl === undefined) {
    delete env.DATABASE_URL;
  } else {
    env.DATABASE_URL = originalDatabaseUrl;
  }

  if (originalFreeTransactionLimit === undefined) {
    delete env.FREE_TRANSACTION_LIMIT;
  } else {
    env.FREE_TRANSACTION_LIMIT = originalFreeTransactionLimit;
  }

  if (originalNodeEnv === undefined) {
    delete env.NODE_ENV;
  } else {
    env.NODE_ENV = originalNodeEnv;
  }

  if (originalTargetNetworks === undefined) {
    delete env.NEXT_PUBLIC_TARGET_NETWORKS;
  } else {
    env.NEXT_PUBLIC_TARGET_NETWORKS = originalTargetNetworks;
  }
});

test("pending reservations are idempotent and reserve capacity without incrementing confirmed quota", async () => {
  const firstCalls = [voteCall("0x01")];
  const secondCalls = [voteCall("0x02")];
  const thirdCalls = [voteCall("0x03")];

  const firstDecision = await freeTransactions.evaluateFreeTransactionAllowance(buildRequest(firstCalls) as never);
  assert.equal(firstDecision.isAllowed, true);
  if (!firstDecision.isAllowed) return;
  assert.equal(firstDecision.summary.used, 1);
  assert.equal(firstDecision.summary.remaining, 1);

  const quotaAfterFirst = await dbModule.dbClient.execute("SELECT free_tx_used FROM free_transaction_quotas");
  assert.equal(Number(quotaAfterFirst.rows[0]?.free_tx_used), 0);

  const repeatedDecision = await freeTransactions.evaluateFreeTransactionAllowance(buildRequest(firstCalls) as never);
  assert.equal(repeatedDecision.isAllowed, true);
  if (!repeatedDecision.isAllowed) return;
  assert.equal(repeatedDecision.summary.used, 1);
  assert.equal(repeatedDecision.summary.remaining, 1);

  const secondDecision = await freeTransactions.evaluateFreeTransactionAllowance(buildRequest(secondCalls) as never);
  assert.equal(secondDecision.isAllowed, true);
  if (!secondDecision.isAllowed) return;
  assert.equal(secondDecision.summary.used, 2);
  assert.equal(secondDecision.summary.remaining, 0);

  const deniedDecision = await freeTransactions.evaluateFreeTransactionAllowance(buildRequest(thirdCalls) as never);
  assert.equal(deniedDecision.isAllowed, false);
  if (deniedDecision.isAllowed) return;
  assert.equal(deniedDecision.debugCode, "free_tx_exhausted");
  assert.equal(deniedDecision.summary?.used, 2);
});

test("confirm increments confirmed quota exactly once", async () => {
  const calls = [voteCall("0x04")];
  const initialDecision = await freeTransactions.evaluateFreeTransactionAllowance(buildRequest(calls) as never);
  assert.equal(initialDecision.isAllowed, true);
  if (!initialDecision.isAllowed) return;
  assert.equal(initialDecision.summary.used, 1);

  await freeTransactions.confirmFreeTransactionReservation({
    address: WALLET,
    chainId: CHAIN_ID,
    operationKey: buildOperationKey(calls),
    transactionHashes: [SUCCESS_HASH],
  });

  await freeTransactions.confirmFreeTransactionReservation({
    address: WALLET,
    chainId: CHAIN_ID,
    operationKey: buildOperationKey(calls),
    transactionHashes: [SUCCESS_HASH],
  });

  const quotaRows = await dbModule.dbClient.execute("SELECT free_tx_used FROM free_transaction_quotas");
  assert.equal(Number(quotaRows.rows[0]?.free_tx_used), 1);

  const reservationRows = await dbModule.dbClient.execute("SELECT status FROM free_transaction_reservations");
  assert.equal(reservationRows.rows[0]?.status, "confirmed");

  const repeatedDecision = await freeTransactions.evaluateFreeTransactionAllowance(buildRequest(calls) as never);
  assert.equal(repeatedDecision.isAllowed, true);
  if (!repeatedDecision.isAllowed) return;
  assert.equal(repeatedDecision.summary.used, 1);
  assert.equal(repeatedDecision.summary.remaining, 1);
});

test("confirm accepts relayed 7702 receipts when the executed event proves the wallet", async () => {
  const calls = [voteCall("0x0a")];
  const initialDecision = await freeTransactions.evaluateFreeTransactionAllowance(buildRequest(calls) as never);
  assert.equal(initialDecision.isAllowed, true);

  freeTransactions.__setFreeTransactionTestOverridesForTests({
    getTransactionVerificationClient: async () => ({
      getTransaction: async () => ({
        chainId: CHAIN_ID,
        from: EXECUTOR,
      }),
      getTransactionReceipt: async () => ({
        logs: [buildExecutedEventLog(WALLET)],
        status: "success",
      }),
    }),
    resolveVoterIdTokenId: async () => "42",
  });

  await freeTransactions.confirmFreeTransactionReservation({
    address: WALLET,
    chainId: CHAIN_ID,
    operationKey: buildOperationKey(calls),
    transactionHashes: [SUCCESS_HASH],
  });

  const quotaRows = await dbModule.dbClient.execute("SELECT free_tx_used FROM free_transaction_quotas");
  assert.equal(Number(quotaRows.rows[0]?.free_tx_used), 1);
});

test("confirm accepts relayed 4337 receipts when the user operation event proves the wallet", async () => {
  const calls = [voteCall("0x0b")];
  const initialDecision = await freeTransactions.evaluateFreeTransactionAllowance(buildRequest(calls) as never);
  assert.equal(initialDecision.isAllowed, true);

  freeTransactions.__setFreeTransactionTestOverridesForTests({
    getTransactionVerificationClient: async () => ({
      getTransaction: async () => ({
        chainId: CHAIN_ID,
        from: ENTRY_POINT,
      }),
      getTransactionReceipt: async () => ({
        logs: [buildUserOperationEventLog(WALLET)],
        status: "success",
      }),
    }),
    resolveVoterIdTokenId: async () => "42",
  });

  await freeTransactions.confirmFreeTransactionReservation({
    address: WALLET,
    chainId: CHAIN_ID,
    operationKey: buildOperationKey(calls),
    transactionHashes: [SUCCESS_HASH],
  });

  const quotaRows = await dbModule.dbClient.execute("SELECT free_tx_used FROM free_transaction_quotas");
  assert.equal(Number(quotaRows.rows[0]?.free_tx_used), 1);
});

test("confirm still rejects relayed receipts without wallet execution proof", async () => {
  const calls = [voteCall("0x0c")];
  const initialDecision = await freeTransactions.evaluateFreeTransactionAllowance(buildRequest(calls) as never);
  assert.equal(initialDecision.isAllowed, true);

  freeTransactions.__setFreeTransactionTestOverridesForTests({
    getTransactionVerificationClient: async () => ({
      getTransaction: async () => ({
        chainId: CHAIN_ID,
        from: EXECUTOR,
      }),
      getTransactionReceipt: async () => ({
        logs: [],
        status: "success",
      }),
    }),
    resolveVoterIdTokenId: async () => "42",
  });

  await assert.rejects(
    freeTransactions.confirmFreeTransactionReservation({
      address: WALLET,
      chainId: CHAIN_ID,
      operationKey: buildOperationKey(calls),
      transactionHashes: [SUCCESS_HASH],
    }),
    /could not be verified/i,
  );
});

test("expired pending reservations release held capacity for new operations", async () => {
  const expiredCalls = [voteCall("0x05")];
  const freshCalls = [voteCall("0x06")];

  const initialDecision = await freeTransactions.evaluateFreeTransactionAllowance(buildRequest(expiredCalls) as never);
  assert.equal(initialDecision.isAllowed, true);

  await dbModule.dbClient.execute({
    sql: "UPDATE free_transaction_reservations SET expires_at = ?",
    args: [new Date(Date.now() - 60_000)],
  });

  const freshDecision = await freeTransactions.evaluateFreeTransactionAllowance(buildRequest(freshCalls) as never);
  assert.equal(freshDecision.isAllowed, true);
  if (!freshDecision.isAllowed) return;
  assert.equal(freshDecision.summary.used, 1);
  assert.equal(freshDecision.summary.remaining, 1);

  const quotaRows = await dbModule.dbClient.execute("SELECT free_tx_used FROM free_transaction_quotas");
  assert.equal(Number(quotaRows.rows[0]?.free_tx_used), 0);
});

test("supported sponsored operation families are allowlisted", async () => {
  const supportedCases = [
    [voteCall("0x07")],
    [
      encodeCall(crepContract, "approve", [contentRegistryContract.address, 10n]),
      encodeCall(contentRegistryContract, "reserveSubmission", [`0x${"1".repeat(64)}`]),
    ],
    [encodeCall(contentRegistryContract, "cancelReservedSubmission", [`0x${"2".repeat(64)}`])],
    [
      encodeCall(crepContract, "approve", [categoryRegistryContract.address, 10n]),
      encodeCall(categoryRegistryContract, "submitCategory", ["Security", "security.example", ["Smart Contracts"]]),
    ],
    [encodeCall(frontendRegistryContract, "register")],
    [encodeCall(frontendRegistryContract, "claimFees")],
    [encodeCall(rewardDistributorContract, "claimFrontendFee", [1n, 1n, WALLET])],
  ] as const;

  for (const calls of supportedCases) {
    const decision = await freeTransactions.evaluateFreeTransactionAllowance(buildRequest(calls) as never);
    assert.equal(decision.isAllowed, true);

    await dbModule.dbClient.execute("DELETE FROM free_transaction_reservations");
    await dbModule.dbClient.execute("DELETE FROM free_transaction_quotas");
  }
});

test("rejects token approvals to unsupported spenders", async () => {
  const decision = await freeTransactions.evaluateFreeTransactionAllowance(
    buildRequest([encodeCall(crepContract, "approve", [WALLET, 10n])]) as never,
  );

  assert.equal(decision.isAllowed, false);
  if (decision.isAllowed) return;
  assert.equal(decision.debugCode, "unsupported_operation");
});

test("rejects arbitrary token methods even on allowlisted contracts", async () => {
  const decision = await freeTransactions.evaluateFreeTransactionAllowance(
    buildRequest([encodeCall(crepContract, "transfer", [WALLET, 10n])]) as never,
  );

  assert.equal(decision.isAllowed, false);
  if (decision.isAllowed) return;
  assert.equal(decision.debugCode, "unsupported_operation");
});

test("rejects nonzero call values for sponsored operations", async () => {
  const decision = await freeTransactions.evaluateFreeTransactionAllowance(
    buildRequest([encodeCall(frontendRegistryContract, "register", [], "0x1")]) as never,
  );

  assert.equal(decision.isAllowed, false);
  if (decision.isAllowed) return;
  assert.equal(decision.debugCode, "unsupported_operation");
});

test("confirm leaves the reservation pending when receipt verification fails", async () => {
  const calls = [voteCall("0x08")];
  const initialDecision = await freeTransactions.evaluateFreeTransactionAllowance(buildRequest(calls) as never);
  assert.equal(initialDecision.isAllowed, true);

  freeTransactions.__setFreeTransactionTestOverridesForTests({
    allTransactionHashesSucceeded: async () => false,
    resolveVoterIdTokenId: async () => "42",
  });

  await assert.rejects(
    freeTransactions.confirmFreeTransactionReservation({
      address: WALLET,
      chainId: CHAIN_ID,
      operationKey: buildOperationKey(calls),
      transactionHashes: [SUCCESS_HASH],
    }),
    /could not be verified/i,
  );

  const quotaRows = await dbModule.dbClient.execute("SELECT free_tx_used FROM free_transaction_quotas");
  assert.equal(Number(quotaRows.rows[0]?.free_tx_used), 0);

  const reservationRows = await dbModule.dbClient.execute("SELECT status FROM free_transaction_reservations");
  assert.equal(reservationRows.rows[0]?.status, "pending");
});

test("confirm fails open when the quota store is unavailable after receipts verify", async () => {
  const calls = [voteCall("0x0d")];
  const initialDecision = await freeTransactions.evaluateFreeTransactionAllowance(buildRequest(calls) as never);
  assert.equal(initialDecision.isAllowed, true);

  dbModule.__setDatabaseResourcesForTests(createStoreUnavailableResources(memoryResources));

  try {
    await freeTransactions.confirmFreeTransactionReservation({
      address: WALLET,
      chainId: CHAIN_ID,
      operationKey: buildOperationKey(calls),
      transactionHashes: [SUCCESS_HASH],
    });
  } finally {
    dbModule.__setDatabaseResourcesForTests(memoryResources);
  }

  const quotaRows = await dbModule.dbClient.execute("SELECT free_tx_used FROM free_transaction_quotas");
  assert.equal(Number(quotaRows.rows[0]?.free_tx_used), 0);

  const reservationRows = await dbModule.dbClient.execute("SELECT status FROM free_transaction_reservations");
  assert.equal(reservationRows.rows[0]?.status, "pending");
});

test("summary fails open for verified voters when the quota store is unavailable", async () => {
  dbModule.__setDatabaseResourcesForTests(createStoreUnavailableResources(memoryResources));

  try {
    const summary = await freeTransactions.getFreeTransactionAllowanceSummary({
      address: WALLET,
      chainId: CHAIN_ID,
    });

    assert.deepEqual(summary, {
      chainId: CHAIN_ID,
      environment: "test",
      limit: 2,
      used: 0,
      remaining: 2,
      verified: true,
      exhausted: false,
      walletAddress: "0x1234567890AbcdEF1234567890aBcdef12345678",
      voterIdTokenId: "42",
    });
  } finally {
    dbModule.__setDatabaseResourcesForTests(memoryResources);
  }
});

test("verifier fails open for verified voters when the quota store is unavailable", async () => {
  dbModule.__setDatabaseResourcesForTests(createStoreUnavailableResources(memoryResources));

  try {
    const decision = await freeTransactions.evaluateFreeTransactionAllowance(buildRequest([voteCall("0x09")]) as never);

    assert.equal(decision.isAllowed, true);
    if (!decision.isAllowed) return;
    assert.equal(decision.debugCode, "store_unavailable_fail_open");
    assert.deepEqual(decision.summary, {
      chainId: CHAIN_ID,
      environment: "test",
      limit: 2,
      used: 0,
      remaining: 2,
      verified: true,
      exhausted: false,
      walletAddress: "0x1234567890AbcdEF1234567890aBcdef12345678",
      voterIdTokenId: "42",
    });
  } finally {
    dbModule.__setDatabaseResourcesForTests(memoryResources);
  }
});
