"use client";

import { type Chain, type ThirdwebClient } from "thirdweb";
import { type Account, type Wallet, privateKeyToAccount } from "thirdweb/wallets";

type LocalTestWalletOptions = {
  chain: Chain;
  client: ThirdwebClient;
  privateKey: string;
};

type AccountChangedListener = (account: Account) => void;
type ChainChangedListener = (chain: Chain) => void;
type DisconnectListener = () => void;

export function createLocalTestWallet({ chain: initialChain, client, privateKey }: LocalTestWalletOptions): Wallet<"inApp"> {
  const baseAccount = privateKeyToAccount({
    client,
    privateKey,
  });

  let account: Account | undefined = baseAccount;
  let chain = initialChain;

  const accountChangedListeners = new Set<AccountChangedListener>();
  const chainChangedListeners = new Set<ChainChangedListener>();
  const disconnectListeners = new Set<DisconnectListener>();

  const wallet = {
    autoConnect: async (options?: { chain?: Chain }) => {
      if (options?.chain) {
        chain = options.chain;
      }

      account = baseAccount;
      for (const listener of accountChangedListeners) {
        listener(account);
      }

      return account;
    },
    connect: async (options?: { chain?: Chain }) => {
      if (options?.chain) {
        chain = options.chain;
      }

      account = baseAccount;
      for (const listener of accountChangedListeners) {
        listener(account);
      }

      return account;
    },
    disconnect: async () => {
      account = undefined;
      for (const listener of disconnectListeners) {
        listener();
      }
    },
    getAccount: () => account,
    getChain: () => chain,
    getConfig: () => ({}) as never,
    id: "inApp" as const,
    subscribe: (event, listener) => {
      if (event === "accountChanged") {
        const typedListener = listener as AccountChangedListener;
        accountChangedListeners.add(typedListener);
        return () => accountChangedListeners.delete(typedListener);
      }

      if (event === "chainChanged") {
        const typedListener = listener as ChainChangedListener;
        chainChangedListeners.add(typedListener);
        return () => chainChangedListeners.delete(typedListener);
      }

      const typedListener = listener as DisconnectListener;
      disconnectListeners.add(typedListener);
      return () => disconnectListeners.delete(typedListener);
    },
    switchChain: async nextChain => {
      chain = nextChain;
      for (const listener of chainChangedListeners) {
        listener(nextChain);
      }
    },
  } satisfies Wallet<"inApp">;

  return wallet;
}
