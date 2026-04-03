import { inAppWalletConnector } from "@thirdweb-dev/wagmi-adapter";
import { injected } from "@wagmi/core";
import { getThirdwebWalletAuthConfig } from "~~/services/thirdweb/auth";
import {
  getPreferredThirdwebChainId,
  getThirdwebWalletExecutionMode,
  thirdwebClient,
} from "~~/services/thirdweb/client";
import { setConnectedThirdwebConnectorWallet } from "~~/services/thirdweb/connectorWalletState";

const CURYO_THIRDWEB_ICON = "/favicon.svg";
const EXTERNAL_WALLET_FLAGS = [
  "isApexWallet",
  "isAvalanche",
  "isBitKeep",
  "isBlockWallet",
  "isBraveWallet",
  "isKuCoinWallet",
  "isMathWallet",
  "isOkxWallet",
  "isOKExWallet",
  "isOneInchIOSWallet",
  "isOneInchAndroidWallet",
  "isOpera",
  "isPhantom",
  "isPortal",
  "isRabby",
  "isTokenPocket",
  "isTokenary",
  "isUniswapWallet",
  "isZerion",
] as const;

type InjectedWalletProvider = {
  isCoinbaseWallet?: boolean;
  isMetaMask?: boolean;
  isRainbow?: boolean;
  providers?: InjectedWalletProvider[];
  [key: string]: unknown;
};

function findInjectedProvider(win: unknown, predicate: (provider: InjectedWalletProvider) => boolean) {
  const ethereum = (win as { ethereum?: InjectedWalletProvider } | undefined)?.ethereum;
  const providers = Array.isArray(ethereum?.providers) ? ethereum.providers : [];

  for (const provider of providers) {
    if (predicate(provider)) {
      return provider;
    }
  }

  return ethereum && predicate(ethereum) ? ethereum : undefined;
}

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

  connectors.push(
    createTargetedInjectedConnector("io.metamask", "MetaMask", provider => {
      if (!provider.isMetaMask) return false;
      return EXTERNAL_WALLET_FLAGS.every(flag => !provider[flag]);
    }),
  );

  connectors.push(
    createTargetedInjectedConnector("com.coinbase.wallet", "Coinbase Wallet", provider =>
      Boolean(provider.isCoinbaseWallet),
    ),
  );

  connectors.push(createTargetedInjectedConnector("me.rainbow", "Rainbow", provider => Boolean(provider.isRainbow)));

  connectors.push(
    injected({
      shimDisconnect: true,
    }),
  );

  return connectors;
};
