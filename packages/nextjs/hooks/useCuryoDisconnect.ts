"use client";

import { useCallback } from "react";
import { useActiveWallet, useDisconnect as useThirdwebDisconnect } from "thirdweb/react";
import { useDisconnect as useWagmiDisconnect } from "wagmi";

const WALLET_STATE_PREFIXES = [
  "thirdweb:",
  "thirdwebEwsWallet",
  "thirdweb_guest_session_id_",
  "walletToken-",
  "a-",
  "wagmi.",
] as const;

function clearWalletState(storage: Storage | null) {
  if (!storage) {
    return;
  }

  const keysToRemove: string[] = [];

  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (!key) {
      continue;
    }

    if (WALLET_STATE_PREFIXES.some(prefix => key.startsWith(prefix))) {
      keysToRemove.push(key);
    }
  }

  for (const key of keysToRemove) {
    storage.removeItem(key);
  }
}

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

    if (typeof window !== "undefined") {
      clearWalletState(window.localStorage);
      clearWalletState(window.sessionStorage);
      window.location.reload();
    }
  }, [activeWallet, disconnectThirdweb, disconnectWagmi]);
}
