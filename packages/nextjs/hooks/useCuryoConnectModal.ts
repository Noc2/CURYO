"use client";

import { useCallback, useMemo } from "react";
import { useConnectModal } from "thirdweb/react";
import { useTargetNetwork } from "~~/hooks/scaffold-eth/useTargetNetwork";
import { getThirdwebWagmiSyncOptions, useThirdwebWagmiSync } from "~~/hooks/useThirdwebWagmiSync";
import { getThirdwebConnectOptions, isThirdwebWalletChain } from "~~/services/thirdweb/client";

export function useCuryoConnectModal() {
  const { connect, isConnecting } = useConnectModal();
  const { targetNetwork } = useTargetNetwork();
  const { syncWalletToWagmi } = useThirdwebWagmiSync();
  const connectOptions = useMemo(() => getThirdwebConnectOptions(targetNetwork.id), [targetNetwork.id]);
  const thirdwebEnabled = Boolean(connectOptions) && isThirdwebWalletChain(targetNetwork.id);

  const openConnectModal = useCallback(async () => {
    try {
      if (!connectOptions) {
        return null;
      }

      const wallet = await connect(connectOptions);
      await syncWalletToWagmi(
        wallet,
        targetNetwork.id,
        getThirdwebWagmiSyncOptions(wallet, { source: "manualConnect" }),
      );
      return wallet;
    } catch {
      return null;
    }
  }, [connect, connectOptions, syncWalletToWagmi, targetNetwork.id]);

  return {
    openConnectModal,
    isConnecting,
    thirdwebEnabled,
  };
}
