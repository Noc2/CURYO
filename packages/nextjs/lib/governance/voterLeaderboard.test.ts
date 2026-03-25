import { buildVoterLeaderboardEntries, rankVoterLeaderboardAddresses } from "./voterLeaderboard";
import assert from "node:assert/strict";
import test from "node:test";

test("voter leaderboard totalCount reflects the full ranked set", () => {
  const topAddress = "0x00000000000000000000000000000000000000bb";
  const includedAddress = "0x00000000000000000000000000000000000000cc";

  const { rankedAddresses, selectedAddresses, totalCount } = rankVoterLeaderboardAddresses({
    candidateAddresses: ["0x00000000000000000000000000000000000000aa", topAddress, includedAddress],
    balances: {
      "0x00000000000000000000000000000000000000aa": 0n,
      [topAddress]: 10n,
      [includedAddress]: 0n,
    },
    limit: 1,
    includeAddress: includedAddress,
  });

  assert.equal(totalCount, 2);
  assert.deepEqual(selectedAddresses, [topAddress, includedAddress]);

  const page = buildVoterLeaderboardEntries({
    rankedAddresses,
    selectedAddresses,
    balances: {
      [topAddress]: 10n,
      [includedAddress]: 0n,
    },
    profiles: {
      [topAddress]: { username: "top" },
      [includedAddress]: { username: "included" },
    },
  });

  assert.equal(page.totalCount, 2);
  assert.deepEqual(page.entries, [
    {
      rank: 1,
      address: topAddress,
      username: "top",
      balance: "10",
    },
    {
      rank: 2,
      address: includedAddress,
      username: "included",
      balance: "0",
    },
  ]);
});

test("voter leaderboard falls back to discovered addresses when every balance is zero", () => {
  const { rankedAddresses, selectedAddresses, totalCount } = rankVoterLeaderboardAddresses({
    candidateAddresses: ["0x00000000000000000000000000000000000000bb", "0x00000000000000000000000000000000000000aa"],
    balances: {
      "0x00000000000000000000000000000000000000aa": 0n,
      "0x00000000000000000000000000000000000000bb": 0n,
    },
    limit: 10,
    includeAddress: null,
  });

  assert.equal(totalCount, 2);
  assert.deepEqual(rankedAddresses, [
    "0x00000000000000000000000000000000000000aa",
    "0x00000000000000000000000000000000000000bb",
  ]);
  assert.deepEqual(selectedAddresses, rankedAddresses);
});
