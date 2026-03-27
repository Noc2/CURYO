import assert from "node:assert/strict";
import test from "node:test";
import { CURYO_E2E_TEST_WALLET_PRIVATE_KEY_STORAGE_KEY } from "../../services/thirdweb/testWalletStorage";
import { setupWallet } from "./wallet-session";

function createPageStub(currentUrl = "about:blank") {
  const initScripts: string[] = [];
  const gotoCalls: Array<{ url: string; options: { waitUntil: string } }> = [];

  const page = {
    async addInitScript(script: string) {
      initScripts.push(script);
    },
    async goto(url: string, options: { waitUntil: string }) {
      gotoCalls.push({ url, options });
    },
    url() {
      return currentUrl;
    },
  };

  return { page: page as any, initScripts, gotoCalls };
}

test("setupWallet bootstraps fresh pages by default", async () => {
  const privateKey = "0xabc123";
  const { page, initScripts, gotoCalls } = createPageStub();

  await setupWallet(page, privateKey);

  assert.equal(initScripts.length, 1);
  assert.match(initScripts[0]!, new RegExp(CURYO_E2E_TEST_WALLET_PRIVATE_KEY_STORAGE_KEY));
  assert.match(initScripts[0]!, new RegExp(privateKey));
  assert.deepEqual(gotoCalls, [{ url: "/", options: { waitUntil: "domcontentloaded" } }]);
});

test("setupWallet skips bootstrap when explicitly disabled", async () => {
  const { page, gotoCalls } = createPageStub();

  await setupWallet(page, "0xabc123", { bootstrap: false });

  assert.deepEqual(gotoCalls, []);
});

test("setupWallet does not re-bootstrap an already navigated page", async () => {
  const { page, gotoCalls } = createPageStub("http://localhost:3000/vote");

  await setupWallet(page, "0xabc123");

  assert.deepEqual(gotoCalls, []);
});
