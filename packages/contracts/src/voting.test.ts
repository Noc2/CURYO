import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCommitHash,
  createTlockVoteCommit,
  deriveVoteTlockRevealAvailableAtSeconds,
  decodeVoteTransferPayload,
  encodeVoteTransferPayload,
  getVoteTlockChainInfo,
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

function chunkBase64(input: string, chunkSize = 64): string {
  const chunks: string[] = [];
  for (let i = 0; i < input.length; i += chunkSize) {
    chunks.push(input.slice(i, i + chunkSize));
  }
  return chunks.join("\n");
}

function toUnpaddedBase64(input: Buffer | string): string {
  return Buffer.from(input).toString("base64").replace(/=+$/u, "");
}

function makeFakeArmoredTlockCiphertext(params: {
  targetRound: bigint;
  drandChainHash: `0x${string}`;
  plaintextMarker: string;
}): `0x${string}` {
  const encryptedBody = Buffer.concat([
    Buffer.from(params.plaintextMarker, "utf8"),
    Buffer.alloc(Math.max(0, 65 - Buffer.byteLength(params.plaintextMarker, "utf8")), 0x58),
  ]);
  const recipientBody = chunkBase64(toUnpaddedBase64(Buffer.alloc(128, 0x42)));
  const mac = toUnpaddedBase64(Buffer.alloc(32, 0x24));
  const agePayload = Buffer.concat([
    Buffer.from(
      [
        "age-encryption.org/v1",
        `-> tlock ${params.targetRound.toString()} ${params.drandChainHash.slice(2)}`,
        recipientBody,
        `--- ${mac}`,
        "",
      ].join("\n"),
      "utf8",
    ),
    encryptedBody,
  ]);

  return `0x${Buffer.from(
    [
      "-----BEGIN AGE ENCRYPTED FILE-----",
      chunkBase64(agePayload.toString("base64")),
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

test("parseTlockCiphertextMetadata rejects shallow pseudo-tlock envelopes", () => {
  const ciphertext = `0x${Buffer.from(
    [
      "-----BEGIN AGE ENCRYPTED FILE-----",
      Buffer.from(
        [
          "age-encryption.org/v1",
          `-> tlock 123 ${"ab".repeat(32)}`,
          "payload 1:" + "11".repeat(32),
          "--- bWFj",
        ].join("\n"),
        "binary",
      ).toString("base64"),
      "-----END AGE ENCRYPTED FILE-----",
      "",
    ].join("\n"),
    "utf-8",
  ).toString("hex")}` as `0x${string}`;

  assert.equal(parseTlockCiphertextMetadata(ciphertext), null);
});

test("parseTlockCiphertextMetadata rejects unchunked AGE armor lines", () => {
  const drandChainHash = ("0x" + "ab".repeat(32)) as `0x${string}`;
  const ciphertext = makeFakeArmoredTlockCiphertext({
    targetRound: 123n,
    drandChainHash,
    plaintextMarker: "1:" + "11".repeat(32),
  });
  const armored = Buffer.from(ciphertext.slice(2), "hex").toString("utf8");
  const lines = armored.trimEnd().split("\n");
  const decodedPayload = Buffer.from(lines.slice(1, -1).join(""), "base64");
  const unchunked = `0x${Buffer.from(
    [
      "-----BEGIN AGE ENCRYPTED FILE-----",
      decodedPayload.toString("base64"),
      "-----END AGE ENCRYPTED FILE-----",
      "",
    ].join("\n"),
    "utf8",
  ).toString("hex")}` as `0x${string}`;

  assert.equal(parseTlockCiphertextMetadata(unchunked), null);
});

test("parseTlockCiphertextMetadata accepts a chunked armor payload whose final line is exactly 64 chars", () => {
  const drandChainHash = ("0x" + "ab".repeat(32)) as `0x${string}`;
  const salt = "11".repeat(32);
  const targetRound = 123n;
  const recipientBody = Buffer.alloc(80);
  recipientBody.writeBigUInt64BE(targetRound, 24);
  Buffer.from(drandChainHash.slice(2), "hex").copy(recipientBody, 32);
  const mac = toUnpaddedBase64(Buffer.alloc(32, 0x24));
  const payloadPrefix = [
    "age-encryption.org/v1",
    `-> tlock ${targetRound.toString()} ${drandChainHash.slice(2)}`,
    chunkBase64(toUnpaddedBase64(recipientBody)),
    `--- ${mac}`,
  ].join("\n");

  let filler = "";
  let armoredPayload = "";
  for (let fillerLength = 0; fillerLength < 64; fillerLength++) {
    const candidatePayload = Buffer.from(`${payloadPrefix}\npayload u:${salt}\n${"X".repeat(fillerLength)}`, "utf8");
    const candidateArmoredPayload = candidatePayload.toString("base64");
    if ((candidateArmoredPayload.length % 64 || 64) === 64) {
      filler = "X".repeat(fillerLength);
      armoredPayload = candidateArmoredPayload;
      break;
    }
  }

  assert.notEqual(armoredPayload, "");
  const finalLineLength = armoredPayload.length % 64 || 64;
  assert.equal(finalLineLength, 64);

  const ciphertext = `0x${Buffer.from(
    [
      "-----BEGIN AGE ENCRYPTED FILE-----",
      chunkBase64(armoredPayload),
      "-----END AGE ENCRYPTED FILE-----",
      "",
    ].join("\n"),
    "utf8",
  ).toString("hex")}` as `0x${string}`;

  assert.deepEqual(parseTlockCiphertextMetadata(ciphertext), {
    targetRound,
    drandChainHash,
  });
  assert.notEqual(filler, "");
});

test("buildCommitHash includes the tlock round metadata", () => {
  const salt = ("0x" + "22".repeat(32)) as `0x${string}`;
  const ciphertext = "0x1234" as `0x${string}`;
  const drandChainHash = ("0x" + "33".repeat(32)) as `0x${string}`;
  const roundReferenceRatingBps = 5_000;
  const voter = "0x2222222222222222222222222222222222222222";

  const commitHash = buildCommitHash(false, salt, voter, 42n, 4n, roundReferenceRatingBps, 123n, drandChainHash, ciphertext);

  assert.equal(
    commitHash,
    buildCommitHash(false, salt, voter, 42n, 4n, roundReferenceRatingBps, 123n, drandChainHash, ciphertext),
  );
  assert.notEqual(
    commitHash,
    buildCommitHash(false, salt, voter, 42n, 5n, roundReferenceRatingBps, 123n, drandChainHash, ciphertext),
  );
});

test("encodeVoteTransferPayload round-trips the redeployed vote shape", () => {
  const payload = encodeVoteTransferPayload({
    contentId: 42n,
    roundReferenceRatingBps: 5_000,
    commitHash: ("0x" + "11".repeat(32)) as `0x${string}`,
    ciphertext: "0x1234" as `0x${string}`,
    targetRound: 123n,
    drandChainHash: ("0x" + "22".repeat(32)) as `0x${string}`,
    frontend: "0x3333333333333333333333333333333333333333",
  });

  assert.deepEqual(decodeVoteTransferPayload(payload), {
    contentId: 42n,
    roundReferenceRatingBps: 5_000,
    commitHash: "0x" + "11".repeat(32),
    ciphertext: "0x1234",
    targetRound: 123n,
    drandChainHash: "0x" + "22".repeat(32),
    frontend: "0x3333333333333333333333333333333333333333",
  });
});

test("createTlockVoteCommit returns the tlock metadata used in the commit hash", async () => {
  const voter = "0x2222222222222222222222222222222222222222";
  const commit = await createTlockVoteCommit(
    {
      voter,
      isUp: true,
      salt: ("0x" + "33".repeat(32)) as `0x${string}`,
      contentId: 7n,
      roundId: 3n,
      roundReferenceRatingBps: 5_000,
      epochDurationSeconds: 1200,
    },
    {
      client: fakeClient,
      now: fakeNow,
      encryptFn: async (targetRound, payload) => {
        const marker = payload[0] === 1 ? "1" : "0";
        const plaintextMarker = `${marker}:${Buffer.from(payload.slice(1)).toString("hex")}`;
        return Buffer.from(makeFakeArmoredTlockCiphertext({
          targetRound: BigInt(targetRound),
          drandChainHash: "0x52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971",
          plaintextMarker,
        }).slice(2), "hex").toString("utf8");
      },
    },
  );

  assert.equal(commit.targetRound > 0n, true);
  assert.equal(commit.drandChainHash, "0x52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971");
  assert.equal(commit.roundReferenceRatingBps, 5_000);
  assert.equal(
    commit.commitHash,
    buildCommitHash(
      true,
      ("0x" + "33".repeat(32)) as `0x${string}`,
      voter,
      7n,
      3n,
      5_000,
      commit.targetRound,
      commit.drandChainHash,
      commit.ciphertext,
    ),
  );
});

test("createTlockVoteCommit can encrypt to an explicit target round", async () => {
  const voter = "0x2222222222222222222222222222222222222222";
  const explicitTargetRound = 987_654n;
  const commit = await createTlockVoteCommit(
    {
      voter,
      isUp: false,
      salt: ("0x" + "44".repeat(32)) as `0x${string}`,
      contentId: 8n,
      roundId: 4n,
      roundReferenceRatingBps: 4_500,
      epochDurationSeconds: 1200,
    },
    {
      client: fakeClient,
      targetRound: explicitTargetRound,
      encryptFn: async (targetRound, payload) => {
        assert.equal(targetRound, Number(explicitTargetRound));
        const marker = payload[0] === 1 ? "1" : "0";
        const plaintextMarker = `${marker}:${Buffer.from(payload.slice(1)).toString("hex")}`;
        return Buffer.from(
          makeFakeArmoredTlockCiphertext({
            targetRound: BigInt(targetRound),
            drandChainHash:
              "0x52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971",
            plaintextMarker,
          }).slice(2),
          "hex",
        ).toString("utf8");
      },
    },
  );

  assert.equal(commit.targetRound, explicitTargetRound);
  assert.equal(
    commit.commitHash,
    buildCommitHash(
      false,
      ("0x" + "44".repeat(32)) as `0x${string}`,
      voter,
      8n,
      4n,
      4_500,
      explicitTargetRound,
      commit.drandChainHash,
      commit.ciphertext,
    ),
  );
});

test("getVoteTlockChainInfo returns the canonical drand metadata from the tlock client", async () => {
  const chainInfo = await getVoteTlockChainInfo({ client: fakeClient });

  assert.deepEqual(chainInfo, {
    periodSeconds: 3n,
    genesisTimeSeconds: 1692803367n,
    drandChainHash: "0x52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971",
  });
});

test("deriveVoteTlockRevealAvailableAtSeconds converts a committed round into its reveal timestamp", () => {
  assert.equal(
    deriveVoteTlockRevealAvailableAtSeconds(401n, {
      periodSeconds: 3n,
      genesisTimeSeconds: 1692803367n,
      drandChainHash: "0x52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971",
    }),
    1692804567n,
  );
});
