import assert from "node:assert/strict";
import test from "node:test";

import { CuryoGovernorAbi } from "./abis";
import deployedContracts from "./deployedContracts";
import { getSharedChainStartBlock, getSharedDeploymentAddress, getSharedDeploymentStartBlock } from "./deployments";

const chain42220 = (deployedContracts as Record<number, Record<string, { address: `0x${string}`; deployedOnBlock?: number }>>)[
  42220
];
const chain11142220 = (deployedContracts as Record<number, Record<string, { address: `0x${string}`; deployedOnBlock?: number }>>)[
  11142220
];
const expectedChain42220StartBlock = Math.min(
  ...Object.values(chain42220)
    .map(contract => contract.deployedOnBlock)
    .filter((value): value is number => typeof value === "number" && Number.isInteger(value) && value >= 0),
);
const expectedContentRegistry42220StartBlock = chain42220.ContentRegistry.deployedOnBlock ?? expectedChain42220StartBlock;
const expectedChainStartBlock = Math.min(
  ...Object.values(chain11142220)
    .map(contract => contract.deployedOnBlock)
    .filter((value): value is number => typeof value === "number" && Number.isInteger(value) && value >= 0),
);
const expectedContentRegistryStartBlock = chain11142220.ContentRegistry.deployedOnBlock ?? expectedChainStartBlock;

test("shared deployment helpers return supported-chain addresses", () => {
  assert.equal(getSharedDeploymentAddress(11142220, "ContentRegistry"), chain11142220.ContentRegistry.address);
  assert.equal(getSharedDeploymentAddress(11142220, "RoundVotingEngine"), chain11142220.RoundVotingEngine.address);
  assert.equal(getSharedDeploymentAddress(11142220, "TimelockController"), chain11142220.TimelockController.address);
  assert.equal(getSharedDeploymentAddress(11142220, "CuryoGovernor"), chain11142220.CuryoGovernor.address);
  assert.equal(getSharedDeploymentAddress(42220, "ContentRegistry"), chain42220.ContentRegistry.address);
  assert.equal(getSharedDeploymentAddress(42220, "RoundVotingEngine"), chain42220.RoundVotingEngine.address);
  assert.equal(getSharedDeploymentAddress(42220, "TimelockController"), chain42220.TimelockController.address);
  assert.equal(getSharedDeploymentAddress(42220, "CuryoGovernor"), chain42220.CuryoGovernor.address);
});

test("shared deployment helpers expose the chain start block and prefer contract-specific blocks when present", () => {
  assert.equal(getSharedChainStartBlock(11142220), expectedChainStartBlock);
  assert.equal(getSharedDeploymentStartBlock(11142220, "ContentRegistry"), expectedContentRegistryStartBlock);
  assert.equal(getSharedChainStartBlock(42220), expectedChain42220StartBlock);
  assert.equal(getSharedDeploymentStartBlock(42220, "ContentRegistry"), expectedContentRegistry42220StartBlock);
});

test("shared deployment helpers return undefined for unknown chains", () => {
  assert.equal(getSharedDeploymentAddress(999999, "ContentRegistry"), undefined);
  assert.equal(getSharedDeploymentStartBlock(999999, "ContentRegistry"), undefined);
});

test("shared ABI exports include governance contracts present in shared deployments", () => {
  assert.ok(Array.isArray(CuryoGovernorAbi));
  assert.ok(CuryoGovernorAbi.length > 0);
});
