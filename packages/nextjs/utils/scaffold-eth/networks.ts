import * as chains from "viem/chains";
import scaffoldConfig from "~~/scaffold.config";
import { buildAlchemyHttpUrl } from "~~/utils/rpcUrls";

type ChainAttributes = {
  // color | [lightThemeColor, darkThemeColor]
  color: string | [string, string];
};

export type ChainWithAttributes = chains.Chain & Partial<ChainAttributes>;
export type AllowedChainIds = (typeof scaffoldConfig.targetNetworks)[number]["id"];

export const getAlchemyHttpUrl = (chainId: number) => {
  return buildAlchemyHttpUrl(chainId, scaffoldConfig.alchemyApiKey);
};

export const NETWORKS_EXTRA_DATA: Record<string, ChainAttributes> = {
  [chains.foundry.id]: {
    color: "#b8af0c",
  },
  [chains.mainnet.id]: {
    color: "#ff8b9e",
  },
  [chains.celo.id]: {
    color: "#FCFF52",
  },
  [chains.celoSepolia.id]: {
    color: "#476520",
  },
};

/**
 * Gives the block explorer transaction URL, returns empty string if the network is a local chain
 */
export function getBlockExplorerTxLink(chainId: number, txnHash: string) {
  const chainNames = Object.keys(chains);

  const targetChainArr = chainNames.filter(chainName => {
    const wagmiChain = chains[chainName as keyof typeof chains];
    return wagmiChain.id === chainId;
  });

  if (targetChainArr.length === 0) {
    return "";
  }

  const targetChain = targetChainArr[0] as keyof typeof chains;
  const blockExplorerTxURL = chains[targetChain]?.blockExplorers?.default?.url;

  if (!blockExplorerTxURL) {
    return "";
  }

  return `${blockExplorerTxURL}/tx/${txnHash}`;
}

/**
 * @returns targetNetworks array containing networks configured in scaffold.config including extra network metadata
 */
export function getTargetNetworks(): ChainWithAttributes[] {
  return scaffoldConfig.targetNetworks.map(targetNetwork => ({
    ...targetNetwork,
    ...NETWORKS_EXTRA_DATA[targetNetwork.id],
  }));
}
