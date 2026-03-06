import deployedContracts from "./deployedContracts";

export { deployedContracts };
export default deployedContracts;

export type DeployedContracts = typeof deployedContracts;
export type ChainId = keyof DeployedContracts;

export function getChainContracts<TChainId extends ChainId>(chainId: TChainId): DeployedContracts[TChainId] {
  return deployedContracts[chainId];
}
