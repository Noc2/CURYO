import type { Chain } from "viem";

const RPC_CHAIN_NAMES: Record<number, string> = {
  1: "eth-mainnet",
  5: "eth-goerli",
  10: "opt-mainnet",
  69: "opt-goerli",
  1101: "polygonzkevm-mainnet",
  1442: "polygonzkevm-testnet",
  137: "polygon-mainnet",
  280: "zksync-era-testnet",
  420: "opt-sepolia",
  8453: "base-mainnet",
  84531: "base-goerli",
  84532: "base-sepolia",
  42161: "arb-mainnet",
  421613: "arb-goerli",
  421614: "arb-sepolia",
  42220: "celo-mainnet",
  44787: "celo-alfajores",
  11155111: "eth-sepolia",
  11155420: "opt-sepolia",
  11142220: "celo-sepolia",
  80001: "polygon-mumbai",
  80002: "polygon-amoy",
  81_437: "blast-sepolia",
  59_140: "linea-sepolia",
};

type RpcPreferenceOptions = {
  alchemyApiKey?: string;
  rpcOverrides?: Partial<Record<number, string>>;
};

function normalizeHttpUrl(value: string, name = "RPC URL") {
  const trimmedValue = value.trim();
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(trimmedValue);
  } catch {
    throw new Error(`${name} must be a valid http(s) URL.`);
  }

  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    throw new Error(`${name} must be a valid http(s) URL.`);
  }

  return parsedUrl.toString().replace(/\/$/, "");
}

export function resolveRpcOverrides(values: Partial<Record<number, string | undefined>>) {
  const overrides: Partial<Record<number, string>> = {};

  for (const [chainId, rawValue] of Object.entries(values)) {
    if (!rawValue) {
      continue;
    }

    overrides[Number.parseInt(chainId, 10)] = normalizeHttpUrl(rawValue, `RPC override for chain ${chainId}`);
  }

  return overrides;
}

export function mergeRpcOverrides(...sources: Array<Partial<Record<number, string>> | undefined>) {
  const merged: Partial<Record<number, string>> = {};

  for (const source of sources) {
    if (!source) {
      continue;
    }

    Object.assign(merged, source);
  }

  return merged;
}

function uniqueHttpUrls(values: Array<string | undefined>) {
  return values
    .map(value => value?.trim())
    .filter((value, index, allValues): value is string => Boolean(value) && allValues.indexOf(value) === index);
}

export function buildAlchemyHttpUrl(chainId: number, alchemyApiKey?: string) {
  const apiKey = alchemyApiKey?.trim();
  if (!apiKey) {
    return undefined;
  }

  const chainName = RPC_CHAIN_NAMES[chainId];
  if (!chainName) {
    return undefined;
  }

  return `https://${chainName}.g.alchemy.com/v2/${apiKey}`;
}

export function getPreferredHttpRpcUrls(chain: Chain, options: RpcPreferenceOptions = {}) {
  return uniqueHttpUrls([
    options.rpcOverrides?.[chain.id],
    buildAlchemyHttpUrl(chain.id, options.alchemyApiKey),
    ...chain.rpcUrls.default.http,
  ]);
}

export function withPreferredHttpRpcUrls<TChain extends Chain>(chain: TChain, options: RpcPreferenceOptions = {}) {
  const preferredHttpUrls = getPreferredHttpRpcUrls(chain, options);
  const currentHttpUrls = chain.rpcUrls.default.http;

  if (
    preferredHttpUrls.length === currentHttpUrls.length &&
    preferredHttpUrls.every((url, index) => url === currentHttpUrls[index])
  ) {
    return chain;
  }

  return {
    ...chain,
    rpcUrls: {
      ...chain.rpcUrls,
      default: {
        ...chain.rpcUrls.default,
        http: preferredHttpUrls,
      },
    },
  } as TChain;
}
