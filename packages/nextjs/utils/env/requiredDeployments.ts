export type DeploymentDefinitions = Record<number, Record<string, unknown> | undefined>;

export const REQUIRED_TARGET_CONTRACTS = [
  "HumanReputation",
  "FrontendRegistry",
  "ProfileRegistry",
  "ContentRegistry",
  "RoundVotingEngine",
  "ProtocolConfig",
  "RoundRewardDistributor",
  "CategoryRegistry",
  "VoterIdNFT",
  "ParticipationPool",
  "HumanFaucet",
] as const;

export function listMissingRequiredTargetContracts(
  chainIds: readonly number[],
  deploymentsByChain: DeploymentDefinitions,
  requiredContracts: readonly string[] = REQUIRED_TARGET_CONTRACTS,
): string[] {
  return chainIds.flatMap(chainId => {
    const chainDeployments = deploymentsByChain[chainId];
    if (!chainDeployments) return [];

    return requiredContracts
      .filter(contractName => chainDeployments[contractName] === undefined)
      .map(contractName => `${chainId}:${contractName}`);
  });
}
