import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import {
  baseAccount,
  ledgerWallet,
  metaMaskWallet,
  rainbowWallet,
  safeWallet,
  walletConnectWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { inAppWalletConnector } from "@thirdweb-dev/wagmi-adapter";
import { rainbowkitBurnerWallet } from "burner-connector";
import * as chains from "viem/chains";
import scaffoldConfig from "~~/scaffold.config";
import { thirdwebClient } from "~~/services/thirdweb/client";

const { onlyLocalBurnerWallet, targetNetworks } = scaffoldConfig;

const wallets = [
  metaMaskWallet,
  walletConnectWallet,
  ledgerWallet,
  baseAccount,
  rainbowWallet,
  safeWallet,
  ...(targetNetworks.some(network => network.id === (chains.hardhat as chains.Chain).id) || !onlyLocalBurnerWallet
    ? [rainbowkitBurnerWallet]
    : []),
];

/**
 * wagmi connectors for the wagmi context
 */
export const wagmiConnectors = () => {
  // Only create connectors on client-side to avoid SSR issues
  // TODO: update when https://github.com/rainbow-me/rainbowkit/issues/2476 is resolved
  if (typeof window === "undefined") {
    return [];
  }

  const rainbowKitConnectors = connectorsForWallets(
    [
      {
        groupName: "Supported Wallets",
        wallets,
      },
    ],

    {
      appName: "scaffold-eth-2",
      projectId: scaffoldConfig.walletConnectProjectId,
    },
  );

  if (!thirdwebClient) {
    return rainbowKitConnectors;
  }

  const thirdwebConnector = inAppWalletConnector({
    auth: {
      options: ["google", "apple", "email", "passkey"],
    },
    client: thirdwebClient,
    executionMode: {
      mode: "EIP7702",
      sponsorGas: true,
    },
    metadata: {
      icon: "/favicon.png",
      name: "Curyo Wallet",
    },
  });

  return [thirdwebConnector, ...rainbowKitConnectors];
};
