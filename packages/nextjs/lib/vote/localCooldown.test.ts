import { VOTE_COOLDOWN_SECONDS } from "./cooldown";
import { getDefaultStorage, getLocalVoteCooldownsByContentId, recordLocalVoteCooldown } from "./localCooldown";
import assert from "node:assert/strict";
import test from "node:test";

class MemoryStorage {
  private values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

test("local vote cooldown cache returns same-browser address matches", () => {
  const storage = new MemoryStorage();
  const nowSeconds = 1_000_000;

  recordLocalVoteCooldown({
    address: "0xAbC0000000000000000000000000000000000000",
    chainId: 11142220,
    contentId: 7n,
    nowSeconds,
    storage,
  });

  const cooldowns = getLocalVoteCooldownsByContentId({
    chainId: 11142220,
    contentIds: [7n],
    identities: [{ address: "0xabc0000000000000000000000000000000000000" }],
    nowSeconds: nowSeconds + 60,
    storage,
  });

  assert.equal(cooldowns.get("7"), VOTE_COOLDOWN_SECONDS - 60);
});

test("local vote cooldown cache matches voter id tokens across linked addresses", () => {
  const storage = new MemoryStorage();
  const nowSeconds = 1_000_000;

  recordLocalVoteCooldown({
    address: "0x1111111111111111111111111111111111111111",
    chainId: 11142220,
    contentId: "9",
    nowSeconds,
    storage,
    voterIdTokenId: 42n,
  });

  const cooldowns = getLocalVoteCooldownsByContentId({
    chainId: 11142220,
    contentIds: [9n],
    identities: [{ address: "0x2222222222222222222222222222222222222222", voterIdTokenId: "42" }],
    nowSeconds: nowSeconds + 30,
    storage,
  });

  assert.equal(cooldowns.get("9"), VOTE_COOLDOWN_SECONDS - 30);
});

test("local vote cooldown cache ignores expired entries and other chains", () => {
  const storage = new MemoryStorage();
  const nowSeconds = 1_000_000;
  const address = "0xabc0000000000000000000000000000000000000";

  recordLocalVoteCooldown({
    address,
    chainId: 11142220,
    contentId: 7n,
    nowSeconds: nowSeconds - VOTE_COOLDOWN_SECONDS - 1,
    storage,
  });
  recordLocalVoteCooldown({
    address,
    chainId: 42220,
    contentId: 8n,
    nowSeconds,
    storage,
  });

  const cooldowns = getLocalVoteCooldownsByContentId({
    chainId: 11142220,
    contentIds: [7n, 8n],
    identities: [{ address }],
    nowSeconds,
    storage,
  });

  assert.deepEqual(Array.from(cooldowns.entries()), []);
});

test("default local vote cooldown storage tolerates restricted browser storage", () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: Object.defineProperty({}, "localStorage", {
      get() {
        throw new Error("blocked");
      },
    }),
  });

  try {
    assert.equal(getDefaultStorage(), null);
  } finally {
    if (originalWindow) {
      Object.defineProperty(globalThis, "window", originalWindow);
    } else {
      Reflect.deleteProperty(globalThis, "window");
    }
  }
});
