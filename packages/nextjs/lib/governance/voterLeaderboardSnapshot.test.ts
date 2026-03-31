import {
  type VoterLeaderboardSnapshot,
  __resetVoterLeaderboardSnapshotForTests,
  getVoterLeaderboardSnapshot,
  resolveVoterLeaderboardSelection,
} from "./voterLeaderboardSnapshot";
import assert from "node:assert/strict";
import { test } from "node:test";

const ADDRESS_A = "0x00000000000000000000000000000000000000aa";
const ADDRESS_B = "0x00000000000000000000000000000000000000bb";
const ADDRESS_C = "0x00000000000000000000000000000000000000cc";

test("getVoterLeaderboardSnapshot reuses a fresh cached snapshot", async () => {
  __resetVoterLeaderboardSnapshotForTests();

  let listCalls = 0;
  let balanceCalls = 0;
  let now = 1_000;

  const listTokenHolders = async () => {
    listCalls += 1;
    return [{ address: ADDRESS_A }, { address: ADDRESS_B }];
  };

  const readBalances = async (addresses: string[]) => {
    balanceCalls += 1;
    return Object.fromEntries(
      addresses.map(address => [address.toLowerCase(), address.toLowerCase() === ADDRESS_A ? 5n : 3n]),
    );
  };

  const first = await getVoterLeaderboardSnapshot({
    cacheTtlMs: 60_000,
    listTokenHolders,
    now: () => now,
    readBalances,
  });

  now = 5_000;

  const second = await getVoterLeaderboardSnapshot({
    cacheTtlMs: 60_000,
    listTokenHolders,
    now: () => now,
    readBalances,
  });

  assert.equal(listCalls, 1);
  assert.equal(balanceCalls, 1);
  assert.equal(second, first);
});

test("getVoterLeaderboardSnapshot single-flights concurrent refreshes", async () => {
  __resetVoterLeaderboardSnapshotForTests();

  let listCalls = 0;
  let resolveHolders: ((value: Array<{ address: string }>) => void) | null = null;
  const holdersPromise = new Promise<Array<{ address: string }>>(resolve => {
    resolveHolders = resolve;
  });

  const readBalances = async (addresses: string[]) =>
    Object.fromEntries(addresses.map(address => [address.toLowerCase(), 1n]));

  const firstPromise = getVoterLeaderboardSnapshot({
    listTokenHolders: async () => {
      listCalls += 1;
      return holdersPromise;
    },
    readBalances,
  });

  const secondPromise = getVoterLeaderboardSnapshot({
    listTokenHolders: async () => {
      listCalls += 1;
      return holdersPromise;
    },
    readBalances,
  });

  resolveHolders?.([{ address: ADDRESS_A }]);

  const [first, second] = await Promise.all([firstPromise, secondPromise]);

  assert.equal(listCalls, 1);
  assert.deepEqual(first.rankedAddresses, [ADDRESS_A]);
  assert.equal(second, first);
});

test("resolveVoterLeaderboardSelection appends a missing includeAddress without rebuilding the full snapshot", async () => {
  const snapshot: VoterLeaderboardSnapshot = {
    balances: {
      [ADDRESS_A]: 9n,
      [ADDRESS_B]: 5n,
    },
    fetchedAt: 0,
    rankedAddresses: [ADDRESS_A, ADDRESS_B],
    ranks: {
      [ADDRESS_A]: 1,
      [ADDRESS_B]: 2,
    },
    totalCount: 2,
  };

  const selection = await resolveVoterLeaderboardSelection(
    snapshot,
    {
      includeAddress: ADDRESS_C,
      limit: 1,
    },
    {
      readBalances: async () => ({
        [ADDRESS_C]: 7n,
      }),
    },
  );

  assert.deepEqual(selection.selectedAddresses, [ADDRESS_A, ADDRESS_C]);
  assert.equal(selection.ranks[ADDRESS_A], 1);
  assert.equal(selection.ranks[ADDRESS_C], 2);
  assert.equal(selection.totalCount, 3);
  assert.equal(selection.balances[ADDRESS_C], 7n);
});
