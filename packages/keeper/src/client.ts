import { createPublicClient, createWalletClient, http, defineChain } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { config } from "./config.js";
import { getKeystoreAccount } from "./keystore.js";

export const chain = defineChain({
  id: config.chainId,
  name: config.chainName,
  nativeCurrency: { name: "CELO", symbol: "CELO", decimals: 18 },
  rpcUrls: {
    default: { http: [config.rpcUrl] },
  },
});

export function getAccount() {
  const keystoreAccount = getKeystoreAccount();
  if (keystoreAccount) return keystoreAccount;

  if (config.privateKey) {
    return privateKeyToAccount(config.privateKey);
  }

  throw new Error("No wallet configured. Set KEYSTORE_ACCOUNT+KEYSTORE_PASSWORD or KEEPER_PRIVATE_KEY");
}

export const publicClient = createPublicClient({
  chain,
  transport: http(config.rpcUrl),
});

export function getWalletClient() {
  const account = getAccount();
  return createWalletClient({
    account,
    chain,
    transport: http(config.rpcUrl),
  });
}
