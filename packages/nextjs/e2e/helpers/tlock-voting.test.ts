import assert from "node:assert/strict";
import test from "node:test";
import { buildCommitHash, buildCommitKey, decodeVoteTransferPayload } from "@curyo/contracts/voting";
import { createTlockVoteCommit, encodeVoteTransferPayload } from "./tlock-voting";

const CHAIN_INFO = {
  hash: "52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971",
  genesis_time: 1_692_803_367,
  period: 3,
};

const runtime = {
  client: {
    chain() {
      return {
        async info() {
          return CHAIN_INFO;
        },
      };
    },
  } as any,
  now: () => 1_750_000_000_000,
  encryptFn: async (targetRound: number, payload: Uint8Array) =>
    `age:${targetRound}:${Buffer.from(payload).toString("hex")}`,
};

test("createTlockVoteCommit builds the expected deterministic commit fixture", async () => {
  const commit = await createTlockVoteCommit(
    {
      voter: "0x1234567890abcdef1234567890abcdef12345678",
      isUp: true,
      salt: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      contentId: 42n,
      roundReferenceRatingBps: 5_000,
      epochDurationSeconds: 300,
    },
    runtime,
  );

  const expectedCommitHash = buildCommitHash(
    true,
    "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    42n,
    5_000,
    19_065_645n,
    "0x52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971",
    "0x6167653a31393036353634353a303161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161",
  );

  assert.deepEqual(commit, {
    ciphertext: "0x6167653a31393036353634353a303161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161",
    commitHash: expectedCommitHash,
    targetRound: 19_065_645n,
    drandChainHash: "0x52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971",
    roundReferenceRatingBps: 5_000,
    commitKey: buildCommitKey("0x1234567890abcdef1234567890abcdef12345678", expectedCommitHash),
  });
});

test("encodeVoteTransferPayload ABI-encodes the expected transfer payload", () => {
  const payload = encodeVoteTransferPayload({
    contentId: 42n,
    roundReferenceRatingBps: 5_000,
    commitHash: "0x56ef4c219148992d51ad545d2971ef768b7eb2ea48b0f8b8fa7120d304a68428",
    ciphertext: "0x6167653a31393036353634353a303161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161",
    frontend: "0x0000000000000000000000000000000000000000",
    targetRound: 19_065_645n,
    drandChainHash: "0x52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971",
  });

  assert.deepEqual(decodeVoteTransferPayload(payload), {
    contentId: 42n,
    roundReferenceRatingBps: 5_000,
    commitHash: "0x56ef4c219148992d51ad545d2971ef768b7eb2ea48b0f8b8fa7120d304a68428",
    ciphertext: "0x6167653a31393036353634353a303161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161",
    frontend: "0x0000000000000000000000000000000000000000",
    targetRound: 19_065_645n,
    drandChainHash: "0x52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971",
  });
});
