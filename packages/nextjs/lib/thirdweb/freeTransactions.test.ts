import deployedContracts from "@curyo/contracts/deployedContracts";
import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";

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
type DbTestMemoryModule = typeof import("../db/testMemory");
type FreeTransactionsModule = typeof import("./freeTransactions");
type OperationModule = typeof import("./freeTransactionOperation");

const CHAIN_ID = 31337;
const SUCCESS_HASH = `0x${"1".repeat(64)}` as const;
const WALLET = "0x1234567890abcdef1234567890abcdef12345678" as const;
const contractsForChain = (deployedContracts as Record<number, Record<string, { address: `0x${string}` }>>)[CHAIN_ID];
const TARGET_ADDRESS = (contractsForChain.CuryoReputation ?? contractsForChain.ProtocolConfig).address;

let dbModule: DbModule;
let dbTestMemory: DbTestMemoryModule;
let freeTransactions: FreeTransactionsModule;
let operationModule: OperationModule;

function buildRequest(callData: `0x${string}`) {
  return {
    chainId: CHAIN_ID,
    userOp: {
      sender: WALLET,
      data: {
        targets: [TARGET_ADDRESS],
        callDatas: [callData],
        values: ["0x0"],
      },
    },
  };
}

function buildOperationKey(callData: `0x${string}`) {
  const operationKey = operationModule.buildFreeTransactionOperationKey({
    chainId: CHAIN_ID,
    calls: [{ data: callData, to: TARGET_ADDRESS, value: "0x0" }],
    sender: WALLET,
  });

  assert.ok(operationKey, "operation key should be derived from the verifier payload");
  return operationKey;
}

before(async () => {
  dbModule = await import("../db");
  dbTestMemory = await import("../db/testMemory");
  dbModule.__setDatabaseResourcesForTests(dbTestMemory.createMemoryDatabaseResources());
  freeTransactions = await import("./freeTransactions");
  operationModule = await import("./freeTransactionOperation");
});

beforeEach(async () => {
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

test("pending reservations keep the same operation idempotent without charging quota twice", async () => {
  const firstDecision = await freeTransactions.evaluateFreeTransactionAllowance(buildRequest("0x01") as never);
  assert.equal(firstDecision.isAllowed, true);
  if (!firstDecision.isAllowed) {
    return;
  }

  assert.equal(firstDecision.summary.used, 1);
  assert.equal(firstDecision.summary.remaining, 1);

  const repeatedDecision = await freeTransactions.evaluateFreeTransactionAllowance(buildRequest("0x01") as never);
  assert.equal(repeatedDecision.isAllowed, true);
  if (!repeatedDecision.isAllowed) {
    return;
  }

  assert.equal(repeatedDecision.summary.used, 1);
  assert.equal(repeatedDecision.summary.remaining, 1);

  const reservationRows = await dbModule.dbClient.execute("SELECT status FROM free_transaction_reservations");
  assert.equal(reservationRows.rows[0]?.status, "pending");

  const secondDecision = await freeTransactions.evaluateFreeTransactionAllowance(buildRequest("0x02") as never);
  assert.equal(secondDecision.isAllowed, true);
  if (!secondDecision.isAllowed) {
    return;
  }

  assert.equal(secondDecision.summary.used, 2);
  assert.equal(secondDecision.summary.remaining, 0);

  const deniedDecision = await freeTransactions.evaluateFreeTransactionAllowance(buildRequest("0x03") as never);
  assert.equal(deniedDecision.isAllowed, false);
  if (deniedDecision.isAllowed) {
    return;
  }

  assert.equal(deniedDecision.debugCode, "free_tx_exhausted");
  assert.equal(deniedDecision.summary?.used, 2);
});

test("confirm marks the reservation but does not charge quota twice", async () => {
  const initialDecision = await freeTransactions.evaluateFreeTransactionAllowance(buildRequest("0x04") as never);
  assert.equal(initialDecision.isAllowed, true);
  if (!initialDecision.isAllowed) {
    return;
  }

  assert.equal(initialDecision.summary.used, 1);

  const operationKey = buildOperationKey("0x04");
  await freeTransactions.confirmFreeTransactionReservation({
    address: WALLET,
    chainId: CHAIN_ID,
    operationKey,
    transactionHashes: [SUCCESS_HASH],
  });

  await freeTransactions.confirmFreeTransactionReservation({
    address: WALLET,
    chainId: CHAIN_ID,
    operationKey,
    transactionHashes: [SUCCESS_HASH],
  });

  const quotaRows = await dbModule.dbClient.execute("SELECT free_tx_used FROM free_transaction_quotas");
  assert.equal(Number(quotaRows.rows[0]?.free_tx_used), 1);

  const reservationRows = await dbModule.dbClient.execute("SELECT status FROM free_transaction_reservations");
  assert.equal(reservationRows.rows[0]?.status, "confirmed");

  const repeatedDecision = await freeTransactions.evaluateFreeTransactionAllowance(buildRequest("0x04") as never);
  assert.equal(repeatedDecision.isAllowed, true);
  if (!repeatedDecision.isAllowed) {
    return;
  }

  assert.equal(repeatedDecision.summary.used, 1);
  assert.equal(repeatedDecision.summary.remaining, 1);
});

test("confirm keeps the reservation pending when receipt verification fails", async () => {
  const initialDecision = await freeTransactions.evaluateFreeTransactionAllowance(buildRequest("0x05") as never);
  assert.equal(initialDecision.isAllowed, true);
  if (!initialDecision.isAllowed) {
    return;
  }

  freeTransactions.__setFreeTransactionTestOverridesForTests({
    allTransactionHashesSucceeded: async () => false,
    resolveVoterIdTokenId: async () => "42",
  });

  await assert.rejects(
    freeTransactions.confirmFreeTransactionReservation({
      address: WALLET,
      chainId: CHAIN_ID,
      operationKey: buildOperationKey("0x05"),
      transactionHashes: [SUCCESS_HASH],
    }),
    /could not be verified/i,
  );

  const quotaRows = await dbModule.dbClient.execute("SELECT free_tx_used FROM free_transaction_quotas");
  assert.equal(Number(quotaRows.rows[0]?.free_tx_used), 1);

  const reservationRows = await dbModule.dbClient.execute("SELECT status FROM free_transaction_reservations");
  assert.equal(reservationRows.rows[0]?.status, "pending");
});
