"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { isAddress } from "viem";
import { useAccount } from "wagmi";
import { FaucetSection } from "~~/components/governance/FaucetSection";
import { GovernanceStats } from "~~/components/governance/GovernanceStats";
import { PlatformProposals } from "~~/components/governance/PlatformProposals";
import { ProposalList } from "~~/components/governance/ProposalList";
import { ReferralSection } from "~~/components/governance/ReferralSection";
import { TokenManagement } from "~~/components/governance/TokenManagement";
import { TreasuryBalance } from "~~/components/governance/TreasuryBalance";
import { AccuracyLeaderboard } from "~~/components/leaderboard/AccuracyLeaderboard";
import { BalanceHistory } from "~~/components/leaderboard/BalanceHistory";
import { LeaderboardTable } from "~~/components/leaderboard/LeaderboardTable";
import { StakeBreakdown } from "~~/components/leaderboard/StakeBreakdown";
import { VoterAccuracyStats } from "~~/components/leaderboard/VoterAccuracyStats";
import { DelegationSection } from "~~/components/profile/DelegationSection";
import { ProfileForm } from "~~/components/profile/ProfileForm";
import { RainbowKitCustomConnectButton } from "~~/components/scaffold-eth";
import { useScaffoldReadContract } from "~~/hooks/scaffold-eth";

type GovernanceTab = "leaderboard" | "accuracy" | "profile" | "vote" | "faucet";

function GovernancePageInner() {
  const { isConnected, address } = useAccount();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<GovernanceTab>("leaderboard");
  const [referrer, setReferrer] = useState<string | null>(null);

  // Sync tab with URL hash (e.g. /governance#profile)
  const selectTab = useCallback((tab: GovernanceTab) => {
    setActiveTab(tab);
    const hash = tab === "leaderboard" ? "" : `#${tab}`;
    history.replaceState(null, "", hash || window.location.pathname + window.location.search);
  }, []);

  useEffect(() => {
    const applyHash = () => {
      const hash = window.location.hash.replace(/^#/, "") as GovernanceTab;
      if (hash && ["leaderboard", "accuracy", "profile", "vote", "faucet"].includes(hash)) {
        setActiveTab(hash);
      }
    };
    applyHash();
    window.addEventListener("hashchange", applyHash);
    return () => window.removeEventListener("hashchange", applyHash);
  }, []);

  // Extract and validate referral code from URL
  useEffect(() => {
    const refParam = searchParams.get("ref");
    if (refParam && isAddress(refParam)) {
      setReferrer(refParam);
      sessionStorage.setItem("curyo_referrer", refParam);
    } else {
      // Check sessionStorage for existing referrer
      const storedReferrer = sessionStorage.getItem("curyo_referrer");
      if (storedReferrer && isAddress(storedReferrer)) {
        setReferrer(storedReferrer);
      }
    }
  }, [searchParams]);

  // Check cREP balance
  const { data: crepBalance } = useScaffoldReadContract({
    contractName: "CuryoReputation",
    functionName: "balanceOf",
    args: [address],
  });

  const hasZeroBalance = !crepBalance || crepBalance === 0n;

  // Update tab when balance changes
  useEffect(() => {
    if (hasZeroBalance && activeTab !== "faucet") {
      setActiveTab("faucet");
    } else if (!hasZeroBalance && activeTab === "faucet") {
      setActiveTab("leaderboard");
    }
  }, [hasZeroBalance, activeTab]);

  // Show connect wallet prompt if not connected
  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
        <p className="text-base-content/60 mb-6 text-center">Connect your wallet to participate</p>
        <RainbowKitCustomConnectButton />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center grow px-4 pt-8 pb-12">
      <div className="w-full max-w-2xl space-y-6">
        {/* Tab Navigation */}
        <div className="flex gap-2">
          {hasZeroBalance ? (
            <button
              onClick={() => selectTab("faucet")}
              className={`flex-1 px-3 py-1.5 rounded-full text-base font-medium transition-colors ${
                activeTab === "faucet" ? "pill-active-yellow" : "bg-base-200 text-white hover:bg-base-300"
              }`}
            >
              Faucet
            </button>
          ) : (
            <>
              <button
                onClick={() => selectTab("leaderboard")}
                className={`flex-1 px-3 py-1.5 rounded-full text-base font-medium transition-colors ${
                  activeTab === "leaderboard" ? "pill-active-yellow" : "bg-base-200 text-white hover:bg-base-300"
                }`}
              >
                Leaderboard
              </button>
              <button
                onClick={() => selectTab("accuracy")}
                className={`flex-1 px-3 py-1.5 rounded-full text-base font-medium transition-colors ${
                  activeTab === "accuracy" ? "pill-active-yellow" : "bg-base-200 text-white hover:bg-base-300"
                }`}
              >
                Accuracy
              </button>
              <button
                onClick={() => selectTab("profile")}
                className={`flex-1 px-3 py-1.5 rounded-full text-base font-medium transition-colors ${
                  activeTab === "profile" ? "pill-active-yellow" : "bg-base-200 text-white hover:bg-base-300"
                }`}
              >
                Profile
              </button>
              <button
                onClick={() => selectTab("vote")}
                className={`flex-1 px-3 py-1.5 rounded-full text-base font-medium transition-colors ${
                  activeTab === "vote" ? "pill-active-yellow" : "bg-base-200 text-white hover:bg-base-300"
                }`}
              >
                Vote
              </button>
            </>
          )}
        </div>

        {/* Faucet Tab - only when zero balance */}
        {activeTab === "faucet" && <FaucetSection referrer={referrer} />}

        {/* Leaderboard Tab */}
        {activeTab === "leaderboard" && (
          <>
            <BalanceHistory />
            <StakeBreakdown />
            <LeaderboardTable />
          </>
        )}

        {/* Accuracy Tab */}
        {activeTab === "accuracy" && (
          <>
            <VoterAccuracyStats />
            <AccuracyLeaderboard />
          </>
        )}

        {/* Profile Tab */}
        {activeTab === "profile" && (
          <>
            <ProfileForm />
            <DelegationSection />
            <ReferralSection />
          </>
        )}

        {/* Vote Tab */}
        {activeTab === "vote" && (
          <>
            <TokenManagement />
            <TreasuryBalance />
            <PlatformProposals />
            <GovernanceStats />
            <ProposalList />
          </>
        )}
      </div>
    </div>
  );
}

export default function GovernancePage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-[60vh]">Loading...</div>}>
      <GovernancePageInner />
    </Suspense>
  );
}
