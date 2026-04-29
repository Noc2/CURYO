import assert from "node:assert/strict";
import test from "node:test";

import { CuryoGovernorAbi } from "./abis";
import deployedContracts from "./deployedContracts";
import { getSharedChainStartBlock, getSharedDeploymentAddress, getSharedDeploymentStartBlock } from "./deployments";

type DeploymentContract = { address: `0x${string}`; deployedOnBlock?: number };
type DeploymentChain = Record<string, DeploymentContract>;

const deploymentsByChain = deployedContracts as Record<number, DeploymentChain>;
const localChain = deploymentsByChain[31337];

function isValidStartBlock(value: number | undefined): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function getExpectedChainStartBlock(chain: DeploymentChain): number | undefined {
  const startBlocks = Object.values(chain)
    .map(contract => contract.deployedOnBlock)
    .filter(isValidStartBlock);
  return startBlocks.length > 0 ? Math.min(...startBlocks) : undefined;
}

function getChainWithStartBlocks(): [number, DeploymentChain] {
  const entry = Object.entries(deploymentsByChain).find(([, chain]) => getExpectedChainStartBlock(chain) !== undefined);
  assert.ok(entry, "expected at least one generated deployment chain with start block metadata");
  return [Number(entry[0]), entry[1]];
}

test("shared deployment helpers return local-chain addresses", () => {
  assert.equal(getSharedDeploymentAddress(31337, "ContentRegistry"), localChain.ContentRegistry.address);
  assert.equal(getSharedDeploymentAddress(31337, "RoundVotingEngine"), localChain.RoundVotingEngine.address);
  assert.equal(getSharedDeploymentAddress(31337, "ProtocolConfig"), localChain.ProtocolConfig.address);
  assert.equal(getSharedDeploymentAddress(31337, "QuestionRewardPoolEscrow"), localChain.QuestionRewardPoolEscrow.address);
});

test("shared deployment helpers expose the chain start block and prefer contract-specific blocks when present", () => {
  const [chainId, chain] = getChainWithStartBlocks();
  const expectedChainStartBlock = getExpectedChainStartBlock(chain);
  const contractEntry = Object.entries(chain).find(([, contract]) => isValidStartBlock(contract.deployedOnBlock));
  assert.ok(contractEntry, "expected selected chain to include a contract-specific start block");

  const [contractName, contract] = contractEntry;
  assert.equal(getSharedChainStartBlock(chainId), expectedChainStartBlock);
  assert.equal(getSharedDeploymentStartBlock(chainId, contractName), contract.deployedOnBlock);
});

test("shared deployment helpers return undefined for unknown chains", () => {
  assert.equal(getSharedDeploymentAddress(999999, "ContentRegistry"), undefined);
  assert.equal(getSharedDeploymentStartBlock(999999, "ContentRegistry"), undefined);
});

test("shared ABI exports include governance contracts present in shared deployments", () => {
  assert.ok(Array.isArray(CuryoGovernorAbi));
  assert.ok(CuryoGovernorAbi.length > 0);
});
