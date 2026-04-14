"use client";

import { useCallback } from "react";
import type { Wallet } from "thirdweb/wallets";
import { ConnectorAlreadyConnectedError, useAccount, useConnect } from "wagmi";
import { useTargetNetwork } from "~~/hooks/scaffold-eth/useTargetNetwork";
import { thirdwebClient } from "~~/services/thirdweb/client";
import {
  TARGETED_INJECTED_THIRDWEB_WALLET_IDS,
  hasTargetedInjectedProvider,
} from "~~/services/web3/injectedWalletProviders";

function isTargetedInjectedThirdwebWallet(wallet: Pick<Wallet, "id">) {
  return TARGETED_INJECTED_THIRDWEB_WALLET_IDS.includes(
    wallet.id as (typeof TARGETED_INJECTED_THIRDWEB_WALLET_IDS)[number],
  );
}

export function getWagmiConnectorIdForThirdwebWallet(wallet: Wallet, options?: { window?: unknown }): string | null {
  if (wallet.id === "inApp") {
    return "in-app-wallet";
  }

  if (hasTargetedInjectedProvider(wallet.id, options?.window)) {
    return wallet.id;
  }

  return isTargetedInjectedThirdwebWallet(wallet) ? null : "injected";
}

export function shouldSkipThirdwebWagmiSync(params: {
  connectorId: string;
  currentAddress?: string;
  currentChainId?: number;
  currentConnectorId?: string;
  forceReconnect?: boolean;
  requestedAddress?: string;
  requestedChainId: number;
}) {
  if (params.forceReconnect) {
    return false;
  }

  return (
    params.currentConnectorId === params.connectorId &&
    params.currentChainId === params.requestedChainId &&
    params.currentAddress?.toLowerCase() === params.requestedAddress?.toLowerCase()
  );
}

export function getThirdwebWagmiSyncOptions(
  wallet: Pick<Wallet, "id">,
  options: { source: "autoConnect" | "manualConnect" },
): { reconnect: true } | undefined {
  if (wallet.id === "inApp" && options.source === "autoConnect") {
    return { reconnect: true };
  }

  if (isTargetedInjectedThirdwebWallet(wallet)) {
    return { reconnect: true };
  }

  return undefined;
}

export function useThirdwebWagmiSync() {
  const { connectAsync, connectors } = useConnect();
  const { address, chainId, connector: activeConnector } = useAccount();
  const { targetNetwork } = useTargetNetwork();

  const syncWalletToWagmi = useCallback(
    async (wallet: Wallet, fallbackChainId: number = targetNetwork.id, options?: { reconnect?: boolean }) => {
      if (!thirdwebClient) {
        return;
      }

      const connectorId = getWagmiConnectorIdForThirdwebWallet(wallet, {
        window: typeof window === "undefined" ? undefined : window,
      });
      if (!connectorId) {
        console.warn(`[thirdweb] Skipping wagmi sync for ${wallet.id}; no matching injected provider is available`);
        return;
      }

      const connector = connectors.find(item => item.id === connectorId);
      if (!connector) {
        throw new Error(`Wagmi connector "${connectorId}" is not configured`);
      }

      const requestedChainId = wallet.getChain()?.id ?? fallbackChainId;
      const requestedAddress = wallet.getAccount()?.address;

      if (
        shouldSkipThirdwebWagmiSync({
          connectorId: connector.id,
          currentAddress: address,
          currentChainId: chainId,
          currentConnectorId: activeConnector?.id,
          forceReconnect: options?.reconnect,
          requestedAddress,
          requestedChainId,
        })
      ) {
        return;
      }

      try {
        await connectAsync({
          chainId: requestedChainId,
          connector,
          isReconnecting: options?.reconnect,
          ...(connector.id === "in-app-wallet" ? { wallet } : {}),
        } as any);
      } catch (error) {
        if (error instanceof ConnectorAlreadyConnectedError) {
          return;
        }
        throw error;
      }
    },
    [activeConnector?.id, address, chainId, connectAsync, connectors, targetNetwork.id],
  );

  return {
    syncWalletToWagmi,
  };
}
