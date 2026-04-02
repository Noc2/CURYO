import {
  SELF_VERIFICATION_SCOPE,
  buildSelfVerificationApp,
  buildSelfVerificationAppConfig,
  getSelfVerificationUniversalLink,
  getSelfVerificationWebsocketUrl,
  isSelfVerificationSupportedChain,
} from "./selfVerificationApp";
import assert from "node:assert/strict";
import test from "node:test";

const address = "0x1234567890abcdef1234567890abcdef12345678";
const contractAddress = "0xABCDEFabcdefABCDEFabcdefABCDEFabcdefABCD";
const referrer = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd";

test("buildSelfVerificationAppConfig enables dev mode for Celo Sepolia", () => {
  const config = buildSelfVerificationAppConfig({
    address,
    contractAddress,
    chainId: 11142220,
    referrer,
  });

  assert.ok(config);
  assert.equal(config.scope, SELF_VERIFICATION_SCOPE);
  assert.equal(config.endpointType, "staging_celo");
  assert.equal(config.endpoint, contractAddress.toLowerCase());
  assert.equal(config.userId, address);
  assert.equal(config.userIdType, "hex");
  assert.equal(config.userDefinedData, referrer);
  assert.equal(config.devMode, true);
  assert.equal(config.version, 2);
  assert.equal("minimumAge" in config.disclosures, false);
});

test("buildSelfVerificationAppConfig keeps production mode on Celo mainnet", () => {
  const config = buildSelfVerificationAppConfig({
    address,
    contractAddress,
    chainId: 42220,
  });

  assert.ok(config);
  assert.equal(config.endpointType, "celo");
  assert.equal(config.userDefinedData, "");
  assert.equal(config.devMode, false);
  assert.equal("minimumAge" in config.disclosures, false);
});

test("buildSelfVerificationAppConfig clears invalid referrers from user-defined data", () => {
  const config = buildSelfVerificationAppConfig({
    address,
    contractAddress,
    chainId: 42220,
    referrer: "not-an-address",
  });

  assert.ok(config);
  assert.equal(config.userDefinedData, "");
});

test("buildSelfVerificationApp creates a mobile universal link that Self can open", () => {
  const selfApp = buildSelfVerificationApp({
    address,
    contractAddress,
    chainId: 11142220,
    deeplinkCallback: "https://curyo.example/faucet",
    referrer,
  });

  assert.ok(selfApp);

  const link = getSelfVerificationUniversalLink(selfApp);
  const url = new URL(link);

  assert.equal(url.origin, "https://redirect.self.xyz");
  assert.equal(url.searchParams.has("app"), false);

  const encodedSelfApp = url.searchParams.get("selfApp");
  assert.ok(encodedSelfApp);

  const decodedSelfApp = JSON.parse(encodedSelfApp) as Record<string, unknown>;
  assert.equal(decodedSelfApp.endpointType, "staging_celo");
  assert.equal(decodedSelfApp.chainID, 11142220);
  assert.equal(decodedSelfApp.userId, address.slice(2));
  assert.equal(decodedSelfApp.deeplinkCallback, "https://curyo.example/faucet");
  assert.equal(decodedSelfApp.userDefinedData, referrer);
  assert.equal("minimumAge" in decodedSelfApp, false);
});

test("unsupported chains do not build a Self verification app config", () => {
  assert.equal(
    buildSelfVerificationAppConfig({
      address,
      contractAddress,
      chainId: 1,
    }),
    null,
  );
  assert.equal(isSelfVerificationSupportedChain(1), false);
  assert.equal(getSelfVerificationWebsocketUrl(1), null);
});

test("supported chains map to the expected websocket endpoints", () => {
  assert.equal(isSelfVerificationSupportedChain(42220), true);
  assert.equal(getSelfVerificationWebsocketUrl(42220), "wss://websocket.self.xyz");
  assert.equal(getSelfVerificationWebsocketUrl(11142220), "wss://websocket.staging.self.xyz");
});
