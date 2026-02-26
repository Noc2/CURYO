import * as chains from "viem/chains";

export type BaseConfig = {
  targetNetworks: readonly chains.Chain[];
  pollingInterval: number;
  alchemyApiKey: string;
  rpcOverrides?: Record<number, string>;
  walletConnectProjectId: string;
  onlyLocalBurnerWallet: boolean;
  frontendCode?: `0x${string}`; // Frontend operator address for fee distribution
};

export type ScaffoldConfig = BaseConfig;

// Development-only fallback key — do NOT use in production.
// Set NEXT_PUBLIC_ALCHEMY_API_KEY in your environment for production deployments.
export const DEFAULT_ALCHEMY_API_KEY = "cR4WnXePioePZ5fFrnSiR";

// Development-only fallback — do NOT use in production.
// Set NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID in your environment for production deployments.
const DEV_WALLET_CONNECT_PROJECT_ID = "3a8170812b534d0ff9d794f19a901d64";

if (process.env.NODE_ENV === "production") {
  if (!process.env.NEXT_PUBLIC_ALCHEMY_API_KEY) {
    console.warn("[scaffold] WARNING: NEXT_PUBLIC_ALCHEMY_API_KEY not set — using rate-limited dev key");
  }
  if (!process.env.NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID) {
    console.warn("[scaffold] WARNING: NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID not set — using dev project ID");
  }
}

const scaffoldConfig = {
  // The networks on which your DApp is live
  // Includes Celo for Self.xyz HumanFaucet integration
  targetNetworks: [chains.foundry, chains.celoSepolia, chains.celo],
  // The interval at which your front-end polls the RPC servers for new data (it has no effect if you only target the local network (default is 4000))
  pollingInterval: 30000,
  // Your Alchemy API key — get one at https://dashboard.alchemyapi.io
  // Set via NEXT_PUBLIC_ALCHEMY_API_KEY in .env.local / Vercel env config.
  alchemyApiKey: process.env.NEXT_PUBLIC_ALCHEMY_API_KEY || DEFAULT_ALCHEMY_API_KEY,
  // If you want to use a different RPC for a specific network, you can add it here.
  // The key is the chain ID, and the value is the HTTP RPC URL
  rpcOverrides: {
    // Example:
    // [chains.mainnet.id]: "https://mainnet.rpc.buidlguidl.com",
  },
  // Your WalletConnect project ID — get one at https://cloud.walletconnect.com
  // Set via NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID in .env.local / Vercel env config.
  walletConnectProjectId: process.env.NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID || DEV_WALLET_CONNECT_PROJECT_ID,
  onlyLocalBurnerWallet: true,
  // Frontend operator address for fee distribution (1% of losing pool, half of 2% platform fee)
  // Set via NEXT_PUBLIC_FRONTEND_CODE env var, or leave undefined for no frontend fee
  frontendCode: process.env.NEXT_PUBLIC_FRONTEND_CODE as `0x${string}` | undefined,
} as const satisfies ScaffoldConfig;

export default scaffoldConfig;
