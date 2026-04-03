"use client";

const EXTERNAL_WALLET_FLAGS = [
  "isApexWallet",
  "isAvalanche",
  "isBitKeep",
  "isBlockWallet",
  "isBraveWallet",
  "isKuCoinWallet",
  "isMathWallet",
  "isOkxWallet",
  "isOKExWallet",
  "isOneInchIOSWallet",
  "isOneInchAndroidWallet",
  "isOpera",
  "isPhantom",
  "isPortal",
  "isRabby",
  "isTokenPocket",
  "isTokenary",
  "isUniswapWallet",
  "isZerion",
] as const;

export const TARGETED_INJECTED_THIRDWEB_WALLET_IDS = ["io.metamask", "com.coinbase.wallet", "me.rainbow"] as const;

export type TargetedInjectedThirdwebWalletId = (typeof TARGETED_INJECTED_THIRDWEB_WALLET_IDS)[number];

export type InjectedWalletProvider = {
  isCoinbaseWallet?: boolean;
  isMetaMask?: boolean;
  isRainbow?: boolean;
  providers?: InjectedWalletProvider[];
  [key: string]: unknown;
};

const TARGETED_INJECTED_WALLET_MATCHERS: Record<
  TargetedInjectedThirdwebWalletId,
  (provider: InjectedWalletProvider) => boolean
> = {
  "io.metamask": provider => {
    if (!provider.isMetaMask) return false;
    return EXTERNAL_WALLET_FLAGS.every(flag => !provider[flag]);
  },
  "com.coinbase.wallet": provider => Boolean(provider.isCoinbaseWallet),
  "me.rainbow": provider => Boolean(provider.isRainbow),
};

function getEthereumProvider(win: unknown) {
  return (win as { ethereum?: InjectedWalletProvider } | undefined)?.ethereum;
}

export function findInjectedProvider(
  win: unknown,
  predicate: (provider: InjectedWalletProvider) => boolean,
): InjectedWalletProvider | undefined {
  const ethereum = getEthereumProvider(win);
  const providers = Array.isArray(ethereum?.providers) ? ethereum.providers : [];

  for (const provider of providers) {
    if (predicate(provider)) {
      return provider;
    }
  }

  return ethereum && predicate(ethereum) ? ethereum : undefined;
}

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
