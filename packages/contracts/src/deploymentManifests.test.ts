import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import deployedContracts from "./deployedContracts";

type DeploymentManifest = Record<string, string>;
type GeneratedContracts = Record<number, Record<string, { address: `0x${string}` }>>;

const sharedContracts = deployedContracts as GeneratedContracts;
// Localhost manifests are generated into a gitignored file, so CI can only
// assert against the tracked deployment fixtures for shared networks.
const trackedManifestChainIds = [42220, 11142220] as const;

function readDeploymentManifest(chainId: number): DeploymentManifest {
  const manifestUrl = new URL(`../../foundry/deployments/${chainId}.json`, import.meta.url);
  return JSON.parse(readFileSync(manifestUrl, "utf8")) as DeploymentManifest;
}

function manifestEntries(manifest: DeploymentManifest): Array<[`0x${string}`, string]> {
  return Object.entries(manifest).filter((entry): entry is [`0x${string}`, string] => entry[0].startsWith("0x"));
}

test("production deployment manifests include governance contracts from shared deployments", () => {
  for (const chainId of trackedManifestChainIds) {
    const manifest = readDeploymentManifest(chainId);
    const manifestByName = new Map(manifestEntries(manifest).map(([address, name]) => [name, address]));
    const contracts = sharedContracts[chainId];

    assert.equal(manifest.networkName, chainId === 42220 ? "celo" : "celoSepolia");
    assert.equal(manifestByName.get("TimelockController"), contracts.TimelockController.address);
    assert.equal(manifestByName.get("CuryoGovernor"), contracts.CuryoGovernor.address);
  }
});
