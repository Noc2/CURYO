import deployedContracts from "@curyo/contracts/deployedContracts";
import { isAddress } from "viem";
import { RPC_OVERRIDES } from "~~/config/shared";
import { DEFAULT_DEV_TARGET_NETWORKS, resolveTargetNetworks } from "~~/utils/env/targetNetworks";

const isProduction = process.env.NODE_ENV === "production";
export type { SupportedTargetNetwork } from "~~/utils/env/targetNetworks";
const DEV_WALLET_CONNECT_PROJECT_ID = "3a8170812b534d0ff9d794f19a901d64";

function optionalEnv(value: string | undefined): string | undefined {
  const trimmedValue = value?.trim();
  return trimmedValue ? trimmedValue : undefined;
}

function isLocalhostUrl(value: string): boolean {
  const hostname = new URL(value).hostname;
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

// Next only inlines NEXT_PUBLIC_* variables into client bundles when they are
// accessed with static property reads.
const rawPublicEnv = {
  alchemyApiKey: optionalEnv(process.env.NEXT_PUBLIC_ALCHEMY_API_KEY),
  enableRpcFallback: optionalEnv(process.env.NEXT_PUBLIC_ENABLE_RPC_FALLBACK),
  frontendCode: optionalEnv(process.env.NEXT_PUBLIC_FRONTEND_CODE),
  ponderUrl: optionalEnv(process.env.NEXT_PUBLIC_PONDER_URL),
  targetNetworks: optionalEnv(process.env.NEXT_PUBLIC_TARGET_NETWORKS),
  thirdwebClientId: optionalEnv(process.env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID),
  walletConnectProjectId: optionalEnv(process.env.NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID),
} as const;

function requireUrl(name: string, value: string | undefined, fallback?: string): string {
  const resolvedValue = value ?? fallback;

  if (!resolvedValue) {
    throw new Error(`${name} is required${isProduction ? " in production" : ""}.`);
  }

  try {
    if (isProduction && isLocalhostUrl(resolvedValue)) {
      throw new Error(`${name} must not point to localhost in production.`);
    }
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }

    throw new Error(`${name} must be a valid URL.`);
  }

  return resolvedValue;
}

const targetNetworks = resolveTargetNetworks(rawPublicEnv.targetNetworks, {
  alchemyApiKey: rawPublicEnv.alchemyApiKey,
  production: isProduction,
  fallback: !isProduction ? DEFAULT_DEV_TARGET_NETWORKS : undefined,
  rpcOverrides: RPC_OVERRIDES,
});
const targetNetworkIds = targetNetworks.map(network => network.id);

const deployedContractsByChain = deployedContracts as Record<number, unknown>;
const missingDeployments = targetNetworkIds.filter(chainId => deployedContractsByChain[chainId] === undefined);

if (missingDeployments.length > 0) {
  throw new Error(
    `Missing deployed contract definitions for chain IDs: ${missingDeployments.join(", ")}. Run yarn deploy for those chains before enabling them.`,
  );
}

const walletConnectProjectId =
  rawPublicEnv.walletConnectProjectId ?? (!isProduction ? DEV_WALLET_CONNECT_PROJECT_ID : undefined);

const frontendCode = rawPublicEnv.frontendCode;
if (frontendCode && !isAddress(frontendCode)) {
  throw new Error("NEXT_PUBLIC_FRONTEND_CODE must be a valid address.");
}

export const publicEnv = {
  isProduction,
  targetNetworks,
  alchemyApiKey: rawPublicEnv.alchemyApiKey,
  thirdwebClientId: rawPublicEnv.thirdwebClientId,
  walletConnectProjectId,
  get ponderUrl() {
    return requireUrl(
      "NEXT_PUBLIC_PONDER_URL",
      rawPublicEnv.ponderUrl,
      !isProduction ? "http://localhost:42069" : undefined,
    );
  },
  frontendCode: frontendCode as `0x${string}` | undefined,
  rpcFallbackEnabled: !isProduction || rawPublicEnv.enableRpcFallback === "true",
};
