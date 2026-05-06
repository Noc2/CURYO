"use client";

import { useCallback, useState } from "react";
import { defineChain } from "thirdweb";
import { useActiveWallet, useSwitchActiveWalletChain } from "thirdweb/react";
import { injectedProvider } from "thirdweb/wallets";
import { useSwitchChain } from "wagmi";
import { useThirdwebWagmiSync } from "~~/hooks/useThirdwebWagmiSync";
import { addAndSwitchEthereumChain, isUnknownWalletChainError } from "~~/hooks/useWalletRpcRecovery";
import { getTargetNetworks } from "~~/utils/scaffold-eth";

export function useCuryoSwitchNetwork() {
  const activeWallet = useActiveWallet();
  const switchActiveWalletChain = useSwitchActiveWalletChain();
  const { switchChain, switchChainAsync } = useSwitchChain();
  const { syncWalletToWagmi } = useThirdwebWagmiSync();
  const [switchingChainId, setSwitchingChainId] = useState<number | null>(null);

  const switchToChain = useCallback(
    async (chainId: number) => {
      setSwitchingChainId(chainId);

      try {
        const wagmiSwitch = switchChainAsync ?? switchChain;

        if (wagmiSwitch) {
          try {
            await wagmiSwitch({ chainId });
          } catch (error) {
            const targetChain = getTargetNetworks().find(targetNetwork => targetNetwork.id === chainId);
            const walletId = activeWallet?.id;

            if (walletId !== "io.metamask" || !targetChain || !isUnknownWalletChainError(error)) {
              throw error;
            }

            const provider = injectedProvider(walletId);
            if (!provider) {
              throw error;
            }

            await addAndSwitchEthereumChain(provider, targetChain);
          }
          return;
        }

        if (!activeWallet) {
          return;
        }

        await switchActiveWalletChain(defineChain(chainId));
        await syncWalletToWagmi(activeWallet, chainId);
      } finally {
        setSwitchingChainId(currentChainId => (currentChainId === chainId ? null : currentChainId));
      }
    },
    [activeWallet, switchActiveWalletChain, switchChain, switchChainAsync, syncWalletToWagmi],
  );

  return {
    switchToChain,
    switchingChainId,
  };
}
