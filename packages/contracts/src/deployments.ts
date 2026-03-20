import { isAddress } from "viem";
import deployedContracts from "./deployedContracts";
import type { GenericContract, GenericContractsDeclaration } from "./types";

const sharedDeployments = deployedContracts as GenericContractsDeclaration;

function isValidStartBlock(value: number | undefined): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

export function getSharedDeployment(chainId: number, contractName: string): GenericContract | undefined {
  return sharedDeployments[chainId]?.[contractName];
}

export function getSharedDeploymentAddress(chainId: number, contractName: string): `0x${string}` | undefined {
  const address = getSharedDeployment(chainId, contractName)?.address;
  if (!address || !isAddress(address)) {
    return undefined;
  }

  return address as `0x${string}`;
}

export function getSharedChainStartBlock(chainId: number): number | undefined {
  const contracts = sharedDeployments[chainId];
  if (!contracts) {
    return undefined;
  }

  const deployedBlocks = Object.values(contracts)
    .map(contract => contract?.deployedOnBlock)
    .filter(isValidStartBlock);

  if (deployedBlocks.length === 0) {
    return undefined;
  }

  return Math.min(...deployedBlocks);
}

export function getSharedDeploymentStartBlock(chainId: number, contractName: string): number | undefined {
  const contractStartBlock = getSharedDeployment(chainId, contractName)?.deployedOnBlock;
  if (isValidStartBlock(contractStartBlock)) {
    return contractStartBlock;
  }

  if (!getSharedDeployment(chainId, contractName)) {
    return undefined;
  }

  return getSharedChainStartBlock(chainId);
}
