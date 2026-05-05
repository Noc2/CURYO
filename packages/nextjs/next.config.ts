import { RPC_OVERRIDES } from "./config/shared";
import { isLocalE2EProductionBuildEnabled } from "./utils/env/e2eProduction";
import { resolvePonderUrlValue } from "./utils/env/ponderUrl";
import { DEFAULT_DEV_TARGET_NETWORKS, resolveTargetNetworks } from "./utils/env/targetNetworks";
import { mergeRpcOverrides, resolveRpcOverrides } from "./utils/rpcUrls";
import withBundleAnalyzer from "@next/bundle-analyzer";
import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";
const isVercelPreview = process.env.VERCEL_ENV === "preview";
const allowLocalE2EProductionBuild = isLocalE2EProductionBuildEnabled();
const rpcOverrides = mergeRpcOverrides(
  RPC_OVERRIDES,
  resolveRpcOverrides({
    31337: process.env.NEXT_PUBLIC_RPC_URL_31337,
    11142220: process.env.NEXT_PUBLIC_RPC_URL_11142220,
    42220: process.env.NEXT_PUBLIC_RPC_URL_42220,
  }),
);
const targetNetworks = resolveTargetNetworks(process.env.NEXT_PUBLIC_TARGET_NETWORKS, {
  alchemyApiKey: process.env.NEXT_PUBLIC_ALCHEMY_API_KEY,
  allowFoundryInProduction: allowLocalE2EProductionBuild,
  production: !isDev,
  fallback: isDev ? DEFAULT_DEV_TARGET_NETWORKS : undefined,
  rpcOverrides,
});

function toOrigin(value: string): string | undefined {
  try {
    return new URL(value).origin;
  } catch {
    return undefined;
  }
}

const rpcUrls = [
  ...targetNetworks.flatMap(network => network.rpcUrls.default.http),
  ...Object.values(rpcOverrides as Partial<Record<number, string>>).filter((value): value is string => Boolean(value)),
] as const;

const rpcOrigins = rpcUrls
  .map(toOrigin)
  .filter((value, index, values): value is string => Boolean(value) && values.indexOf(value) === index);

// Build CSP directives. Production Ponder URL comes from env at build time.
const ponderUrl =
  resolvePonderUrlValue(process.env.NEXT_PUBLIC_PONDER_URL, !isDev, allowLocalE2EProductionBuild).url ?? "";
const vercelLiveScriptSources = isVercelPreview ? ["https://vercel.live"] : [];
const vercelLiveStyleSources = isVercelPreview ? ["https://vercel.live"] : [];
const vercelLiveFontSources = isVercelPreview ? ["https://vercel.live", "https://assets.vercel.com"] : [];
const vercelLiveConnectSources = isVercelPreview
  ? ["https://vercel.live", "https://*.pusher.com", "wss://*.pusher.com"]
  : [];
const vercelLiveFrameSources = isVercelPreview ? ["https://vercel.live"] : [];
const cspDirectives = [
  "default-src 'self'",
  // Static CSP headers need inline bootstrap scripts for Next's production app shell.
  [
    "script-src 'self' 'wasm-unsafe-eval' 'unsafe-inline'",
    "https://scripts.simpleanalyticscdn.com",
    ...(isDev ? ["'unsafe-eval'"] : []),
    ...vercelLiveScriptSources,
  ].join(" "),
  ["style-src 'self' 'unsafe-inline'", ...vercelLiveStyleSources].join(" "),
  ["font-src 'self'", ...vercelLiveFontSources].join(" "),
  "img-src 'self' data: blob: https:",
  [
    "connect-src 'self'",
    ponderUrl,
    // RPC & blockchain
    "https://*.g.alchemy.com",
    ...rpcOrigins,
    // drand (tlock encryption)
    "https://api.drand.sh",
    "https://mainnet.drand.sh",
    // Self.xyz verification
    "wss://websocket.self.xyz",
    "wss://websocket.staging.self.xyz",
    // Wallet connections
    "wss://*.walletconnect.com",
    "https://*.walletconnect.com",
    "https://*.walletconnect.org",
    "https://api.web3modal.org",
    "https://*.thirdweb.com",
    // Simple Analytics
    "https://scripts.simpleanalyticscdn.com",
    "https://queue.simpleanalyticscdn.com",
    ...vercelLiveConnectSources,
    // Coinbase Wallet SDK
    "https://cca-lite.coinbase.com",
    "https://www.youtube.com",
    // Dev-only
    ...(isDev ? ["http://localhost:*", "http://127.0.0.1:*", "ws://localhost:*", "ws://127.0.0.1:*"] : []),
  ]
    .filter(Boolean)
    .join(" "),
  [
    "frame-src 'self'",
    "https://embedded-wallet.thirdweb.com",
    "https://www.youtube-nocookie.com",
    "https://youtube.com",
    "https://self.xyz",
    "https://verify.walletconnect.com",
    ...vercelLiveFrameSources,
  ].join(" "),
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
];

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "Content-Security-Policy",
    value: cspDirectives.join("; "),
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  transpilePackages: ["@curyo/contracts", "@curyo/node-utils", "thirdweb", "@thirdweb-dev/wagmi-adapter"],
  typescript: {
    ignoreBuildErrors: process.env.NEXT_PUBLIC_IGNORE_BUILD_ERROR === "true",
  },
  eslint: {
    ignoreDuringBuilds: process.env.NEXT_PUBLIC_IGNORE_BUILD_ERROR === "true",
  },
  webpack: config => {
    config.resolve.fallback = { fs: false, net: false, tls: false };
    config.externals.push("pino-pretty", "lokijs", "encoding");
    return config;
  },
  headers: async () => [
    {
      source: "/(.*)",
      headers: securityHeaders,
    },
  ],
};

module.exports = process.env.ANALYZE === "true" ? withBundleAnalyzer({ enabled: true })(nextConfig) : nextConfig;
