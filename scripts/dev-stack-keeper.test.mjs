import assert from "node:assert/strict";
import test from "node:test";
import { getMissingKeeperEnvVars } from "./dev-stack-keeper.mjs";

test("requires a keystore password when keystore auth is the only keeper wallet path", () => {
  assert.deepEqual(
    getMissingKeeperEnvVars({
      RPC_URL: "http://localhost:8545",
      CHAIN_ID: "31337",
      KEYSTORE_ACCOUNT: "keeper",
      KEYSTORE_PASSWORD: "",
      KEEPER_PRIVATE_KEY: "",
    }),
    ["KEYSTORE_PASSWORD"],
  );
});

test("allows private-key keeper startup even when KEYSTORE_ACCOUNT is still populated", () => {
  assert.deepEqual(
    getMissingKeeperEnvVars({
      RPC_URL: "http://localhost:8545",
      CHAIN_ID: "31337",
      KEYSTORE_ACCOUNT: "keeper",
      KEYSTORE_PASSWORD: "",
      KEEPER_PRIVATE_KEY: "0xabc",
    }),
    [],
  );
});
