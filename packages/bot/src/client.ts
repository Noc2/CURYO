import { createPublicClient, createWalletClient, http, defineChain } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { config, type BotIdentityConfig } from "./config.js";
import { getKeystoreAccount } from "./keystore.js";

const CHAIN_NAMES: Record<number, string> = {
  31337: "Foundry",
  42220: "Celo",
  11142220: "Celo Sepolia",
};

const chain = defineChain({
  id: config.chainId,
  name: CHAIN_NAMES[config.chainId] || `Chain ${config.chainId}`,
  nativeCurrency: { name: "CELO", symbol: "CELO", decimals: 18 },
  rpcUrls: {
    default: { http: [config.rpcUrl] },
  },
});

export function getAccount(identity: BotIdentityConfig) {
  if (identity.keystoreAccount && identity.keystorePassword) {
    const account = getKeystoreAccount(identity.keystoreAccount, identity.keystorePassword);
    if (account) return account;
  }

  if (identity.privateKey) {
    return privateKeyToAccount(identity.privateKey);
  }

  throw new Error("No wallet configured. Set keystore account+password or private key in .env");
}

export const publicClient = createPublicClient({
  chain,
  transport: http(config.rpcUrl),
});

const CONTRACT_DISPLAY_NAMES = {
  categoryRegistry: "CategoryRegistry",
  contentRegistry: "ContentRegistry",
  crepToken: "CuryoReputation",
  voterIdNFT: "VoterIdNFT",
  votingEngine: "RoundVotingEngine",
} as const;

type BotConnectivityClient = Pick<typeof publicClient, "getChainId" | "getCode">;

export async function validateBotConnectivity(client: BotConnectivityClient = publicClient) {
  const rpcChainId = await client.getChainId();
  if (rpcChainId !== config.chainId) {
    throw new Error(`RPC_URL reports chain ID ${rpcChainId}, but CHAIN_ID is ${config.chainId}.`);
  }

  for (const [contractKey, address] of Object.entries(config.contracts) as Array<
    [keyof typeof config.contracts, `0x${string}`]
  >) {
    const code = await client.getCode({ address });
    if (!code || code === "0x") {
      throw new Error(
        `${CONTRACT_DISPLAY_NAMES[contractKey]} has no bytecode at ${address}. Check RPC_URL, CHAIN_ID, and the configured contract address.`,
      );
    }
  }
}

export function getWalletClient(identity: BotIdentityConfig, account = getAccount(identity)) {
  return createWalletClient({
    account,
    chain,
    transport: http(config.rpcUrl),
  });
}
