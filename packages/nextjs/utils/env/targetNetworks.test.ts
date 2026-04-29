import { AVAILABLE_TARGET_NETWORKS, resolveTargetNetworks } from "./targetNetworks";
import assert from "node:assert/strict";
import test from "node:test";
import * as chains from "viem/chains";

test("Celo Sepolia uses CELO as the native token symbol", () => {
  assert.equal(AVAILABLE_TARGET_NETWORKS[chains.celoSepolia.id].nativeCurrency.symbol, "CELO");

  const [network] = resolveTargetNetworks(`${chains.celoSepolia.id}`, {
    production: false,
  });

  assert.equal(network.nativeCurrency.symbol, "CELO");
});

test("production builds can explicitly opt into the local Foundry chain", () => {
  const networks = resolveTargetNetworks(`${chains.foundry.id},${chains.celoSepolia.id}`, {
    allowFoundryInProduction: true,
    production: true,
  });

  assert.deepEqual(
    networks.map(network => network.id),
    [chains.foundry.id, chains.celoSepolia.id],
  );
});

test("target network parsing rejects chain IDs with non-numeric suffixes", () => {
  assert.throws(
    () =>
      resolveTargetNetworks(`${chains.celo.id}abc`, {
        production: true,
      }),
    /comma-separated list of numeric chain IDs/,
  );
});

test("configured RPC overrides become the preferred browser transport for target chains", () => {
  const [network] = resolveTargetNetworks(`${chains.celoSepolia.id}`, {
    production: false,
    rpcOverrides: {
      [chains.celoSepolia.id]: "https://11142220.rpc.thirdweb.com/client-id",
    },
  });

  assert.equal(network.rpcUrls.default.http[0], "https://11142220.rpc.thirdweb.com/client-id");
});
