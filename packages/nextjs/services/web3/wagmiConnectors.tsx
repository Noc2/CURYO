import { inAppWalletConnector } from "@thirdweb-dev/wagmi-adapter";
import * as chains from "viem/chains";
import scaffoldConfig from "~~/scaffold.config";
import {
  getPreferredThirdwebChainId,
  getThirdwebWalletExecutionMode,
  thirdwebClient,
} from "~~/services/thirdweb/client";
import { createBurnerConnector } from "~~/services/web3/burner";

const { onlyLocalBurnerWallet, targetNetworks } = scaffoldConfig;

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
        auth: {
          options: ["google", "apple", "email", "passkey"],
          mode: "popup",
        },
        client: thirdwebClient,
        executionMode: getThirdwebWalletExecutionMode(preferredChainId),
        metadata: {
          icon: "/favicon.png",
          name: "Curyo Wallet",
        },
      }),
    );
  }

  if (targetNetworks.some(network => network.id === (chains.hardhat as chains.Chain).id) || !onlyLocalBurnerWallet) {
    connectors.push(createBurnerConnector());
  }

  return connectors;
};
