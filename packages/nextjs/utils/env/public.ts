import { isAddress } from "viem";
import * as chains from "viem/chains";
import deployedContracts from "~~/contracts/deployedContracts";

const isProduction = process.env.NODE_ENV === "production";

const AVAILABLE_TARGET_NETWORKS = {
  [chains.foundry.id]: chains.foundry,
  [chains.celoSepolia.id]: chains.celoSepolia,
  [chains.celo.id]: chains.celo,
} as const satisfies Record<number, chains.Chain>;

export type SupportedTargetNetwork = (typeof AVAILABLE_TARGET_NETWORKS)[keyof typeof AVAILABLE_TARGET_NETWORKS];

const DEFAULT_DEV_TARGET_NETWORKS = `${chains.foundry.id},${chains.celoSepolia.id}`;

export const DEFAULT_ALCHEMY_API_KEY = "cR4WnXePioePZ5fFrnSiR";
const DEV_WALLET_CONNECT_PROJECT_ID = "3a8170812b534d0ff9d794f19a901d64";

function readEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function isLocalhostUrl(value: string): boolean {
  const hostname = new URL(value).hostname;
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function requireUrl(name: string, fallback?: string): string {
  const value = readEnv(name) ?? fallback;

  if (!value) {
    throw new Error(`${name} is required${isProduction ? " in production" : ""}.`);
  }

  try {
    if (isProduction && isLocalhostUrl(value)) {
      throw new Error(`${name} must not point to localhost in production.`);
    }
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }

    throw new Error(`${name} must be a valid URL.`);
  }

  return value;
}

function parseTargetNetworkIds(value: string): number[] {
  const ids = value
    .split(",")
    .map(item => item.trim())
    .filter(Boolean)
    .map(item => Number.parseInt(item, 10));

  if (ids.length === 0 || ids.some(id => !Number.isInteger(id))) {
    throw new Error("NEXT_PUBLIC_TARGET_NETWORKS must be a comma-separated list of numeric chain IDs.");
  }

  return [...new Set(ids)];
}

const targetNetworkIdsEnv = readEnv("NEXT_PUBLIC_TARGET_NETWORKS");

if (isProduction && !targetNetworkIdsEnv) {
  throw new Error("NEXT_PUBLIC_TARGET_NETWORKS is required in production.");
}

const targetNetworkIds = parseTargetNetworkIds(targetNetworkIdsEnv ?? DEFAULT_DEV_TARGET_NETWORKS);

if (isProduction && targetNetworkIds.includes(chains.foundry.id)) {
  throw new Error("NEXT_PUBLIC_TARGET_NETWORKS must not include the local Foundry chain in production.");
}

const targetNetworks = targetNetworkIds.map(chainId => {
  const network = AVAILABLE_TARGET_NETWORKS[chainId as keyof typeof AVAILABLE_TARGET_NETWORKS];

  if (!network) {
    throw new Error(
      `Unsupported target network ${chainId}. Supported chains: ${Object.keys(AVAILABLE_TARGET_NETWORKS).join(", ")}.`,
    );
  }

  return network;
}) as unknown as [SupportedTargetNetwork, ...SupportedTargetNetwork[]];

const deployedContractsByChain = deployedContracts as Record<number, unknown>;
const missingDeployments = targetNetworkIds.filter(chainId => deployedContractsByChain[chainId] === undefined);

if (missingDeployments.length > 0) {
  throw new Error(
    `Missing deployed contract definitions for chain IDs: ${missingDeployments.join(", ")}. Run yarn deploy for those chains before enabling them.`,
  );
}

const walletConnectProjectId =
  readEnv("NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID") ?? (!isProduction ? DEV_WALLET_CONNECT_PROJECT_ID : undefined);

if (!walletConnectProjectId) {
  throw new Error("NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID is required in production.");
}

const frontendCode = readEnv("NEXT_PUBLIC_FRONTEND_CODE");
if (frontendCode && !isAddress(frontendCode)) {
  throw new Error("NEXT_PUBLIC_FRONTEND_CODE must be a valid address.");
}

export const publicEnv = {
  isProduction,
  targetNetworks,
  alchemyApiKey: readEnv("NEXT_PUBLIC_ALCHEMY_API_KEY") ?? (!isProduction ? DEFAULT_ALCHEMY_API_KEY : undefined),
  walletConnectProjectId,
  ponderUrl: requireUrl("NEXT_PUBLIC_PONDER_URL", !isProduction ? "http://localhost:42069" : undefined),
  frontendCode: frontendCode as `0x${string}` | undefined,
  rpcFallbackEnabled: !isProduction || process.env.NEXT_PUBLIC_ENABLE_RPC_FALLBACK === "true",
};
