import { CURYO_E2E_RPC_URL_STORAGE_KEY, CURYO_E2E_TEST_WALLET_PRIVATE_KEY_STORAGE_KEY } from "./testWalletStorage";
import { clearWalletState } from "./walletStateCleanup";
import assert from "node:assert/strict";
import test from "node:test";

function createStorage(initialValues: Record<string, string>) {
  const values = new Map(Object.entries(initialValues));

  return {
    get length() {
      return values.size;
    },
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    key(index: number) {
      return Array.from(values.keys())[index] ?? null;
    },
    removeItem(key: string) {
      values.delete(key);
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
  } as Pick<Storage, "getItem" | "key" | "length" | "removeItem" | "setItem">;
}

test("clearWalletState removes thirdweb, wagmi, and local E2E test wallet state", () => {
  const storage = createStorage({
    [CURYO_E2E_TEST_WALLET_PRIVATE_KEY_STORAGE_KEY]: "0xabc",
    [CURYO_E2E_RPC_URL_STORAGE_KEY]: "http://127.0.0.1:8545",
    "thirdweb:active-chain": JSON.stringify({ id: 31337 }),
    "wagmi.store": "{}",
    curyo_terms_accepted: "true",
  });

  clearWalletState(storage as Storage);

  assert.equal(storage.getItem(CURYO_E2E_TEST_WALLET_PRIVATE_KEY_STORAGE_KEY), null);
  assert.equal(storage.getItem(CURYO_E2E_RPC_URL_STORAGE_KEY), null);
  assert.equal(storage.getItem("thirdweb:active-chain"), null);
  assert.equal(storage.getItem("wagmi.store"), null);
  assert.equal(storage.getItem("curyo_terms_accepted"), "true");
});
