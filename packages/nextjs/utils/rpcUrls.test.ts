import {
  buildAlchemyHttpUrl,
  getPreferredHttpRpcUrls,
  mergeRpcOverrides,
  resolveRpcOverrides,
  withPreferredHttpRpcUrls,
} from "./rpcUrls";
import assert from "node:assert/strict";
import test from "node:test";
import { celoSepolia } from "viem/chains";

test("buildAlchemyHttpUrl returns the expected Celo Sepolia RPC", () => {
  assert.equal(buildAlchemyHttpUrl(11142220, "test-key"), "https://celo-sepolia.g.alchemy.com/v2/test-key");
});

test("buildAlchemyHttpUrl ignores unsupported scaffold-era networks", () => {
  assert.equal(buildAlchemyHttpUrl(137, "test-key"), undefined);
});

test("getPreferredHttpRpcUrls prioritizes overrides before Alchemy and defaults", () => {
  assert.deepEqual(
    getPreferredHttpRpcUrls(celoSepolia, {
      alchemyApiKey: "alchemy-key",
      rpcOverrides: {
        [celoSepolia.id]: "https://rpc.example.com",
      },
    }),
    [
      "https://rpc.example.com",
      "https://celo-sepolia.g.alchemy.com/v2/alchemy-key",
      "https://forno.celo-sepolia.celo-testnet.org",
    ],
  );
});

test("withPreferredHttpRpcUrls rewrites the chain metadata used for wallet add-chain flows", () => {
  const preferredChain = withPreferredHttpRpcUrls(celoSepolia, {
    alchemyApiKey: "alchemy-key",
  });

  assert.deepEqual(Array.from(preferredChain.rpcUrls.default.http), [
    "https://celo-sepolia.g.alchemy.com/v2/alchemy-key",
    "https://forno.celo-sepolia.celo-testnet.org",
  ]);
});

test("resolveRpcOverrides normalizes configured per-chain RPC URLs", () => {
  assert.deepEqual(
    resolveRpcOverrides({
      11142220: "https://11142220.rpc.thirdweb.com/client-id/",
      42220: undefined,
    }),
    {
      11142220: "https://11142220.rpc.thirdweb.com/client-id",
    },
  );
});

test("mergeRpcOverrides lets env-defined RPC URLs override code defaults", () => {
  assert.deepEqual(
    mergeRpcOverrides(
      {
        [celoSepolia.id]: "https://forno.celo-sepolia.celo-testnet.org",
      },
      {
        [celoSepolia.id]: "https://11142220.rpc.thirdweb.com/client-id",
      },
    ),
    {
      [celoSepolia.id]: "https://11142220.rpc.thirdweb.com/client-id",
    },
  );
});
