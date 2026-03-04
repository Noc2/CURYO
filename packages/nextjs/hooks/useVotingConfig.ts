"use client";

import { useScaffoldReadContract } from "~~/hooks/scaffold-eth";

export interface VotingConfig {
  epochDuration: number;
  maxDuration: number;
  minVoters: number;
  maxVoters: number;
}

const DEFAULTS: VotingConfig = {
  epochDuration: 3600,
  maxDuration: 7 * 24 * 60 * 60,
  minVoters: 3,
  maxVoters: 1000,
};

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

  if (!rawConfig) return DEFAULTS;

  const config = rawConfig as any;

  // Named struct fields (normal case)
  if (config.epochDuration != null) {
    return {
      epochDuration: Number(config.epochDuration),
      maxDuration: Number(config.maxDuration),
      minVoters: Number(config.minVoters),
      maxVoters: Number(config.maxVoters),
    };
  }

  // Positional tuple fallback: [epochDuration, maxDuration, minVoters, maxVoters]
  if (Array.isArray(config) && config.length >= 4) {
    return {
      epochDuration: Number(config[0]),
      maxDuration: Number(config[1]),
      minVoters: Number(config[2]),
      maxVoters: Number(config[3]),
    };
  }

  return DEFAULTS;
}
