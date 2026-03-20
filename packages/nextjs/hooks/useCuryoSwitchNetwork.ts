"use client";

import { useCallback, useState } from "react";
import { defineChain } from "thirdweb";
import { useActiveWallet, useSwitchActiveWalletChain } from "thirdweb/react";
import { useSwitchChain } from "wagmi";
import { useThirdwebWagmiSync } from "~~/hooks/useThirdwebWagmiSync";

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
          await wagmiSwitch({ chainId });
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
