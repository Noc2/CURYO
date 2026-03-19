"use client";

import { AutoConnect } from "thirdweb/react";
import type { Wallet } from "thirdweb/wallets";
import { useThirdwebWagmiSync } from "~~/hooks/useThirdwebWagmiSync";
import { thirdwebConnectOptions } from "~~/services/thirdweb/client";

export function ThirdwebAutoConnectBridge() {
  const { syncWalletToWagmi } = useThirdwebWagmiSync();

  if (!thirdwebConnectOptions) {
    return null;
  }

  return (
    <AutoConnect
      {...thirdwebConnectOptions}
      onConnect={(wallet: Wallet) => {
        void syncWalletToWagmi(wallet);
      }}
      timeout={15_000}
    />
  );
}
