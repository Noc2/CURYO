"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { useAccount } from "wagmi";
import { AppPageShell } from "~~/components/shared/AppPageShell";
import { ConnectWalletCard } from "~~/components/shared/ConnectWalletCard";
import { useScaffoldReadContract } from "~~/hooks/scaffold-eth";
import { useVoterIdNFT } from "~~/hooks/useVoterIdNFT";
import {
  captureReferralAttributionFromSearchParams,
  getStoredReferralAddress,
} from "~~/lib/referrals/referralAttribution";

type GovernanceTab = "profile" | "leaderboard" | "governance" | "faucet";

const governanceTabs: GovernanceTab[] = ["profile", "leaderboard", "governance", "faucet"];
const zeroBalanceTabs: GovernanceTab[] = ["profile", "faucet"];

function GovernanceSectionLoading() {
  return (
    <div className="surface-card rounded-2xl p-6">
      <div className="flex items-center gap-3 text-base-content/50">
        <span className="loading loading-spinner loading-sm text-primary" />
        <span>Loading...</span>
      </div>
    </div>
  );
}

const PublicProfileView = dynamic(
  () => import("~~/components/profile/PublicProfileView").then(mod => mod.PublicProfileView),
  { loading: GovernanceSectionLoading },
);
const FaucetSection = dynamic(() => import("~~/components/governance/FaucetSection").then(mod => mod.FaucetSection), {
  loading: GovernanceSectionLoading,
});
const VoterAccuracyStats = dynamic(
  () => import("~~/components/leaderboard/VoterAccuracyStats").then(mod => mod.VoterAccuracyStats),
  { loading: GovernanceSectionLoading },
);
const AccuracyLeaderboard = dynamic(
  () => import("~~/components/leaderboard/AccuracyLeaderboard").then(mod => mod.AccuracyLeaderboard),
  { loading: GovernanceSectionLoading },
);
const TreasuryBalance = dynamic(
  () => import("~~/components/governance/TreasuryBalance").then(mod => mod.TreasuryBalance),
  { loading: GovernanceSectionLoading },
);
const GovernanceStats = dynamic(
  () => import("~~/components/governance/GovernanceStats").then(mod => mod.GovernanceStats),
  { loading: GovernanceSectionLoading },
);
const GovernanceActionComposer = dynamic(
  () => import("~~/components/governance/GovernanceActionComposer").then(mod => mod.GovernanceActionComposer),
  { loading: GovernanceSectionLoading },
);
const ProposalList = dynamic(() => import("~~/components/governance/ProposalList").then(mod => mod.ProposalList), {
  loading: GovernanceSectionLoading,
});
const PlatformProposals = dynamic(
  () => import("~~/components/governance/PlatformProposals").then(mod => mod.PlatformProposals),
  { loading: GovernanceSectionLoading },
);

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
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<GovernanceTab>("profile");
  const [hashInitialized, setHashInitialized] = useState(false);
  const [referrer, setReferrer] = useState<string | null>(null);
  const autoSelectedEntryAddressRef = useRef<string | null>(null);

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

  // Extract and validate referral code from URL, then fall back to stored attribution.
  useEffect(() => {
    const capturedAttribution = captureReferralAttributionFromSearchParams(searchParams, { source: "url" });
    setReferrer(capturedAttribution?.referrer ?? getStoredReferralAddress());
  }, [searchParams]);

  // Check cREP balance
  const { data: crepBalance, isLoading: crepBalanceLoading } = useScaffoldReadContract({
    contractName: "CuryoReputation",
    functionName: "balanceOf",
    args: [address],
    query: { enabled: !!address },
  });
  const { hasVoterId, isResolved: voterIdResolved } = useVoterIdNFT(address);

  const hasResolvedBalance = !!address && !crepBalanceLoading && crepBalance !== undefined;
  const hasZeroBalance = hasResolvedBalance && crepBalance === 0n;
  const addressKey = address?.toLowerCase() ?? null;
  const shouldWaitForEntryRouting = Boolean(address) && (!hashInitialized || !voterIdResolved);
  const faucetOnly = Boolean(address) && hashInitialized && voterIdResolved && !hasVoterId;

  useEffect(() => {
    autoSelectedEntryAddressRef.current = null;
  }, [addressKey]);

  useEffect(() => {
    if (!addressKey || !hashInitialized || !hasResolvedBalance || !voterIdResolved) {
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
  }, [addressKey, faucetOnly, hasResolvedBalance, hashInitialized, selectTab, voterIdResolved]);

  // Update tab when balance changes
  useEffect(() => {
    if (!hashInitialized) {
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
  }, [faucetOnly, hasResolvedBalance, hasZeroBalance, activeTab, hashInitialized, selectTab]);

  // Show connect wallet prompt if not connected
  if (!isConnected) {
    return <ConnectWalletCard title="cREP" message="Sign in to participate." />;
  }

  if (shouldWaitForEntryRouting) {
    return (
      <AppPageShell contentClassName="space-y-6">
        <div className="flex min-h-[40vh] flex-col items-center justify-center px-4 text-center">
          <span className="loading loading-spinner loading-lg text-primary" />
          <p className="mt-4 text-sm text-base-content/60">Checking Voter ID...</p>
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
              Voter ID
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
          <PlatformProposals />
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
