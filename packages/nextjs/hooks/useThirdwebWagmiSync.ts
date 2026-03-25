"use client";

import { useCallback } from "react";
import type { Wallet } from "thirdweb/wallets";
import { ConnectorAlreadyConnectedError, useAccount, useConnect } from "wagmi";
import { useTargetNetwork } from "~~/hooks/scaffold-eth/useTargetNetwork";
import { thirdwebClient } from "~~/services/thirdweb/client";

export function getWagmiConnectorIdForThirdwebWallet(wallet: Wallet) {
  return wallet.id === "inApp" ? "in-app-wallet" : "injected";
}

export function shouldSkipThirdwebWagmiSync(params: {
  connectorId: string;
  currentAddress?: string;
  currentChainId?: number;
  currentConnectorId?: string;
  requestedAddress?: string;
  requestedChainId: number;
}) {
  return (
    params.currentConnectorId === params.connectorId &&
    params.currentChainId === params.requestedChainId &&
    params.currentAddress?.toLowerCase() === params.requestedAddress?.toLowerCase()
  );
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

      const connectorId = getWagmiConnectorIdForThirdwebWallet(wallet);
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
          requestedAddress,
          requestedChainId,
        })
      ) {
        return;
      }

      try {
        await connectAsync(
          {
            chainId: requestedChainId,
            connector,
            isReconnecting: options?.reconnect,
            ...(connector.id === "in-app-wallet" ? { wallet } : {}),
          } as any,
        );
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
