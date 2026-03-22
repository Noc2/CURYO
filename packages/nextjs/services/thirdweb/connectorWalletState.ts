"use client";

import type { Wallet } from "thirdweb/wallets";

let connectedThirdwebConnectorWallet: Wallet | null = null;
const listeners = new Set<(wallet: Wallet | null) => void>();

export function getConnectedThirdwebConnectorWallet() {
  return connectedThirdwebConnectorWallet;
}

export function setConnectedThirdwebConnectorWallet(wallet: Wallet | null) {
  connectedThirdwebConnectorWallet = wallet;

  for (const listener of listeners) {
    listener(wallet);
  }
}

export function subscribeConnectedThirdwebConnectorWallet(listener: (wallet: Wallet | null) => void) {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}
