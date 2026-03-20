"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { isAddress } from "viem";
import { useAccount } from "wagmi";
import { CategorySubmissionForm } from "~~/components/governance/CategorySubmissionForm";
import { FaucetSection } from "~~/components/governance/FaucetSection";
import { FrontendRegistration } from "~~/components/governance/FrontendRegistration";
import { GovernanceActionComposer } from "~~/components/governance/GovernanceActionComposer";
import { GovernanceStats } from "~~/components/governance/GovernanceStats";
import { PlatformProposals } from "~~/components/governance/PlatformProposals";
import { ProposalList } from "~~/components/governance/ProposalList";
import { TreasuryBalance } from "~~/components/governance/TreasuryBalance";
import { AccuracyLeaderboard } from "~~/components/leaderboard/AccuracyLeaderboard";
import { VoterAccuracyStats } from "~~/components/leaderboard/VoterAccuracyStats";
import { PublicProfileView } from "~~/components/profile/PublicProfileView";
import { CuryoConnectButton } from "~~/components/scaffold-eth";
import { AppPageShell } from "~~/components/shared/AppPageShell";
import { surfaceSectionHeadingClassName } from "~~/components/shared/sectionHeading";
import { useScaffoldReadContract } from "~~/hooks/scaffold-eth";
import { useGovernanceContracts } from "~~/hooks/useGovernance";
import { useVoterIdNFT } from "~~/hooks/useVoterIdNFT";

type GovernanceTab = "profile" | "leaderboard" | "governance" | "faucet";

const governanceTabs: GovernanceTab[] = ["profile", "leaderboard", "governance", "faucet"];
const zeroBalanceTabs: GovernanceTab[] = ["profile", "faucet"];

function getGovernanceHash(tab: GovernanceTab) {
  return tab === "profile" ? "" : `#${tab}`;
}

function normalizeGovernanceHash(hash: string): GovernanceTab | null {
  if (!hash) return "profile";
  if (hash === "accuracy") return "leaderboard";
  return governanceTabs.includes(hash as GovernanceTab) ? (hash as GovernanceTab) : null;
}

