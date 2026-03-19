"use client";

import { useMemo } from "react";
import { AutoConnect } from "thirdweb/react";
import type { Wallet } from "thirdweb/wallets";
import { useThirdwebWagmiSync } from "~~/hooks/useThirdwebWagmiSync";
import { getThirdwebAutoConnectOptions } from "~~/services/thirdweb/client";

export function ThirdwebAutoConnectBridge() {
  const { syncWalletToWagmi } = useThirdwebWagmiSync();
  const autoConnectOptions = useMemo(() => getThirdwebAutoConnectOptions(), []);

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
