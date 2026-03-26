import { wagmiConnectors } from "./wagmiConnectors";
import { Chain, createClient, fallback, http } from "viem";
import { foundry, hardhat, mainnet } from "viem/chains";
import { createConfig } from "wagmi";
import scaffoldConfig, { ScaffoldConfig } from "~~/scaffold.config";
import { getAlchemyHttpUrl } from "~~/utils/scaffold-eth";

const { targetNetworks } = scaffoldConfig;
const rpcOverrides = scaffoldConfig.rpcOverrides as ScaffoldConfig["rpcOverrides"];
const targetHasMainnet = targetNetworks.some((network: Chain) => network.id === mainnet.id);
const isProduction = process.env.NODE_ENV === "production";
const mainnetRpcUrls = [rpcOverrides?.[mainnet.id], getAlchemyHttpUrl(mainnet.id)].filter(
  (value, index, values): value is string => Boolean(value) && values.indexOf(value) === index,
);
const maybeLocalDevChains = !isProduction ? [foundry] : [];
const withOptionalMainnet = targetHasMainnet
  ? targetNetworks
  : mainnetRpcUrls.length > 0
    ? [...targetNetworks, mainnet]
    : targetNetworks;
const dedupeChains = (chains: readonly Chain[]) =>
  chains.filter((chain, index, allChains) => allChains.findIndex(candidate => candidate.id === chain.id) === index);
const resolvedEnabledChains = dedupeChains([...withOptionalMainnet, ...maybeLocalDevChains]);

if (resolvedEnabledChains.length === 0) {
  throw new Error("At least one target network must be configured for wagmi");
}

// Only add mainnet automatically when we have an explicit RPC for it.
// Otherwise wallet tooling will probe viem's public defaults in the browser,
// which can violate CSP or hit unreliable third-party endpoints.
export const enabledChains = resolvedEnabledChains as [Chain, ...Chain[]];

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
