"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { isAddress } from "viem";
import { useAccount } from "wagmi";
import { CategorySubmissionForm } from "~~/components/governance/CategorySubmissionForm";
import { FaucetSection } from "~~/components/governance/FaucetSection";
import { FrontendRegistration } from "~~/components/governance/FrontendRegistration";
import { GovernanceActionComposer } from "~~/components/governance/GovernanceActionComposer";
import { GovernanceStats } from "~~/components/governance/GovernanceStats";
import { PlatformProposals } from "~~/components/governance/PlatformProposals";
import { ProposalList } from "~~/components/governance/ProposalList";
import { ReferralSection } from "~~/components/governance/ReferralSection";
import { TokenManagement } from "~~/components/governance/TokenManagement";
import { TreasuryBalance } from "~~/components/governance/TreasuryBalance";
import { BalanceHistory } from "~~/components/leaderboard/BalanceHistory";
import { LeaderboardTable } from "~~/components/leaderboard/LeaderboardTable";
import { StakeBreakdown } from "~~/components/leaderboard/StakeBreakdown";
import { DelegationSection } from "~~/components/profile/DelegationSection";
import { ProfileForm } from "~~/components/profile/ProfileForm";
import { RainbowKitCustomConnectButton } from "~~/components/scaffold-eth";
import { useScaffoldReadContract } from "~~/hooks/scaffold-eth";
import { useGovernanceContracts } from "~~/hooks/useGovernance";

type GovernanceTab = "leaderboard" | "profile" | "governance" | "faucet";

const governanceTabs: GovernanceTab[] = ["leaderboard", "profile", "governance", "faucet"];

function normalizeGovernanceHash(hash: string): GovernanceTab | null {
  if (hash === "accuracy") return "profile";
  if (hash === "vote") return "governance";
  return governanceTabs.includes(hash as GovernanceTab) ? (hash as GovernanceTab) : null;
}

function GovernancePageInner() {
  const { isConnected, address } = useAccount();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<GovernanceTab>("leaderboard");
  const [referrer, setReferrer] = useState<string | null>(null);
  const { hasGovernorContract } = useGovernanceContracts();

  // Sync tab with URL hash (e.g. /governance#profile)
  const selectTab = useCallback((tab: GovernanceTab) => {
    setActiveTab(tab);
    const hash = tab === "leaderboard" ? "" : `#${tab}`;
    history.replaceState(null, "", hash || window.location.pathname + window.location.search);
  }, []);

  useEffect(() => {
    const applyHash = () => {
      const rawHash = window.location.hash.replace(/^#/, "");
      const nextTab = normalizeGovernanceHash(rawHash);

      if (nextTab) {
        setActiveTab(nextTab);

        if (rawHash === "accuracy") {
          const nextHash = nextTab === "leaderboard" ? "" : `#${nextTab}`;
          history.replaceState(null, "", `${window.location.pathname}${window.location.search}${nextHash}`);
        }
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
  const { data: crepBalance, isLoading: crepBalanceLoading } = useScaffoldReadContract({
    contractName: "CuryoReputation",
    functionName: "balanceOf",
    args: [address],
    query: { enabled: !!address },
  });

  const hasResolvedBalance = !!address && !crepBalanceLoading && crepBalance !== undefined;
  const hasZeroBalance = hasResolvedBalance && crepBalance === 0n;

  // Update tab when balance changes
  useEffect(() => {
    if (!hasResolvedBalance) {
      return;
    }

    if (hasZeroBalance && activeTab !== "faucet") {
      selectTab("faucet");
      return;
    }

    if (!hasZeroBalance && activeTab === "faucet") {
      const hashTab = normalizeGovernanceHash(window.location.hash.replace(/^#/, ""));
      selectTab(hashTab && hashTab !== "faucet" ? hashTab : "leaderboard");
    }
  }, [hasResolvedBalance, hasZeroBalance, activeTab, selectTab]);

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
                onClick={() => selectTab("profile")}
                className={`flex-1 px-3 py-1.5 rounded-full text-base font-medium transition-colors ${
                  activeTab === "profile" ? "pill-active-yellow" : "bg-base-200 text-white hover:bg-base-300"
                }`}
              >
                Profile
              </button>
              <button
                onClick={() => selectTab("governance")}
                className={`flex-1 px-3 py-1.5 rounded-full text-base font-medium transition-colors ${
                  activeTab === "governance" ? "pill-active-yellow" : "bg-base-200 text-white hover:bg-base-300"
                }`}
              >
                Governance
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

        {/* Profile Tab */}
        {activeTab === "profile" && (
          <>
            <ProfileForm />
            <DelegationSection />
            <ReferralSection />
          </>
        )}

        {/* Governance Tab */}
        {activeTab === "governance" && (
          <>
            <TokenManagement />
            <TreasuryBalance />
            <GovernanceStats />
            <GovernanceActionComposer />
            <ProposalList />
            <PlatformProposals />
            {hasGovernorContract ? (
              <CategorySubmissionForm />
            ) : (
              <div className="surface-card rounded-2xl p-6">
                <h2 className="text-lg font-semibold mb-2">Category Submission</h2>
                <p className="text-base text-base-content/60">
                  Category submissions are disabled on this network because they create a live governance proposal under
                  the hood, and no deployed <code>CuryoGovernor</code> was detected.
                </p>
              </div>
            )}
            <FrontendRegistration />
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
