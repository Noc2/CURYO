import assert from "node:assert/strict";
import test from "node:test";

import { CuryoGovernorAbi } from "./abis";
import deployedContracts from "./deployedContracts";
import { getSharedChainStartBlock, getSharedDeploymentAddress, getSharedDeploymentStartBlock } from "./deployments";

const localChain = (deployedContracts as Record<number, Record<string, { address: `0x${string}`; deployedOnBlock?: number }>>)[
  31337
];
const expectedLocalStartBlock = Math.min(
  ...Object.values(localChain)
    .map(contract => contract.deployedOnBlock)
    .filter((value): value is number => typeof value === "number" && Number.isInteger(value) && value >= 0),
);
const expectedContentRegistryStartBlock = localChain.ContentRegistry.deployedOnBlock ?? expectedLocalStartBlock;

test("shared deployment helpers return local-chain addresses", () => {
  assert.equal(getSharedDeploymentAddress(31337, "ContentRegistry"), localChain.ContentRegistry.address);
  assert.equal(getSharedDeploymentAddress(31337, "RoundVotingEngine"), localChain.RoundVotingEngine.address);
  assert.equal(getSharedDeploymentAddress(31337, "ProtocolConfig"), localChain.ProtocolConfig.address);
  assert.equal(getSharedDeploymentAddress(31337, "QuestionRewardPoolEscrow"), localChain.QuestionRewardPoolEscrow.address);
});

test("shared deployment helpers expose the chain start block and prefer contract-specific blocks when present", () => {
  assert.equal(getSharedChainStartBlock(31337), expectedLocalStartBlock);
  assert.equal(getSharedDeploymentStartBlock(31337, "ContentRegistry"), expectedContentRegistryStartBlock);
});

test("shared deployment helpers return undefined for unknown chains", () => {
  assert.equal(getSharedDeploymentAddress(999999, "ContentRegistry"), undefined);
  assert.equal(getSharedDeploymentStartBlock(999999, "ContentRegistry"), undefined);
});

test("shared ABI exports include governance contracts present in shared deployments", () => {
  assert.ok(Array.isArray(CuryoGovernorAbi));
  assert.ok(CuryoGovernorAbi.length > 0);
});
