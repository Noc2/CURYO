import { describe, it, expect, vi } from "vitest";

import {
  buildCommitHash,
  buildCommitKey,
  createTlockVoteCommit,
  decodeVoteTransferPayload,
  decodeVotePlaintext,
  encodeVoteTransferPayload,
  encodeVotePlaintext,
  parseTlockCiphertextMetadata,
  tlockEncryptVote,
} from "@curyo/contracts/voting";

const fakeClient = {
  chain: () => ({
    info: vi.fn().mockResolvedValue({
      period: 3,
      genesis_time: 1677685200,
      hash: "ab".repeat(32),
    }),
  }),
} as any;

const fakeNow = () => 1677685200 * 1000;

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

function makeFakeArmoredTlockCiphertext(targetRound: bigint, drandChainHash: `0x${string}`, plaintextMarker: string): `0x${string}` {
  const encryptedBody = Buffer.concat([
    Buffer.from(plaintextMarker, "utf8"),
    Buffer.alloc(Math.max(0, 65 - Buffer.byteLength(plaintextMarker, "utf8")), 0x58),
  ]);
  const recipientBody = chunkBase64(toUnpaddedBase64(Buffer.alloc(128, 0x42)));
  const mac = toUnpaddedBase64(Buffer.alloc(32, 0x24));
  const agePayload = Buffer.concat([
    Buffer.from(
      [
        "age-encryption.org/v1",
        `-> tlock ${targetRound.toString()} ${drandChainHash.slice(2)}`,
        recipientBody,
        `--- ${mac}`,
        "",
      ].join("\n"),
      "utf8",
    ),
    encryptedBody,
  ]);
  const armored = [
    "-----BEGIN AGE ENCRYPTED FILE-----",
    chunkBase64(agePayload.toString("base64")),
    "-----END AGE ENCRYPTED FILE-----",
    "",
  ].join("\n");

  return (`0x${Buffer.from(armored, "utf-8").toString("hex")}`) as `0x${string}`;
}

describe("tlockEncryptVote", () => {
  it("produces a 0x-prefixed hex string", async () => {
    const encryptFn = vi.fn().mockResolvedValue("FAKE-ARMORED-AGE-STRING");
    const result = await tlockEncryptVote(
      true,
      ("0x" + "ab".repeat(32)) as `0x${string}`,
      1200,
      { client: fakeClient, encryptFn, now: fakeNow },
    );
    expect(result).toMatch(/^0x[0-9a-f]+$/);
  });

  it("encodes the armored string as hex bytes", async () => {
    const encryptFn = vi.fn().mockResolvedValue("FAKE-ARMORED-AGE-STRING");
    const result = await tlockEncryptVote(
      false,
      ("0x" + "cd".repeat(32)) as `0x${string}`,
      1200,
      { client: fakeClient, encryptFn, now: fakeNow },
    );
    expect(result).toBe("0x46414b452d41524d4f5245442d4147452d535452494e47");
  });

  it("calls timelockEncrypt with correct plaintext length", async () => {
    const encryptFn = vi.fn().mockResolvedValue("FAKE-ARMORED-AGE-STRING");

    await tlockEncryptVote(
      true,
      ("0x" + "00".repeat(32)) as `0x${string}`,
      1200,
      { client: fakeClient, encryptFn, now: fakeNow },
    );

    expect(encryptFn).toHaveBeenCalledOnce();
    const [, plaintext] = encryptFn.mock.calls[0];
    // Plaintext should be 33 bytes: 1 byte direction + 32 bytes salt
    expect((plaintext as Uint8Array).length).toBe(33);
  });
});

describe("shared voting helpers", () => {
  it("round-trips the vote plaintext shape", () => {
    const salt = ("0x" + "11".repeat(32)) as `0x${string}`;
    const plaintext = encodeVotePlaintext(true, salt);
    expect(decodeVotePlaintext(plaintext)).toEqual({ isUp: true, salt });
  });

  it("builds stable commit hashes and keys", () => {
    const salt = ("0x" + "22".repeat(32)) as `0x${string}`;
    const ciphertext = "0x1234" as `0x${string}`;
    const roundReferenceRatingBps = 5_000;
    const commitHash = buildCommitHash(
      false,
      salt,
      42n,
      roundReferenceRatingBps,
      123n,
      ("0x" + "ab".repeat(32)) as `0x${string}`,
      ciphertext,
    );
    const commitKey = buildCommitKey("0x1111111111111111111111111111111111111111", commitHash);

    expect(commitHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(commitKey).toMatch(/^0x[0-9a-f]{64}$/);
    expect(
      buildCommitHash(
        false,
        salt,
        42n,
        roundReferenceRatingBps,
        123n,
        ("0x" + "ab".repeat(32)) as `0x${string}`,
        ciphertext,
      ),
    ).toBe(commitHash);
    expect(buildCommitKey("0x1111111111111111111111111111111111111111", commitHash)).toBe(commitKey);
  });

  it("creates matching commit artifacts", async () => {
    const salt = ("0x" + "33".repeat(32)) as `0x${string}`;
    const voter = "0x2222222222222222222222222222222222222222" as const;
    const encryptFn = vi.fn().mockResolvedValue("FAKE-ARMORED-AGE-STRING");

    const commit = await createTlockVoteCommit({
      voter,
      isUp: true,
      salt,
      contentId: 7n,
      roundReferenceRatingBps: 5_000,
      epochDurationSeconds: 1200,
    }, { client: fakeClient, encryptFn, now: fakeNow });

    expect(commit.ciphertext).toBe("0x46414b452d41524d4f5245442d4147452d535452494e47");
    expect(commit.targetRound).toBe(401n);
    expect(commit.drandChainHash).toBe(`0x${"ab".repeat(32)}`);
    expect(commit.roundReferenceRatingBps).toBe(5_000);
    expect(commit.commitHash).toBe(
      buildCommitHash(
        true,
        salt,
        7n,
        commit.roundReferenceRatingBps,
        commit.targetRound,
        commit.drandChainHash,
        commit.ciphertext,
      ),
    );
    expect(commit.commitKey).toBe(buildCommitKey(voter, commit.commitHash));
  });

  it("round-trips the ERC-1363 vote transfer payload", () => {
    const payload = {
      contentId: 9n,
      roundReferenceRatingBps: 5_000,
      commitHash: ("0x" + "44".repeat(32)) as `0x${string}`,
      ciphertext: "0x123456" as `0x${string}`,
      targetRound: 99n,
      drandChainHash: ("0x" + "55".repeat(32)) as `0x${string}`,
      frontend: "0x3333333333333333333333333333333333333333" as const,
    };

    const encoded = encodeVoteTransferPayload(payload);
    expect(decodeVoteTransferPayload(encoded)).toEqual(payload);
  });

  it("parses tlock ciphertext metadata from the armored payload", () => {
    const ciphertext = makeFakeArmoredTlockCiphertext(123n, `0x${"ab".repeat(32)}`, "1:" + "11".repeat(32));

    expect(parseTlockCiphertextMetadata(ciphertext)).toEqual({
      targetRound: 123n,
      drandChainHash: `0x${"ab".repeat(32)}`,
    });
  });

  it("rejects shallow pseudo-tlock envelopes", () => {
    const armored = [
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
    ].join("\n");
    const ciphertext = (`0x${Buffer.from(armored, "utf-8").toString("hex")}`) as `0x${string}`;

    expect(parseTlockCiphertextMetadata(ciphertext)).toBeNull();
  });
});
