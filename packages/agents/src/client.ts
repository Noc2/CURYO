import { createPublicClient, createWalletClient, http, defineChain } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  config,
  getRequiredContractKeys,
  type BotContractKey,
  type BotIdentityConfig,
  type BotRole,
} from "./config.js";
import { getKeystoreAccount, getKeystorePrivateKey } from "./keystore.js";

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

export function getIdentityPrivateKey(identity: BotIdentityConfig): `0x${string}` {
  if (identity.privateKey) {
    return identity.privateKey;
  }

  if (identity.keystoreAccount && identity.keystorePassword) {
    const privateKey = getKeystorePrivateKey(identity.keystoreAccount, identity.keystorePassword);
    if (privateKey) return privateKey;
  }

  throw new Error("No wallet private key available. Set keystore account+password or private key in .env");
}

export const publicClient = createPublicClient({
  chain,
  transport: http(config.rpcUrl),
});

const CONTRACT_DISPLAY_NAMES: Record<BotContractKey, string> = {
  categoryRegistry: "CategoryRegistry",
  contentRegistry: "ContentRegistry",
  hrepToken: "HumanReputation",
  questionRewardPoolEscrow: "QuestionRewardPoolEscrow",
  roundRewardDistributor: "RoundRewardDistributor",
  voterIdNFT: "VoterIdNFT",
  votingEngine: "RoundVotingEngine",
} as const;

type BotConnectivityClient = Pick<typeof publicClient, "getChainId" | "getCode">;

export async function validateContractKeys(
  contractKeys: readonly BotContractKey[],
  client: BotConnectivityClient = publicClient,
) {
  const rpcChainId = await client.getChainId();
  if (rpcChainId !== config.chainId) {
    throw new Error(`RPC_URL reports chain ID ${rpcChainId}, but CHAIN_ID is ${config.chainId}.`);
  }

  for (const contractKey of contractKeys) {
    const address = config.contracts[contractKey];
    if (!address) {
      throw new Error(`${CONTRACT_DISPLAY_NAMES[contractKey]} address is not configured.`);
    }
    const code = await client.getCode({ address });
    if (!code || code === "0x") {
      throw new Error(
        `${CONTRACT_DISPLAY_NAMES[contractKey]} has no bytecode at ${address}. Check RPC_URL, CHAIN_ID, and the configured contract address.`,
      );
    }
  }
}

export async function validateBotConnectivity(role: BotRole, client: BotConnectivityClient = publicClient) {
  return validateContractKeys(getRequiredContractKeys(role), client);
}

export function getWalletClient(identity: BotIdentityConfig, account = getAccount(identity)) {
  return createWalletClient({
    account,
    chain,
    transport: http(config.rpcUrl),
  });
}
