import { inAppWalletConnector } from "@thirdweb-dev/wagmi-adapter";
import { injected } from "@wagmi/core";
import { getThirdwebWalletAuthConfig } from "~~/services/thirdweb/auth";
import {
  getPreferredThirdwebChainId,
  getThirdwebWalletExecutionMode,
  thirdwebClient,
} from "~~/services/thirdweb/client";
import { setConnectedThirdwebConnectorWallet } from "~~/services/thirdweb/connectorWalletState";
import {
  findInjectedProvider,
  isCoinbaseInjectedProvider,
  isDedicatedMetaMaskProvider,
  isRainbowInjectedProvider,
} from "~~/services/web3/wagmiConnectorTargets";
import type { InjectedWalletProvider } from "~~/services/web3/wagmiConnectorTargets";

const CURYO_THIRDWEB_ICON = "/favicon.svg";

function createTargetedInjectedConnector(
  id: string,
  name: string,
  predicate: (provider: InjectedWalletProvider) => boolean,
) {
  return injected({
    shimDisconnect: true,
    target: {
      id,
      name,
      provider(window) {
        return findInjectedProvider(window, predicate) as any;
      },
    },
  });
}

/**
 * wagmi connectors for the wagmi context
 */
export const wagmiConnectors = () => {
  // Only create connectors on client-side to avoid SSR issues
  if (typeof window === "undefined") {
    return [];
  }

  const connectors = [];

  if (thirdwebClient) {
    const preferredChainId = getPreferredThirdwebChainId();

    connectors.push(
      inAppWalletConnector({
        auth: getThirdwebWalletAuthConfig(),
        client: thirdwebClient,
        executionMode: getThirdwebWalletExecutionMode(preferredChainId),
        metadata: {
          icon: CURYO_THIRDWEB_ICON,
          name: "Curyo Wallet",
        },
        onConnect: wallet => {
          setConnectedThirdwebConnectorWallet(wallet);
        },
      }),
    );
  }

  connectors.push(createTargetedInjectedConnector("io.metamask", "MetaMask", isDedicatedMetaMaskProvider));

  connectors.push(
    createTargetedInjectedConnector("com.coinbase.wallet", "Coinbase Wallet", isCoinbaseInjectedProvider),
  );

  connectors.push(createTargetedInjectedConnector("me.rainbow", "Rainbow", isRainbowInjectedProvider));

  connectors.push(
    injected({
      shimDisconnect: true,
    }),
  );

  return connectors;
};
