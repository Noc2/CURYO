"use client";

import {
  type InjectedWalletProvider,
  findInjectedProvider,
  isCoinbaseInjectedProvider,
  isDedicatedMetaMaskProvider,
  isRainbowInjectedProvider,
} from "./wagmiConnectorTargets";

export const TARGETED_INJECTED_THIRDWEB_WALLET_IDS = ["io.metamask", "com.coinbase.wallet", "me.rainbow"] as const;

type TargetedInjectedThirdwebWalletId = (typeof TARGETED_INJECTED_THIRDWEB_WALLET_IDS)[number];

const TARGETED_INJECTED_WALLET_MATCHERS: Record<
  TargetedInjectedThirdwebWalletId,
  (provider: InjectedWalletProvider) => boolean
> = {
  "io.metamask": isDedicatedMetaMaskProvider,
  "com.coinbase.wallet": isCoinbaseInjectedProvider,
  "me.rainbow": isRainbowInjectedProvider,
};

export function findTargetedInjectedProvider(walletId: string, win: unknown): InjectedWalletProvider | undefined {
  const matcher = TARGETED_INJECTED_WALLET_MATCHERS[walletId as TargetedInjectedThirdwebWalletId];

  if (!matcher) {
    return undefined;
  }

  return findInjectedProvider(win, matcher);
}

export function hasTargetedInjectedProvider(walletId: string, win: unknown): boolean {
  return Boolean(findTargetedInjectedProvider(walletId, win));
}

export function getAvailableThirdwebExternalWalletIds(win: unknown): TargetedInjectedThirdwebWalletId[] {
  return TARGETED_INJECTED_THIRDWEB_WALLET_IDS.filter(walletId => hasTargetedInjectedProvider(walletId, win));
}
