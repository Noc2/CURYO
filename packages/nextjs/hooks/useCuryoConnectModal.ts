"use client";

import { useCallback, useMemo } from "react";
import { useConnectModal } from "thirdweb/react";
import { useConnect } from "wagmi";
import { useTargetNetwork } from "~~/hooks/scaffold-eth/useTargetNetwork";
import { useThirdwebWagmiSync } from "~~/hooks/useThirdwebWagmiSync";
import { getThirdwebConnectOptions, isThirdwebWalletChain } from "~~/services/thirdweb/client";
import { BURNER_WALLET_ID } from "~~/services/web3/burner";

export function useCuryoConnectModal() {
  const { connect, isConnecting } = useConnectModal();
  const { connectAsync, connectors } = useConnect();
  const { targetNetwork } = useTargetNetwork();
  const { syncWalletToWagmi } = useThirdwebWagmiSync();
  const connectOptions = useMemo(() => getThirdwebConnectOptions(targetNetwork.id), [targetNetwork.id]);
  const thirdwebEnabled = Boolean(connectOptions) && isThirdwebWalletChain(targetNetwork.id);
  const burnerConnector = useMemo(
    () => (targetNetwork.id === 31337 ? connectors.find(connector => connector.id === BURNER_WALLET_ID) : undefined),
    [connectors, targetNetwork.id],
  );
  const connectAvailable = thirdwebEnabled || Boolean(burnerConnector);

  const openConnectModal = useCallback(async () => {
    if (connectOptions) {
      try {
        const wallet = await connect(connectOptions);
        await syncWalletToWagmi(wallet, targetNetwork.id);
        return wallet;
      } catch {
        return null;
      }
    }

    try {
      if (!burnerConnector) {
        return null;
      }

      await connectAsync({
        chainId: targetNetwork.id,
        connector: burnerConnector,
      });
      return burnerConnector;
    } catch {
      return null;
    }
  }, [burnerConnector, connect, connectAsync, connectOptions, syncWalletToWagmi, targetNetwork.id]);

  return {
    connectAvailable,
    openConnectModal,
    isConnecting,
    thirdwebEnabled,
  };
}
