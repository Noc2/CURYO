import withBundleAnalyzer from "@next/bundle-analyzer";
import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

// Build CSP directives. Production Ponder URL comes from env at build time.
const ponderUrl = process.env.NEXT_PUBLIC_PONDER_URL ?? (isDev ? "http://localhost:42069" : "");
const cspDirectives = [
  "default-src 'self'",
  `script-src 'self' 'wasm-unsafe-eval'${isDev ? " 'unsafe-inline' 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  [
    "connect-src 'self'",
    ponderUrl,
    // RPC & blockchain
    "https://*.g.alchemy.com",
    "https://mainnet.rpc.buidlguidl.com",
    // drand (tlock encryption)
    "https://api.drand.sh",
    "https://mainnet.drand.sh",
    // WalletConnect / RainbowKit
    "wss://*.walletconnect.com",
    "https://*.walletconnect.com",
    "https://*.walletconnect.org",
    // Content metadata APIs (platform handlers)
    "https://en.wikipedia.org",
    "https://api.themoviedb.org",
    "https://openlibrary.org",
    "https://api.coingecko.com",
    "https://huggingface.co",
    "https://api.rawg.io",
    "https://api.github.com",
    "https://cdn.syndication.twimg.com",
    "https://api.scryfall.com",
    "https://www.youtube.com",
    "https://api.twitch.tv",
    // Dev-only
    ...(isDev ? ["http://localhost:*", "ws://localhost:*", "ws://127.0.0.1:*"] : []),
  ]
    .filter(Boolean)
    .join(" "),
  [
    "frame-src 'self'",
    "https://www.youtube-nocookie.com",
    "https://youtube.com",
    "https://clips.twitch.tv",
    "https://player.twitch.tv",
    "https://self.xyz",
    "https://verify.walletconnect.com",
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

const isIpfs = process.env.NEXT_PUBLIC_IPFS_BUILD === "true";

if (isIpfs) {
  nextConfig.output = "export";
  nextConfig.trailingSlash = true;
  nextConfig.images = {
    unoptimized: true,
  };
}

module.exports = process.env.ANALYZE === "true" ? withBundleAnalyzer({ enabled: true })(nextConfig) : nextConfig;