function GovernancePageInner() {
  const { isConnected, address } = useAccount();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<GovernanceTab>("profile");
  const [hashInitialized, setHashInitialized] = useState(false);
  const [hasExplicitHash, setHasExplicitHash] = useState(false);
  const [referrer, setReferrer] = useState<string | null>(null);
  const autoSelectedEntryAddressRef = useRef<string | null>(null);
  const { hasGovernorContract } = useGovernanceContracts();

  // Sync tab with URL hash (e.g. /governance#governance)
  const selectTab = useCallback((tab: GovernanceTab) => {
    setActiveTab(tab);
    const hash = getGovernanceHash(tab);
    history.replaceState(null, "", hash || window.location.pathname + window.location.search);
  }, []);

  useEffect(() => {
    const applyHash = () => {
      const rawHash = window.location.hash.replace(/^#/, "");
      const nextTab = normalizeGovernanceHash(rawHash);
      setHasExplicitHash(rawHash.length > 0);
      setHashInitialized(true);

      if (nextTab) {
        setActiveTab(nextTab);
        const nextHash = getGovernanceHash(nextTab);
        const currentHash = rawHash ? `#${rawHash}` : "";
        if (currentHash !== nextHash) {
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
    const refParam = searchParams?.get("ref");
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
  const { hasVoterId, isLoading: voterIdLoading } = useVoterIdNFT(address);

  const hasResolvedBalance = !!address && !crepBalanceLoading && crepBalance !== undefined;
  const hasZeroBalance = hasResolvedBalance && crepBalance === 0n;
  const addressKey = address?.toLowerCase() ?? null;
  const shouldWaitForEntryRouting = Boolean(address) && (!hashInitialized || voterIdLoading);
  const shouldRedirectToDiscover =
    Boolean(address) && hashInitialized && !hasExplicitHash && !voterIdLoading && hasVoterId;
  const faucetOnly = Boolean(address) && hashInitialized && !voterIdLoading && !hasVoterId;

  useEffect(() => {
    autoSelectedEntryAddressRef.current = null;
  }, [addressKey]);

  useEffect(() => {
    if (!addressKey || !hashInitialized || !hasResolvedBalance || voterIdLoading || shouldRedirectToDiscover) {
      return;
    }

    if (window.location.hash) {
      autoSelectedEntryAddressRef.current = addressKey;
      return;
    }

    if (autoSelectedEntryAddressRef.current === addressKey) {
      return;
    }

    if (faucetOnly) {
      selectTab("faucet");
    } else {
      selectTab("profile");
    }

    autoSelectedEntryAddressRef.current = addressKey;
  }, [
    addressKey,
    faucetOnly,
    hasResolvedBalance,
    hashInitialized,
    selectTab,
    shouldRedirectToDiscover,
    voterIdLoading,
  ]);

  useEffect(() => {
    if (!shouldRedirectToDiscover) {
      return;
    }

    router.replace("/vote");
  }, [router, shouldRedirectToDiscover]);

  // Update tab when balance changes
  useEffect(() => {
    if (!hashInitialized || shouldRedirectToDiscover) {
      return;
    }

    if (faucetOnly) {
      if (activeTab !== "faucet") {
        selectTab("faucet");
      }
      return;
    }

    if (!hasResolvedBalance) {
      return;
    }

    const hashTab = normalizeGovernanceHash(window.location.hash.replace(/^#/, ""));

    if (hasZeroBalance && !zeroBalanceTabs.includes(activeTab)) {
      selectTab(hashTab && zeroBalanceTabs.includes(hashTab) ? hashTab : "profile");
      return;
    }

    if (!hasZeroBalance && activeTab === "faucet") {
      selectTab(hashTab && hashTab !== "faucet" ? hashTab : "profile");
    }
  }, [faucetOnly, hasResolvedBalance, hasZeroBalance, activeTab, hashInitialized, selectTab, shouldRedirectToDiscover]);

  // Show connect wallet prompt if not connected
  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
        <p className="text-base-content/60 mb-6 text-center">Connect your wallet to participate</p>
        <CuryoConnectButton />
      </div>
    );
  }

  if (shouldWaitForEntryRouting || shouldRedirectToDiscover) {
    return (
      <AppPageShell contentClassName="space-y-6">
        <div className="flex min-h-[40vh] flex-col items-center justify-center px-4 text-center">
          <span className="loading loading-spinner loading-lg text-primary" />
          <p className="mt-4 text-sm text-base-content/60">
            {shouldRedirectToDiscover ? "Opening Discover..." : "Checking Voter ID..."}
          </p>
        </div>
      </AppPageShell>
    );
  }

  if (faucetOnly) {
    return (
      <AppPageShell contentClassName="space-y-6">
        <FaucetSection referrer={referrer} />
      </AppPageShell>
    );
  }

  return (
    <AppPageShell contentClassName="space-y-6">
      <div className="flex flex-wrap gap-2">
        {hasZeroBalance ? (
          <>
            <button
              onClick={() => selectTab("profile")}
              className={`px-4 py-1.5 rounded-full text-base font-medium transition-colors ${
                activeTab === "profile" ? "pill-active" : "pill-inactive"
              }`}
            >
              Profile
            </button>
            <button
              onClick={() => selectTab("faucet")}
              className={`px-4 py-1.5 rounded-full text-base font-medium transition-colors ${
                activeTab === "faucet" ? "pill-active" : "pill-inactive"
              }`}
            >
              Faucet
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => selectTab("profile")}
              className={`px-4 py-1.5 rounded-full text-base font-medium transition-colors ${
                activeTab === "profile" ? "pill-active" : "pill-inactive"
              }`}
            >
              Profile
            </button>
            <button
              onClick={() => selectTab("leaderboard")}
              className={`px-4 py-1.5 rounded-full text-base font-medium transition-colors ${
                activeTab === "leaderboard" ? "pill-active" : "pill-inactive"
              }`}
            >
              Leaderboard
            </button>
            <button
              onClick={() => selectTab("governance")}
              className={`px-4 py-1.5 rounded-full text-base font-medium transition-colors ${
                activeTab === "governance" ? "pill-active" : "pill-inactive"
              }`}
            >
              Governance
            </button>
          </>
        )}
      </div>

      {activeTab === "profile" && address && <PublicProfileView address={address as `0x${string}`} embedded />}

      {activeTab === "faucet" && <FaucetSection referrer={referrer} />}

      {activeTab === "leaderboard" && (
        <>
          <VoterAccuracyStats />
          <AccuracyLeaderboard />
        </>
      )}

      {activeTab === "governance" && (
        <div className="space-y-6">
          <div className="space-y-6">
            <TreasuryBalance />
            <GovernanceStats />
          </div>
          <GovernanceActionComposer />
          <ProposalList />
          <div className="grid gap-6 xl:grid-cols-2">
            <PlatformProposals />
            {hasGovernorContract ? (
              <CategorySubmissionForm />
            ) : (
              <div className="surface-card rounded-2xl p-6">
                <h2 className={`${surfaceSectionHeadingClassName} mb-2`}>Category Submission</h2>
                <p className="text-base text-base-content/60">
                  Category submissions are disabled on this network because they create a live governance proposal under
                  the hood, and no deployed <code>CuryoGovernor</code> was detected.
                </p>
              </div>
            )}
          </div>
          <FrontendRegistration />
        </div>
      )}
    </AppPageShell>
  );
}

export default function GovernancePage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-[60vh]">Loading...</div>}>
      <GovernancePageInner />
    </Suspense>
  );
}
