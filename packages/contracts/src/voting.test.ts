import assert from "node:assert/strict";
import test from "node:test";
import { encodeAbiParameters } from "viem";
import {
  buildCommitHash,
  createTlockVoteCommit,
  decodeVoteTransferPayload,
  encodeVoteTransferPayload,
  parseTlockCiphertextMetadata,
} from "./voting";

const fakeClient = {
  chain: () => ({
    info: async () => ({
      period: 3,
      genesis_time: 1692803367,
      hash: "52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971",
    }),
  }),
} as any;

const fakeNow = () => 1692803367 * 1000;

function makeFakeArmoredTlockCiphertext(params: {
  targetRound: bigint;
  drandChainHash: `0x${string}`;
  plaintextMarker: string;
}): `0x${string}` {
  const agePayload = [
    "age-encryption.org/v1",
    `-> tlock ${params.targetRound.toString()} ${params.drandChainHash.slice(2)}`,
    "abc",
    "--- mac",
    params.plaintextMarker,
  ].join("\n");

  return `0x${Buffer.from(
    [
      "-----BEGIN AGE ENCRYPTED FILE-----",
      Buffer.from(agePayload, "binary").toString("base64"),
      "-----END AGE ENCRYPTED FILE-----",
      "",
    ].join("\n"),
    "utf-8",
  ).toString("hex")}` as `0x${string}`;
}

test("parseTlockCiphertextMetadata extracts round and chain hash from the armored payload", () => {
  const drandChainHash = ("0x" + "ab".repeat(32)) as `0x${string}`;
  const ciphertext = makeFakeArmoredTlockCiphertext({
    targetRound: 123n,
    drandChainHash,
    plaintextMarker: "1:" + "11".repeat(32),
  });

  assert.deepEqual(parseTlockCiphertextMetadata(ciphertext), {
    targetRound: 123n,
    drandChainHash,
  });
});

test("buildCommitHash remains backward-compatible for legacy four-field callers", () => {
  const salt = ("0x" + "22".repeat(32)) as `0x${string}`;
  const ciphertext = "0x1234" as `0x${string}`;

  const commitHash = buildCommitHash(false, salt, 42n, ciphertext);

  assert.equal(commitHash, buildCommitHash(false, salt, 42n, ciphertext));
});

test("encodeVoteTransferPayload round-trips the redeployed vote shape", () => {
  const payload = encodeVoteTransferPayload({
    contentId: 42n,
    commitHash: ("0x" + "11".repeat(32)) as `0x${string}`,
    ciphertext: "0x1234" as `0x${string}`,
    targetRound: 123n,
    drandChainHash: ("0x" + "22".repeat(32)) as `0x${string}`,
    frontend: "0x3333333333333333333333333333333333333333",
  });

  assert.deepEqual(decodeVoteTransferPayload(payload), {
    contentId: 42n,
    commitHash: "0x" + "11".repeat(32),
    ciphertext: "0x1234",
    targetRound: 123n,
    drandChainHash: "0x" + "22".repeat(32),
    frontend: "0x3333333333333333333333333333333333333333",
  });
});

test("decodeVoteTransferPayload tolerates the temporary six-field misordering", () => {
  const payload = encodeAbiParameters(
    [
      { name: "contentId", type: "uint256" },
      { name: "commitHash", type: "bytes32" },
      { name: "ciphertext", type: "bytes" },
      { name: "targetRound", type: "uint64" },
      { name: "drandChainHash", type: "bytes32" },
      { name: "frontend", type: "address" },
    ],
    [
      42n,
      ("0x" + "11".repeat(32)) as `0x${string}`,
      makeFakeArmoredTlockCiphertext({
        targetRound: 123n,
        drandChainHash: ("0x" + "22".repeat(32)) as `0x${string}`,
        plaintextMarker: "1:" + "11".repeat(32),
      }),
      123n,
      ("0x" + "22".repeat(32)) as `0x${string}`,
      "0x3333333333333333333333333333333333333333",
    ],
  );

  assert.deepEqual(decodeVoteTransferPayload(payload), {
    contentId: 42n,
    commitHash: "0x" + "11".repeat(32),
    ciphertext: makeFakeArmoredTlockCiphertext({
      targetRound: 123n,
      drandChainHash: ("0x" + "22".repeat(32)) as `0x${string}`,
      plaintextMarker: "1:" + "11".repeat(32),
    }),
    targetRound: 123n,
    drandChainHash: "0x" + "22".repeat(32),
    frontend: "0x3333333333333333333333333333333333333333",
  });
});

test("encodeVoteTransferPayload preserves the legacy payload when metadata is omitted", () => {
  const payload = encodeVoteTransferPayload({
    contentId: 42n,
    commitHash: ("0x" + "11".repeat(32)) as `0x${string}`,
    ciphertext: "0x1234" as `0x${string}`,
    frontend: "0x3333333333333333333333333333333333333333",
  });

  assert.deepEqual(decodeVoteTransferPayload(payload), {
    contentId: 42n,
    commitHash: "0x" + "11".repeat(32),
    ciphertext: "0x1234",
    frontend: "0x3333333333333333333333333333333333333333",
  });
});

test("createTlockVoteCommit returns the tlock metadata used in the commit hash", async () => {
  const commit = await createTlockVoteCommit(
    {
      voter: "0x2222222222222222222222222222222222222222",
      isUp: true,
      salt: ("0x" + "33".repeat(32)) as `0x${string}`,
      contentId: 7n,
      epochDurationSeconds: 1200,
    },
    {
      client: fakeClient,
      now: fakeNow,
      encryptFn: async (targetRound, payload) => {
        const marker = payload[0] === 1 ? "1" : "0";
        const plaintextMarker = `${marker}:${Buffer.from(payload.slice(1)).toString("hex")}`;
        const agePayload = [
          "age-encryption.org/v1",
          `-> tlock ${targetRound} ${"52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971"}`,
          "abc",
          "--- mac",
          plaintextMarker,
        ].join("\n");
        return agePayload;
      },
    },
  );

  assert.equal(commit.targetRound > 0n, true);
  assert.equal(commit.drandChainHash, "0x52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971");
  assert.equal(
    commit.commitHash,
    buildCommitHash(true, ("0x" + "33".repeat(32)) as `0x${string}`, 7n, commit.targetRound, commit.drandChainHash, commit.ciphertext),
  );
});
