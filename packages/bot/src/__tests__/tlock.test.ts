import { describe, it, expect, vi } from "vitest";

// Mock tlock-js before importing
vi.mock("tlock-js", () => ({
  timelockEncrypt: vi.fn().mockResolvedValue("FAKE-ARMORED-AGE-STRING"),
  mainnetClient: () => ({
    chain: () => ({
      info: vi.fn().mockResolvedValue({
        period: 3,
        genesis_time: 1677685200,
        hash: "abc123",
      }),
    }),
  }),
  roundAt: vi.fn().mockReturnValue(12345),
}));

import { tlockEncryptVote } from "../tlock.js";

describe("tlockEncryptVote", () => {
  it("produces a 0x-prefixed hex string", async () => {
    const result = await tlockEncryptVote(
      true,
      "0x" + "ab".repeat(32) as `0x${string}`,
      1200,
    );
    expect(result).toMatch(/^0x[0-9a-f]+$/);
  });

  it("encodes the armored string as hex bytes", async () => {
    const result = await tlockEncryptVote(
      false,
      "0x" + "cd".repeat(32) as `0x${string}`,
      1200,
    );
    // Decode the hex back to utf-8 and verify it matches the mock
    const decoded = Buffer.from(result.slice(2), "hex").toString("utf-8");
    expect(decoded).toBe("FAKE-ARMORED-AGE-STRING");
  });

  it("calls timelockEncrypt with correct plaintext length", async () => {
    const { timelockEncrypt } = await import("tlock-js");
    vi.mocked(timelockEncrypt).mockClear();

    await tlockEncryptVote(
      true,
      "0x" + "00".repeat(32) as `0x${string}`,
      1200,
    );

    expect(timelockEncrypt).toHaveBeenCalledOnce();
    const [, plaintext] = vi.mocked(timelockEncrypt).mock.calls[0];
    // Plaintext should be 33 bytes: 1 byte direction + 32 bytes salt
    expect((plaintext as Buffer).length).toBe(33);
  });
});
