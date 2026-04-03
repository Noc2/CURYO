"use client";

import { createThirdwebClient, defineChain } from "thirdweb";
import type { AutoConnectProps } from "thirdweb/react";
import type { UseConnectModalOptions } from "thirdweb/react";
import { createWallet, inAppWallet } from "thirdweb/wallets";
import type { Wallet } from "thirdweb/wallets";
import { getThirdwebWalletAuthConfig } from "~~/services/thirdweb/auth";
import { getAvailableThirdwebExternalWalletIds } from "~~/services/web3/injectedWalletProviders";
import { publicEnv } from "~~/utils/env/public";

const THIRDWEB_CONNECT_CHAIN_IDS = new Set([31337, 42220, 11142220]);
const THIRDWEB_EXECUTION_CHAIN_IDS = new Set([42220, 11142220]);
const THIRDWEB_ACTIVE_CHAIN_KEY = "thirdweb:active-chain";
const THIRDWEB_SPONSORSHIP_MODE_KEY = "thirdweb:sponsorship-mode";
const CURYO_THIRDWEB_ICON = "/favicon.svg";
const CURYO_THIRDWEB_WORDMARK = "/curyo-thirdweb-lockup.svg";

type ThirdwebWalletExecutionMode =
  | {
      mode: "EOA";
    }
  | {
      mode: "EIP7702";
      sponsorGas?: boolean;
    };

type ThirdwebSponsorshipMode = "sponsored" | "self-funded";

export function isThirdwebWalletChain(chainId: number | null | undefined): boolean {
  return typeof chainId === "number" && THIRDWEB_CONNECT_CHAIN_IDS.has(chainId);
}

export function supportsThirdwebExecutionCapabilities(chainId: number | null | undefined): boolean {
  return typeof chainId === "number" && THIRDWEB_EXECUTION_CHAIN_IDS.has(chainId);
}

export function getThirdwebPaymasterServiceUrl(chainId: number): string | null {
  if (!publicEnv.thirdwebClientId || !supportsThirdwebExecutionCapabilities(chainId)) {
    return null;
  }

  return `https://${chainId}.bundler.thirdweb.com/${publicEnv.thirdwebClientId}`;
}

export const thirdwebClient = publicEnv.thirdwebClientId
  ? createThirdwebClient({
      clientId: publicEnv.thirdwebClientId,
    })
  : null;

const thirdwebSupportedChains = publicEnv.targetNetworks
  .filter(network => isThirdwebWalletChain(network.id))
  .map(network => defineChain(network));
const thirdwebSupportedChainIds = new Set(thirdwebSupportedChains.map(chain => chain.id));

const thirdwebDefaultChain = thirdwebSupportedChains[0] ?? defineChain(publicEnv.targetNetworks[0]);

function isConfiguredThirdwebWalletChain(chainId: number | null | undefined): chainId is number {
  return typeof chainId === "number" && thirdwebSupportedChainIds.has(chainId);
}

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
    if (isConfiguredThirdwebWalletChain(parsedValue.id)) {
      return parsedValue.id;
    }

    if (typeof parsedValue.id === "number") {
      window.localStorage.removeItem(THIRDWEB_ACTIVE_CHAIN_KEY);
    }

    return undefined;
  } catch {
    return undefined;
  }
}

export function getPreferredThirdwebChainId(requestedChainId?: number): number {
  if (isConfiguredThirdwebWalletChain(requestedChainId)) {
    return requestedChainId as number;
  }

  const storedChainId = getStoredThirdwebChainId();
  if (isConfiguredThirdwebWalletChain(storedChainId)) {
    return storedChainId as number;
  }

  return thirdwebDefaultChain.id;
}

function getStoredThirdwebSponsorshipMode(): ThirdwebSponsorshipMode | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const rawValue = window.localStorage.getItem(THIRDWEB_SPONSORSHIP_MODE_KEY);
    return rawValue === "sponsored" || rawValue === "self-funded" ? rawValue : null;
  } catch {
    return null;
  }
}

export function setStoredThirdwebSponsorshipMode(mode: ThirdwebSponsorshipMode | null) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    if (!mode) {
      window.localStorage.removeItem(THIRDWEB_SPONSORSHIP_MODE_KEY);
      return;
    }

    window.localStorage.setItem(THIRDWEB_SPONSORSHIP_MODE_KEY, mode);
  } catch {
    // Ignore storage failures in private browsing / restricted environments.
  }
}

export function getThirdwebWalletExecutionMode(
  chainId: number,
  options?: { sponsorshipMode?: ThirdwebSponsorshipMode | null },
): ThirdwebWalletExecutionMode {
  if (supportsThirdwebExecutionCapabilities(chainId)) {
    const sponsorshipMode = options?.sponsorshipMode ?? getStoredThirdwebSponsorshipMode() ?? "sponsored";
    return {
      mode: "EIP7702" as const,
      ...(sponsorshipMode === "sponsored" ? { sponsorGas: true } : {}),
    };
  }

  return {
    mode: "EOA" as const,
  };
}

export function getThirdwebWalletSponsorshipMode(wallet: Wallet | null | undefined): ThirdwebSponsorshipMode | null {
  if (!wallet || wallet.id !== "inApp") {
    return null;
  }

  const walletConfig = wallet.getConfig() as { executionMode?: { mode?: string; sponsorGas?: boolean } } | undefined;
  if (walletConfig?.executionMode?.mode === "EIP7702") {
    return walletConfig.executionMode.sponsorGas ? "sponsored" : "self-funded";
  }

  return null;
}

export function createThirdwebInAppWallet(
  chainId: number,
  options?: { sponsorshipMode?: ThirdwebSponsorshipMode | null },
) {
  return inAppWallet({
    auth: getThirdwebWalletAuthConfig(),
    executionMode: getThirdwebWalletExecutionMode(chainId, options),
    metadata: {
      image: {
        alt: "Curyo",
        height: 100,
        src: CURYO_THIRDWEB_WORDMARK,
        width: 320,
      },
      name: "Curyo Wallet",
    },
  });
}

export function getThirdwebWalletIds(
  win: unknown = typeof window === "undefined" ? undefined : window,
): Array<"inApp" | "io.metamask" | "com.coinbase.wallet" | "me.rainbow"> {
  return ["inApp", ...getAvailableThirdwebExternalWalletIds(win)];
}

function getThirdwebWallets(chainId: number = thirdwebDefaultChain.id) {
  return getThirdwebWalletIds().map(walletId =>
    walletId === "inApp" ? createThirdwebInAppWallet(chainId) : createWallet(walletId),
  );
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
