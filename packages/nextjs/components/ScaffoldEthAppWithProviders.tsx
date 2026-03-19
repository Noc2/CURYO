"use client";

import dynamic from "next/dynamic";
import { RainbowKitProvider, darkTheme } from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppProgressBar as ProgressBar } from "next-nprogress-bar";
import { Toaster } from "react-hot-toast";
import { ThirdwebProvider } from "thirdweb/react";
import { WagmiProvider } from "wagmi";
import { Footer } from "~~/components/Footer";
import { Header } from "~~/components/Header";
import { RouteScopedNotifiers } from "~~/components/RouteScopedNotifiers";
import { BlockieAvatar } from "~~/components/scaffold-eth";
import { ThirdwebAutoConnectBridge } from "~~/components/thirdweb/ThirdwebAutoConnectBridge";
import { OptimisticVoteProvider } from "~~/contexts/OptimisticVoteContext";
import { TermsAcceptanceProvider } from "~~/contexts/TermsAcceptanceContext";
import { wagmiConfig } from "~~/services/web3/wagmiConfig";

const TermsAcceptanceModal = dynamic(
  () => import("~~/components/legal/TermsAcceptanceModal").then(m => m.TermsAcceptanceModal),
  { ssr: false },
);

const ScaffoldEthApp = ({ children }: { children: React.ReactNode }) => {
  return (
    <>
      <div className="flex h-[100dvh] flex-col overflow-hidden">
        <Header />
        {/* Main content: offset by left sidebar on desktop (224px at xl) */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden xl:pl-56">
          <main className="relative flex flex-col flex-1 min-h-0 overflow-x-hidden overflow-y-auto">{children}</main>
          <Footer />
        </div>
      </div>
      <Toaster />
      <RouteScopedNotifiers />
    </>
  );
};

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
    },
  },
});

export const ScaffoldEthAppWithProviders = ({ children }: { children: React.ReactNode }) => {
  const obsidianEmberTheme = darkTheme({
    accentColor: "#F26426",
    accentColorForeground: "#090A0C",
    borderRadius: "medium",
    overlayBlur: "small",
  });

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <ThirdwebProvider>
          <RainbowKitProvider avatar={BlockieAvatar} theme={obsidianEmberTheme}>
            <ThirdwebAutoConnectBridge />
            <ProgressBar height="3px" color="#F26426" />
            <TermsAcceptanceProvider>
              <OptimisticVoteProvider>
                <ScaffoldEthApp>{children}</ScaffoldEthApp>
              </OptimisticVoteProvider>
              <TermsAcceptanceModal />
            </TermsAcceptanceProvider>
          </RainbowKitProvider>
        </ThirdwebProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
};
