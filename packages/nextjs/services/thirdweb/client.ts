"use client";

import { createThirdwebClient, defineChain } from "thirdweb";
import { createWallet, inAppWallet } from "thirdweb/wallets";
import { publicEnv } from "~~/utils/env/public";

const THIRDWEB_CHAIN_IDS = new Set([42220, 11142220]);

export function isThirdwebWalletChain(chainId: number | null | undefined): boolean {
  return typeof chainId === "number" && THIRDWEB_CHAIN_IDS.has(chainId);
}

export const thirdwebClient = publicEnv.thirdwebClientId
  ? createThirdwebClient({
      clientId: publicEnv.thirdwebClientId,
    })
  : null;

export const thirdwebSupportedChains = publicEnv.targetNetworks
  .filter(network => isThirdwebWalletChain(network.id))
  .map(network => defineChain(network.id));

export const thirdwebDefaultChain = thirdwebSupportedChains[0] ?? defineChain(11142220);

export const thirdwebWallets = [
  inAppWallet({
    auth: {
      options: ["google", "apple", "email", "passkey"],
      mode: "popup",
    },
    executionMode: {
      mode: "EIP7702",
      sponsorGas: true,
    },
    metadata: {
      name: "Curyo Wallet",
    },
  }),
  createWallet("io.metamask"),
  createWallet("com.coinbase.wallet"),
  createWallet("me.rainbow"),
];

export const thirdwebConnectOptions =
  thirdwebClient && thirdwebSupportedChains.length > 0
    ? {
        appMetadata: {
          name: "Curyo",
        },
        chain: thirdwebDefaultChain,
        chains: thirdwebSupportedChains,
        client: thirdwebClient,
        locale: "en_US" as const,
        showThirdwebBranding: false,
        theme: "dark" as const,
        walletConnect: {
          projectId: publicEnv.walletConnectProjectId,
        },
        wallets: thirdwebWallets,
      }
    : null;
