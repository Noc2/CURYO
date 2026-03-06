import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock tlock-js before importing keeper
vi.mock("tlock-js", () => ({
  timelockDecrypt: vi.fn(),
  mainnetClient: () => ({}),
}));

// Mock config to avoid dotenv side effects
vi.mock("../config.js", () => ({
  config: {
    contracts: { votingEngine: "0x0", contentRegistry: "0x0" },
    dormancyPeriod: 2592000n,
  },
}));

// Mock logger
vi.mock("../logger.js", () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

import { decryptTlockCiphertext } from "../keeper.js";
import { timelockDecrypt } from "tlock-js";

describe("decryptTlockCiphertext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns {isUp, salt} for valid 33-byte plaintext (UP vote)", async () => {
    const saltHex = "ab".repeat(32);
    const saltBytes = Buffer.from(saltHex, "hex");
    // Must return Buffer (not Uint8Array) because keeper code calls .toString("hex")
    // which only works with Buffer's override
    const plaintext = Buffer.alloc(33);
    plaintext[0] = 1; // isUp = true
    saltBytes.copy(plaintext, 1);

    vi.mocked(timelockDecrypt).mockResolvedValue(plaintext);

    // Build a hex ciphertext (armored AGE string as hex bytes)
    const armored = "FAKE-ARMORED-AGE-STRING";
    const hex = `0x${Buffer.from(armored, "utf-8").toString("hex")}`;

    const result = await decryptTlockCiphertext(hex as `0x${string}`);
    expect(result).not.toBeNull();
    expect(result!.isUp).toBe(true);
    expect(result!.salt).toBe(`0x${saltHex}`);
  });

  it("returns {isUp: false} for DOWN vote", async () => {
    const salt = Buffer.alloc(32, 0xcd);
    const plaintext = Buffer.alloc(33);
    plaintext[0] = 0; // isUp = false
    salt.copy(plaintext, 1);

    vi.mocked(timelockDecrypt).mockResolvedValue(plaintext);

    const hex = `0x${Buffer.from("ARMORED", "utf-8").toString("hex")}`;
    const result = await decryptTlockCiphertext(hex as `0x${string}`);
    expect(result).not.toBeNull();
    expect(result!.isUp).toBe(false);
  });

  it("returns null for wrong-length plaintext", async () => {
    vi.mocked(timelockDecrypt).mockResolvedValue(Buffer.alloc(10));

    const hex = `0x${Buffer.from("ARMORED", "utf-8").toString("hex")}`;
    const result = await decryptTlockCiphertext(hex as `0x${string}`);
    expect(result).toBeNull();
  });

  it("propagates beacon errors", async () => {
    vi.mocked(timelockDecrypt).mockRejectedValue(new Error("beacon not available"));

    const hex = `0x${Buffer.from("ARMORED", "utf-8").toString("hex")}`;
    await expect(decryptTlockCiphertext(hex as `0x${string}`)).rejects.toThrow("beacon not available");
  });
});
