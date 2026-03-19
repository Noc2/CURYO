"use client";

import { useMemo } from "react";
import { AutoConnect } from "thirdweb/react";
import type { Wallet } from "thirdweb/wallets";
import { useThirdwebWagmiSync } from "~~/hooks/useThirdwebWagmiSync";
import { getThirdwebAutoConnectOptions } from "~~/services/thirdweb/client";
import { CURYO_E2E_TEST_WALLET_PRIVATE_KEY_STORAGE_KEY } from "~~/services/thirdweb/testWalletStorage";

export function ThirdwebAutoConnectBridge() {
  const { syncWalletToWagmi } = useThirdwebWagmiSync();
  const autoConnectOptions = useMemo(() => {
    if (typeof window !== "undefined" && window.localStorage.getItem(CURYO_E2E_TEST_WALLET_PRIVATE_KEY_STORAGE_KEY)) {
      return null;
    }

    return getThirdwebAutoConnectOptions();
  }, []);

  if (!autoConnectOptions) {
    return null;
  }

  return (
    <AutoConnect
      {...autoConnectOptions}
      onConnect={(wallet: Wallet) => {
        void syncWalletToWagmi(wallet);
      }}
    />
  );
}
