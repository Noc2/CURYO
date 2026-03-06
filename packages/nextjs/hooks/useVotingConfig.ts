"use client";

import { useScaffoldReadContract } from "~~/hooks/scaffold-eth";
import { DEFAULT_VOTING_CONFIG, VotingConfig, parseVotingConfig } from "~~/lib/contracts/roundVotingEngine";

/**
 * Shared hook to read RoundVotingEngine.config() once.
 * Handles named-vs-positional tuple detection in one place.
 */
export function useVotingConfig(): VotingConfig {
  const { data: rawConfig } = useScaffoldReadContract({
    contractName: "RoundVotingEngine" as any,
    functionName: "config" as any,
    query: { refetchInterval: 60_000 },
  } as any);

  return rawConfig ? parseVotingConfig(rawConfig) : DEFAULT_VOTING_CONFIG;
}
