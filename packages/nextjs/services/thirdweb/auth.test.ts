import { getThirdwebAuthMode, getThirdwebWalletAuthConfig } from "./auth";
import assert from "node:assert/strict";
import { test } from "node:test";

test("getThirdwebAuthMode uses redirect auth on localhost", () => {
  assert.equal(getThirdwebAuthMode("localhost"), "redirect");
  assert.equal(getThirdwebAuthMode("127.0.0.1"), "redirect");
});

test("getThirdwebAuthMode uses popup auth away from localhost", () => {
  assert.equal(getThirdwebAuthMode("curyo.xyz"), "popup");
  assert.equal(getThirdwebAuthMode(undefined), "popup");
});

test("getThirdwebWalletAuthConfig adds a redirect URL for localhost flows", () => {
  const auth = getThirdwebWalletAuthConfig({
    hostname: "localhost",
    currentUrl: "http://localhost:3000/vote?content=1",
  });

  assert.equal(auth.mode, "redirect");
  assert.equal(auth.redirectUrl, "http://localhost:3000/vote?content=1");
  assert.deepEqual(auth.options, ["google", "apple", "email", "passkey"]);
});

test("getThirdwebWalletAuthConfig keeps popup mode for non-localhost flows", () => {
  const auth = getThirdwebWalletAuthConfig({
    hostname: "app.curyo.xyz",
    currentUrl: "https://app.curyo.xyz/vote",
  });

  assert.equal(auth.mode, "popup");
  assert.ok(!("redirectUrl" in auth));
});
