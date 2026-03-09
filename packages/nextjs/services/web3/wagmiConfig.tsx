import { wagmiConnectors } from "./wagmiConnectors";
import { Chain, createClient, fallback, http } from "viem";
import { hardhat, mainnet } from "viem/chains";
import { createConfig } from "wagmi";
import scaffoldConfig, { ScaffoldConfig } from "~~/scaffold.config";
import { getAlchemyHttpUrl } from "~~/utils/scaffold-eth";

const { targetNetworks } = scaffoldConfig;
const rpcOverrides = scaffoldConfig.rpcOverrides as ScaffoldConfig["rpcOverrides"];
const targetHasMainnet = targetNetworks.some((network: Chain) => network.id === mainnet.id);
const mainnetRpcUrls = [rpcOverrides?.[mainnet.id], getAlchemyHttpUrl(mainnet.id)].filter(
  (value, index, values): value is string => Boolean(value) && values.indexOf(value) === index,
);

// Only add mainnet automatically when we have an explicit RPC for it.
// Otherwise RainbowKit/Wagmi will probe viem's public defaults in the browser,
// which can violate CSP or hit unreliable third-party endpoints.
export const enabledChains = targetHasMainnet
  ? targetNetworks
  : mainnetRpcUrls.length > 0
    ? ([...targetNetworks, mainnet] as const)
    : targetNetworks;

export const wagmiConfig = createConfig({
  chains: enabledChains,
  connectors: wagmiConnectors(),
  ssr: true,
  client: ({ chain }) => {
    const rpcUrls = [rpcOverrides?.[chain.id], getAlchemyHttpUrl(chain.id)].filter(
      (value, index, values): value is string => Boolean(value) && values.indexOf(value) === index,
    );
    const rpcFallbacks = rpcUrls.length > 0 ? rpcUrls.map(url => http(url)) : [http()];

    return createClient({
      chain,
      transport: fallback(rpcFallbacks),
      ...(chain.id !== (hardhat as Chain).id ? { pollingInterval: scaffoldConfig.pollingInterval } : {}),
    });
  },
});
