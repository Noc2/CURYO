"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppProgressBar as ProgressBar } from "next-nprogress-bar";
import { Toaster } from "react-hot-toast";
import { ThirdwebProvider } from "thirdweb/react";
import { WagmiProvider } from "wagmi";
import { Footer } from "~~/components/Footer";
import { Header } from "~~/components/Header";
import { RouteScopedNotifiers } from "~~/components/RouteScopedNotifiers";
import { ClearLegacyBurnerSession } from "~~/components/thirdweb/ClearLegacyBurnerSession";
import { LocalTestWalletBridge } from "~~/components/thirdweb/LocalTestWalletBridge";
import { ThirdwebAutoConnectBridge } from "~~/components/thirdweb/ThirdwebAutoConnectBridge";
import { ThirdwebConnectorWalletBridge } from "~~/components/thirdweb/ThirdwebConnectorWalletBridge";
import { OptimisticVoteProvider } from "~~/contexts/OptimisticVoteContext";
import { TermsAcceptanceProvider } from "~~/contexts/TermsAcceptanceContext";
import { wagmiConfig } from "~~/services/web3/wagmiConfig";

const TermsAcceptanceModal = dynamic(
  () => import("~~/components/legal/TermsAcceptanceModal").then(m => m.TermsAcceptanceModal),
  { ssr: false },
);

const ScaffoldEthApp = ({ children }: { children: React.ReactNode }) => {
  const pathname = usePathname() ?? "";
  const isVoteRoute = pathname.startsWith("/vote");

  return (
    <>
      <div className="flex min-h-screen flex-col">
        <Header />
        {/* Main content: offset by left sidebar on desktop (208px at xl) */}
        <div
          className={`flex flex-1 flex-col xl:pl-52 ${
            isVoteRoute ? "xl:h-screen xl:max-h-screen xl:min-h-0 xl:overflow-hidden" : ""
          }`}
        >
          <main
            className={`relative flex flex-1 flex-col overflow-x-hidden ${
              isVoteRoute ? "xl:min-h-0 xl:overflow-hidden" : ""
            }`}
          >
            {children}
          </main>
          <Footer />
        </div>
      </div>
      <Toaster />
      <RouteScopedNotifiers />
    </>
  );
};

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 30_000,
      gcTime: 5 * 60_000,
    },
  },
});

export const ScaffoldEthAppWithProviders = ({ children }: { children: React.ReactNode }) => {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <ThirdwebProvider>
          <ClearLegacyBurnerSession />
          <LocalTestWalletBridge />
          <ThirdwebConnectorWalletBridge />
          <ThirdwebAutoConnectBridge />
          <ProgressBar height="3px" color="#F26426" />
          <TermsAcceptanceProvider>
            <OptimisticVoteProvider>
              <ScaffoldEthApp>{children}</ScaffoldEthApp>
            </OptimisticVoteProvider>
            <TermsAcceptanceModal />
          </TermsAcceptanceProvider>
        </ThirdwebProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
};
