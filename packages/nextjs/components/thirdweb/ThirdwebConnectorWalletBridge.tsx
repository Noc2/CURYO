"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { useActiveWallet, useSetActiveWallet } from "thirdweb/react";
import { useAccount } from "wagmi";
import {
  getConnectedThirdwebConnectorWallet,
  subscribeConnectedThirdwebConnectorWallet,
} from "~~/services/thirdweb/connectorWalletState";

function normalizeAddress(value: string | undefined) {
  return value?.toLowerCase() ?? null;
}

export function ThirdwebConnectorWalletBridge() {
  const { address, chainId, connector } = useAccount();
  const activeWallet = useActiveWallet();
  const setActiveWallet = useSetActiveWallet();
  const connectorWallet = useSyncExternalStore(
    subscribeConnectedThirdwebConnectorWallet,
    getConnectedThirdwebConnectorWallet,
    getConnectedThirdwebConnectorWallet,
  );
  const reconnectAttemptRef = useRef<string | null>(null);
  const setActiveAttemptRef = useRef<string | null>(null);

  useEffect(() => {
    if (!address || !connectorWallet) {
      setActiveAttemptRef.current = null;
      return;
    }

    const normalizedAddress = normalizeAddress(address);
    const connectorWalletAddress = normalizeAddress(connectorWallet.getAccount()?.address);
    const activeWalletAddress = normalizeAddress(activeWallet?.getAccount()?.address);

    if (
      !normalizedAddress ||
      connectorWalletAddress !== normalizedAddress ||
      activeWalletAddress === normalizedAddress
    ) {
      setActiveAttemptRef.current = null;
      return;
    }

    const attemptKey = `${normalizedAddress}:${chainId ?? "unknown"}`;
    if (setActiveAttemptRef.current === attemptKey) {
      return;
    }

    setActiveAttemptRef.current = attemptKey;

    void setActiveWallet(connectorWallet).catch(error => {
      console.error("Failed to restore thirdweb wallet from wagmi connector:", error);
      setActiveAttemptRef.current = null;
    });
  }, [activeWallet, address, chainId, connectorWallet, setActiveWallet]);

  useEffect(() => {
    if (!address || connector?.id !== "in-app-wallet") {
      reconnectAttemptRef.current = null;
      return;
    }

    const normalizedAddress = normalizeAddress(address);
    const activeWalletAddress = normalizeAddress(activeWallet?.getAccount()?.address);
    const connectorWalletAddress = normalizeAddress(connectorWallet?.getAccount()?.address);

    if (
      !normalizedAddress ||
      activeWalletAddress === normalizedAddress ||
      connectorWalletAddress === normalizedAddress
    ) {
      reconnectAttemptRef.current = null;
      return;
    }

    const attemptKey = `${normalizedAddress}:${chainId ?? "unknown"}`;
    if (reconnectAttemptRef.current === attemptKey) {
      return;
    }

    reconnectAttemptRef.current = attemptKey;

    void connector.getProvider({ chainId }).catch(error => {
      console.error("Failed to reconnect thirdweb wallet from wagmi connector:", error);
      reconnectAttemptRef.current = null;
    });
  }, [activeWallet, address, chainId, connector, connectorWallet]);

  return null;
}
