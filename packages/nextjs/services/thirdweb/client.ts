"use client";

import { createThirdwebClient, defineChain } from "thirdweb";
import type { AutoConnectProps } from "thirdweb/react";
import type { UseConnectModalOptions } from "thirdweb/react";
import { createWallet, inAppWallet } from "thirdweb/wallets";
import { getThirdwebWalletAuthConfig } from "~~/services/thirdweb/auth";
import { publicEnv } from "~~/utils/env/public";

const THIRDWEB_CONNECT_CHAIN_IDS = new Set([31337, 42220, 11142220]);
const THIRDWEB_EXECUTION_CHAIN_IDS = new Set([42220, 11142220]);
const THIRDWEB_ACTIVE_CHAIN_KEY = "thirdweb:active-chain";
const CURYO_THIRDWEB_ICON = "/favicon.svg";
const CURYO_THIRDWEB_WORDMARK = "/curyo-thirdweb-lockup.svg";

export function isThirdwebWalletChain(chainId: number | null | undefined): boolean {
  return typeof chainId === "number" && THIRDWEB_CONNECT_CHAIN_IDS.has(chainId);
}

export function supportsThirdwebExecutionCapabilities(chainId: number | null | undefined): boolean {
  return typeof chainId === "number" && THIRDWEB_EXECUTION_CHAIN_IDS.has(chainId);
}

export const thirdwebClient = publicEnv.thirdwebClientId
  ? createThirdwebClient({
      clientId: publicEnv.thirdwebClientId,
    })
  : null;

export const thirdwebSupportedChains = publicEnv.targetNetworks
  .filter(network => isThirdwebWalletChain(network.id))
  .map(network => defineChain(network));

export const thirdwebDefaultChain = thirdwebSupportedChains[0] ?? defineChain(publicEnv.targetNetworks[0]);

function getStoredThirdwebChainId() {
  if (typeof window === "undefined") {
    return undefined;
  }

  try {
    const rawValue = window.localStorage.getItem(THIRDWEB_ACTIVE_CHAIN_KEY);
    if (!rawValue) {
      return undefined;
    }

    const parsedValue = JSON.parse(rawValue) as { id?: number };
    return typeof parsedValue.id === "number" ? parsedValue.id : undefined;
  } catch {
    return undefined;
  }
}

export function getPreferredThirdwebChainId(requestedChainId?: number): number {
  if (isThirdwebWalletChain(requestedChainId)) {
    return requestedChainId as number;
  }

  const storedChainId = getStoredThirdwebChainId();
  if (isThirdwebWalletChain(storedChainId)) {
    return storedChainId as number;
  }

  return thirdwebDefaultChain.id;
}

export function getThirdwebWalletExecutionMode(chainId: number) {
  if (supportsThirdwebExecutionCapabilities(chainId)) {
    return {
      mode: "EIP7702" as const,
      sponsorGas: true,
    };
  }

  return {
    mode: "EOA" as const,
  };
}

export function getThirdwebWallets(chainId: number = thirdwebDefaultChain.id) {
  return [
    inAppWallet({
      auth: getThirdwebWalletAuthConfig(),
      executionMode: getThirdwebWalletExecutionMode(chainId),
      metadata: {
        image: {
          alt: "Curyo",
          height: 100,
          src: CURYO_THIRDWEB_WORDMARK,
          width: 320,
        },
        name: "Curyo Wallet",
      },
    }),
    createWallet("io.metamask"),
    createWallet("com.coinbase.wallet"),
    createWallet("me.rainbow"),
  ];
}

export function getThirdwebConnectOptions(chainId?: number): UseConnectModalOptions | null {
  if (!thirdwebClient || thirdwebSupportedChains.length === 0) {
    return null;
  }

  const preferredChainId = getPreferredThirdwebChainId(chainId);
  const chain =
    thirdwebSupportedChains.find(supportedChain => supportedChain.id === preferredChainId) ?? thirdwebDefaultChain;

  return {
    appMetadata: {
      name: "Curyo",
      logoUrl: CURYO_THIRDWEB_ICON,
    },
    chain,
    chains: thirdwebSupportedChains,
    client: thirdwebClient,
    locale: "en_US",
    showThirdwebBranding: false,
    theme: "dark",
    title: "Curyo",
    titleIcon: CURYO_THIRDWEB_ICON,
    ...(publicEnv.walletConnectProjectId
      ? {
          walletConnect: {
            projectId: publicEnv.walletConnectProjectId,
          },
        }
      : {}),
    wallets: getThirdwebWallets(chain.id),
  };
}

export function getThirdwebAutoConnectOptions(): AutoConnectProps | null {
  if (!thirdwebClient || thirdwebSupportedChains.length === 0) {
    return null;
  }

  const preferredChainId = getPreferredThirdwebChainId();
  const chain = thirdwebSupportedChains.find(supportedChain => supportedChain.id === preferredChainId) ?? undefined;

  return {
    appMetadata: {
      name: "Curyo",
      logoUrl: CURYO_THIRDWEB_ICON,
    },
    chain,
    client: thirdwebClient,
    timeout: 15_000,
    wallets: getThirdwebWallets(preferredChainId),
  };
}
