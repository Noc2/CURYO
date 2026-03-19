import { publicEnv } from "~~/utils/env/public";
import type { SupportedTargetNetwork } from "~~/utils/env/public";

export type BaseConfig = {
  targetNetworks: readonly [SupportedTargetNetwork, ...SupportedTargetNetwork[]];
  pollingInterval: number;
  alchemyApiKey?: string;
  rpcOverrides?: Record<number, string>;
  walletConnectProjectId?: string;
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
    // [1]: "https://eth-mainnet.g.alchemy.com/v2/your-api-key",
  },
  // Optional WalletConnect project ID for external wallet discovery flows.
  walletConnectProjectId: publicEnv.walletConnectProjectId,
  // Frontend operator address for fee distribution (3% of the remaining post-rebate losing pool)
  // Set via NEXT_PUBLIC_FRONTEND_CODE env var, or leave undefined for no frontend fee
  frontendCode: publicEnv.frontendCode,
} as const satisfies ScaffoldConfig;

export default scaffoldConfig;
