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
