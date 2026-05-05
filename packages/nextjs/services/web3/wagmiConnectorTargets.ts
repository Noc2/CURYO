const EXTERNAL_WALLET_FLAGS = [
  "isApexWallet",
  "isAvalanche",
  "isBitKeep",
  "isBlockWallet",
  "isBraveWallet",
  "isKuCoinWallet",
  "isLedgerConnect",
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

export type InjectedWalletProvider = {
  isCoinbaseWallet?: boolean;
  isMetaMask?: boolean;
  isRainbow?: boolean;
  providers?: InjectedWalletProvider[];
  [key: string]: unknown;
};

export function findInjectedProvider(win: unknown, predicate: (provider: InjectedWalletProvider) => boolean) {
  const ethereum = (win as { ethereum?: InjectedWalletProvider } | undefined)?.ethereum;
  const providers = Array.isArray(ethereum?.providers) ? ethereum.providers : [];

  for (const provider of providers) {
    if (predicate(provider)) {
      return provider;
    }
  }

  return ethereum && predicate(ethereum) ? ethereum : undefined;
}

export function isDedicatedMetaMaskProvider(provider: InjectedWalletProvider) {
  if (!provider.isMetaMask) return false;
  return EXTERNAL_WALLET_FLAGS.every(flag => !provider[flag]);
}

export function isCoinbaseInjectedProvider(provider: InjectedWalletProvider) {
  return Boolean(provider.isCoinbaseWallet);
}

export function isRainbowInjectedProvider(provider: InjectedWalletProvider) {
  return Boolean(provider.isRainbow);
}
