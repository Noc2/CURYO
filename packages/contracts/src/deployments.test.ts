import assert from "node:assert/strict";
import test from "node:test";

import deployedContracts from "./deployedContracts";
import { getSharedChainStartBlock, getSharedDeploymentAddress, getSharedDeploymentStartBlock } from "./deployments";

const chain11142220 = (deployedContracts as Record<number, Record<string, { address: `0x${string}`; deployedOnBlock?: number }>>)[
  11142220
];
const expectedChainStartBlock = Math.min(
  ...Object.values(chain11142220)
    .map(contract => contract.deployedOnBlock)
    .filter((value): value is number => typeof value === "number" && Number.isInteger(value) && value >= 0),
);
const expectedContentRegistryStartBlock = chain11142220.ContentRegistry.deployedOnBlock ?? expectedChainStartBlock;

test("shared deployment helpers return supported-chain addresses", () => {
  assert.equal(getSharedDeploymentAddress(11142220, "ContentRegistry"), chain11142220.ContentRegistry.address);
  assert.equal(getSharedDeploymentAddress(11142220, "RoundVotingEngine"), chain11142220.RoundVotingEngine.address);
});

test("shared deployment helpers expose the chain start block and prefer contract-specific blocks when present", () => {
  assert.equal(getSharedChainStartBlock(11142220), expectedChainStartBlock);
  assert.equal(getSharedDeploymentStartBlock(11142220, "ContentRegistry"), expectedContentRegistryStartBlock);
});

test("shared deployment helpers return undefined for unknown chains", () => {
  assert.equal(getSharedDeploymentAddress(999999, "ContentRegistry"), undefined);
  assert.equal(getSharedDeploymentStartBlock(999999, "ContentRegistry"), undefined);
});
