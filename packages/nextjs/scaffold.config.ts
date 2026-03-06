import * as chains from "viem/chains";
import { publicEnv } from "~~/utils/env/public";
import type { SupportedTargetNetwork } from "~~/utils/env/public";

export type BaseConfig = {
  targetNetworks: readonly [SupportedTargetNetwork, ...SupportedTargetNetwork[]];
  pollingInterval: number;
  alchemyApiKey?: string;
  rpcOverrides?: Record<number, string>;
  walletConnectProjectId: string;
  onlyLocalBurnerWallet: boolean;
  frontendCode?: `0x${string}`; // Frontend operator address for fee distribution
};

export type ScaffoldConfig = BaseConfig;

const scaffoldConfig = {
  // The networks on which your DApp is live
  targetNetworks: publicEnv.targetNetworks,
  // The interval at which your front-end polls the RPC servers for new data (it has no effect if you only target the local network (default is 4000))
  pollingInterval: 30000,
  // Your Alchemy API key — get one at https://dashboard.alchemyapi.io
  // Optional on Celo because public RPCs are available.
  alchemyApiKey: publicEnv.alchemyApiKey,
  // If you want to use a different RPC for a specific network, you can add it here.
  // The key is the chain ID, and the value is the HTTP RPC URL
  rpcOverrides: {
    // Example:
    // [chains.mainnet.id]: "https://mainnet.rpc.buidlguidl.com",
  },
  // Your WalletConnect project ID — get one at https://cloud.walletconnect.com
  walletConnectProjectId: publicEnv.walletConnectProjectId,
  onlyLocalBurnerWallet: true,
  // Frontend operator address for fee distribution (1% of losing pool, half of 2% platform fee)
  // Set via NEXT_PUBLIC_FRONTEND_CODE env var, or leave undefined for no frontend fee
  frontendCode: publicEnv.frontendCode,
} as const satisfies ScaffoldConfig;

export default scaffoldConfig;
