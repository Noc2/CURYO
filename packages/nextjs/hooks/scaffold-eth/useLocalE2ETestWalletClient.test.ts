import { getStoredLocalE2ETestWalletRpcUrl } from "./useLocalE2ETestWalletClient";
import assert from "node:assert/strict";
import test from "node:test";
import { CURYO_E2E_RPC_URL_STORAGE_KEY } from "~~/services/thirdweb/testWalletStorage";

function createStorage(value: string | null) {
  return {
    getItem(key: string) {
      return key === CURYO_E2E_RPC_URL_STORAGE_KEY ? value : null;
    },
  } as Pick<Storage, "getItem">;
}

test("reads the configured local E2E RPC URL from storage", () => {
  assert.equal(getStoredLocalE2ETestWalletRpcUrl(createStorage("http://127.0.0.1:9545/")), "http://127.0.0.1:9545");
});

test("falls back to the default localhost RPC when no override is stored", () => {
  assert.equal(getStoredLocalE2ETestWalletRpcUrl(createStorage(null)), "http://127.0.0.1:8545");
});

test("ignores invalid local E2E RPC URLs", () => {
  assert.equal(getStoredLocalE2ETestWalletRpcUrl(createStorage("not-a-url")), undefined);
});
