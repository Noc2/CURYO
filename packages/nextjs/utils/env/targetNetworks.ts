import { withPreferredHttpRpcUrls } from "../rpcUrls";
import * as chains from "viem/chains";

// viem still labels Celo Sepolia's native token as S-CELO, but wallets like
// MetaMask expect the native symbol to be CELO for the testnet network config.
const celoSepolia = {
  ...chains.celoSepolia,
  nativeCurrency: {
    ...chains.celoSepolia.nativeCurrency,
    symbol: "CELO",
  },
} satisfies chains.Chain;

export const AVAILABLE_TARGET_NETWORKS = {
  [chains.foundry.id]: chains.foundry,
  [chains.celoSepolia.id]: celoSepolia,
  [chains.celo.id]: chains.celo,
} as const satisfies Record<number, chains.Chain>;

export type SupportedTargetNetwork = (typeof AVAILABLE_TARGET_NETWORKS)[keyof typeof AVAILABLE_TARGET_NETWORKS];

export const DEFAULT_DEV_TARGET_NETWORKS = `${chains.foundry.id}`;

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

export function resolveTargetNetworks(
  rawValue: string | undefined,
  options: {
    production: boolean;
    fallback?: string;
    allowFoundryInProduction?: boolean;
    alchemyApiKey?: string;
    rpcOverrides?: Partial<Record<number, string>>;
  },
): [SupportedTargetNetwork, ...SupportedTargetNetwork[]] {
  const resolvedValue = rawValue?.trim() || options.fallback;

  if (!resolvedValue) {
    throw new Error("NEXT_PUBLIC_TARGET_NETWORKS is required in production.");
  }

  const targetNetworkIds = parseTargetNetworkIds(resolvedValue);

  if (options.production && !options.allowFoundryInProduction && targetNetworkIds.includes(chains.foundry.id)) {
    throw new Error("NEXT_PUBLIC_TARGET_NETWORKS must not include the local Foundry chain in production.");
  }

  const targetNetworks = targetNetworkIds.map(chainId => {
    const network = AVAILABLE_TARGET_NETWORKS[chainId as keyof typeof AVAILABLE_TARGET_NETWORKS];

    if (!network) {
      throw new Error(
        `Unsupported target network ${chainId}. Supported chains: ${Object.keys(AVAILABLE_TARGET_NETWORKS).join(", ")}.`,
      );
    }

    return withPreferredHttpRpcUrls(network, {
      alchemyApiKey: options.alchemyApiKey,
      rpcOverrides: options.rpcOverrides,
    });
  });

  return targetNetworks as [SupportedTargetNetwork, ...SupportedTargetNetwork[]];
}
