"use client";

import { useCallback } from "react";
import { useActiveWallet, useDisconnect as useThirdwebDisconnect } from "thirdweb/react";
import { useDisconnect as useWagmiDisconnect } from "wagmi";
import { setConnectedThirdwebConnectorWallet } from "~~/services/thirdweb/connectorWalletState";
import { clearWalletState } from "~~/services/thirdweb/walletStateCleanup";

export function useCuryoDisconnect() {
  const activeWallet = useActiveWallet();
  const { disconnect: disconnectThirdweb } = useThirdwebDisconnect();
  const { disconnect: disconnectWagmi } = useWagmiDisconnect();

  return useCallback(async () => {
    if (activeWallet) {
      try {
        await disconnectThirdweb(activeWallet);
      } catch {
        // Disconnecting wagmi below is still worthwhile even if thirdweb cleanup fails.
      }
    }

    disconnectWagmi();
    setConnectedThirdwebConnectorWallet(null);

    if (typeof window !== "undefined") {
      clearWalletState(window.localStorage);
      clearWalletState(window.sessionStorage);
      window.location.reload();
    }
  }, [activeWallet, disconnectThirdweb, disconnectWagmi]);
}
