"use client";

import { Suspense } from "react";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppProgressBar as ProgressBar } from "next-nprogress-bar";
import { Toaster } from "react-hot-toast";
import { ThirdwebProvider } from "thirdweb/react";
import { hardhat } from "viem/chains";
import { WagmiProvider } from "wagmi";
import { Footer } from "~~/components/Footer";
import { Header } from "~~/components/Header";
import { RouteScopedNotifiers } from "~~/components/RouteScopedNotifiers";
import { ReferralAttributionCapture } from "~~/components/referrals/ReferralAttributionCapture";
import { Faucet } from "~~/components/scaffold-eth";
import { ClearLegacyBurnerSession } from "~~/components/thirdweb/ClearLegacyBurnerSession";
import { LocalTestWalletBridge } from "~~/components/thirdweb/LocalTestWalletBridge";
import { ThirdwebAutoConnectBridge } from "~~/components/thirdweb/ThirdwebAutoConnectBridge";
import { ThirdwebConnectorWalletBridge } from "~~/components/thirdweb/ThirdwebConnectorWalletBridge";
import { OptimisticVoteProvider } from "~~/contexts/OptimisticVoteContext";
import { TermsAcceptanceProvider } from "~~/contexts/TermsAcceptanceContext";
import { useTargetNetwork } from "~~/hooks/scaffold-eth/useTargetNetwork";
import { wagmiConfig } from "~~/services/web3/wagmiConfig";

const TermsAcceptanceModal = dynamic(
  () => import("~~/components/legal/TermsAcceptanceModal").then(m => m.TermsAcceptanceModal),
  { ssr: false },
);

const ScaffoldEthApp = ({ children }: { children: React.ReactNode }) => {
  const pathname = usePathname() ?? "";
  const isVoteFeedRoute = pathname === "/vote";
  const { targetNetwork } = useTargetNetwork();
  const showVoteFeedMobileFaucet = isVoteFeedRoute && targetNetwork.id === hardhat.id;

  return (
    <>
      <div className={`flex min-h-screen flex-col ${isVoteFeedRoute ? "xl:h-screen xl:overflow-hidden" : ""}`.trim()}>
        <Header />
        {/* Main content: offset by left sidebar on desktop (208px at xl) */}
        <div className="flex flex-1 min-h-0 flex-col xl:pl-52">
          <div
            className={`relative flex flex-1 flex-col overflow-x-hidden ${
              isVoteFeedRoute ? "min-h-0 overflow-hidden xl:overflow-hidden" : ""
            }`}
          >
            {children}
          </div>
          {showVoteFeedMobileFaucet ? (
            <div className="xl:hidden">
              <div className="pointer-events-none fixed bottom-0 left-0 z-10 flex w-full items-center justify-between p-4">
                <div className="pointer-events-auto">
                  <Faucet />
                </div>
              </div>
            </div>
          ) : null}
          <div className={isVoteFeedRoute ? "hidden" : ""}>
            <Footer />
          </div>
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
          <Suspense fallback={null}>
            <ReferralAttributionCapture />
          </Suspense>
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
