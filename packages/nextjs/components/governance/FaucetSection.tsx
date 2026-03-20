"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useAccount } from "wagmi";
import {
  ArrowPathIcon,
  GiftIcon,
  IdentificationIcon,
  ShieldCheckIcon,
  UserGroupIcon,
} from "@heroicons/react/24/outline";
import { SelfVerifyButton } from "~~/components/governance/SelfVerifyButton";
import { surfaceSectionHeadingClassName } from "~~/components/shared/sectionHeading";
import { InfoTooltip } from "~~/components/ui/InfoTooltip";
import { useTermsAcceptance } from "~~/contexts/TermsAcceptanceContext";
import { useScaffoldReadContract } from "~~/hooks/scaffold-eth";
import { useVoterIdNFT } from "~~/hooks/useVoterIdNFT";

interface FaucetSectionProps {
  referrer?: string | null;
}

const TIER_LABELS = ["Genesis", "Early Adopter", "Pioneer", "Explorer", "Settler"];

/**
 * FaucetSection - Claim cREP tokens using Self.xyz identity verification
 * Reads live data from the deployed HumanFaucet contract.
 */
const SELF_VERIFICATION_SESSION_KEY = "curyo_self_verification_session";
const POLL_INTERVAL_MS = 4000;
const POLL_TIMEOUT_MS = 600_000;

type PendingSelfVerificationSession = {
  address: string;
  startedAt: number;
};

function readPendingSelfVerificationSession(): PendingSelfVerificationSession | null {
  if (typeof window === "undefined") {
    return null;
  }

  const rawSession = sessionStorage.getItem(SELF_VERIFICATION_SESSION_KEY);
  if (!rawSession) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawSession) as Partial<PendingSelfVerificationSession>;
    if (typeof parsed.address !== "string" || typeof parsed.startedAt !== "number") {
      sessionStorage.removeItem(SELF_VERIFICATION_SESSION_KEY);
      return null;
    }

    if (Date.now() - parsed.startedAt > POLL_TIMEOUT_MS) {
      sessionStorage.removeItem(SELF_VERIFICATION_SESSION_KEY);
      return null;
    }

    return {
      address: parsed.address.toLowerCase(),
      startedAt: parsed.startedAt,
    };
  } catch {
    sessionStorage.removeItem(SELF_VERIFICATION_SESSION_KEY);
    return null;
  }
}

function beginPendingSelfVerificationSession(address: string): PendingSelfVerificationSession {
  const normalizedAddress = address.toLowerCase();
  const existingSession = readPendingSelfVerificationSession();
  if (existingSession?.address === normalizedAddress) {
    return existingSession;
  }

  const nextSession = {
    address: normalizedAddress,
    startedAt: Date.now(),
  };
  sessionStorage.setItem(SELF_VERIFICATION_SESSION_KEY, JSON.stringify(nextSession));
  return nextSession;
}

function clearPendingSelfVerificationSession() {
  if (typeof window === "undefined") {
    return;
  }

  sessionStorage.removeItem(SELF_VERIFICATION_SESSION_KEY);
}

export function FaucetSection({ referrer }: FaucetSectionProps) {
  const { address } = useAccount();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { hasVoterId, tokenId, isLoading: voterIdLoading } = useVoterIdNFT(address);
  const { isAccepted, requireAcceptance } = useTermsAcceptance();
  const [termsOk, setTermsOk] = useState(false);
  const [verificationPending, setVerificationPending] = useState(false);
  const pollTimer = useRef<ReturnType<typeof setInterval>>(null);
  const pollStart = useRef<number>(0);

  // Read tier info from HumanFaucet contract
  const { data: tierInfo, isLoading: tierLoading } = useScaffoldReadContract({
    contractName: "HumanFaucet",
    functionName: "getTierInfo",
  });

  // Check if this address has already claimed
  const {
    data: hasClaimed,
    isLoading: claimLoading,
    refetch: refetchClaimed,
  } = useScaffoldReadContract({
    contractName: "HumanFaucet",
    functionName: "hasClaimed",
    args: [address],
  });

  // Check if referrer is valid (has a Voter ID)
  const { data: isValidReferrer } = useScaffoldReadContract({
    contractName: "HumanFaucet",
    functionName: "isValidReferrer",
    args: [referrer as `0x${string}`],
    query: { enabled: !!referrer },
  });

  // When the Self app reports success, start polling hasClaimed until on-chain tx confirms
  const stopPolling = useCallback(() => {
    if (pollTimer.current) {
      clearInterval(pollTimer.current);
      pollTimer.current = null;
    }
  }, []);

  const finishVerification = useCallback(() => {
    clearPendingSelfVerificationSession();
    stopPolling();
    setVerificationPending(false);
    // Invalidate all queries so navbar balance updates immediately
    void queryClient.invalidateQueries();
    router.replace("/vote");
  }, [queryClient, router, stopPolling]);

  const startPolling = useCallback(() => {
    const activeSession = address ? beginPendingSelfVerificationSession(address) : null;
    setVerificationPending(true);
    pollStart.current = activeSession?.startedAt ?? Date.now();
    stopPolling();

    const pollClaimStatus = async () => {
      if (hasVoterId) {
        finishVerification();
        return true;
      }

      const result = await refetchClaimed();
      if (result.data === true) {
        finishVerification();
        return true;
      }

      if (Date.now() - pollStart.current > POLL_TIMEOUT_MS) {
        clearPendingSelfVerificationSession();
        stopPolling();
        setVerificationPending(false);
        return true;
      }

      return false;
    };

    void pollClaimStatus().then(completed => {
      if (completed) {
        return;
      }

      pollTimer.current = setInterval(() => {
        void pollClaimStatus();
      }, POLL_INTERVAL_MS);
    });
  }, [address, finishVerification, hasVoterId, refetchClaimed, stopPolling]);

  // Clean up polling on unmount
  useEffect(() => stopPolling, [stopPolling]);

  useEffect(() => {
    if (!address) {
      stopPolling();
      setVerificationPending(false);
      return;
    }

    const activeSession = readPendingSelfVerificationSession();
    if (activeSession?.address !== address.toLowerCase()) {
      return;
    }

    if (hasClaimed === true || hasVoterId) {
      finishVerification();
      return;
    }

    if (!verificationPending) {
      startPolling();
    }
  }, [address, finishVerification, hasClaimed, hasVoterId, startPolling, stopPolling, verificationPending]);

  useEffect(() => {
    if (!address) {
      return;
    }

    const resumeVerificationTracking = () => {
      const activeSession = readPendingSelfVerificationSession();
      if (activeSession?.address !== address.toLowerCase()) {
        return;
      }

      if (hasClaimed === true || hasVoterId) {
        finishVerification();
        return;
      }

      if (!verificationPending) {
        startPolling();
      }
    };

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        resumeVerificationTracking();
      }
    };

    window.addEventListener("focus", resumeVerificationTracking);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("focus", resumeVerificationTracking);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [address, finishVerification, hasClaimed, hasVoterId, startPolling, verificationPending]);

  // Sync terms acceptance from context (already accepted via localStorage)
  useEffect(() => {
    if (isAccepted) setTermsOk(true);
  }, [isAccepted]);

  // Destructure tier info
  const currentTier = tierInfo ? Number(tierInfo[0]) : 0;
  const claimAmount = tierInfo?.[1];
  const claimantBonus = tierInfo?.[2];
  const claimantsUntilNextTier = tierInfo?.[5];

  // Format token amount (6 decimals)
  const formatAmount = (amount: bigint | undefined) => {
    if (!amount) return "0";
    return (Number(amount) / 1e6).toLocaleString();
  };

  // Calculate total claim amount
  const baseAmount = claimAmount ?? 0n;
  const bonusAmount = isValidReferrer ? (claimantBonus ?? 0n) : 0n;
  const totalClaimAmount = baseAmount + bonusAmount;

  if (voterIdLoading || tierLoading || claimLoading) {
    return (
      <div className="surface-card rounded-2xl p-6 text-center">
        <div className="loading loading-spinner loading-lg text-primary mx-auto mb-4"></div>
        <p className="text-base-content/60">Loading verification status...</p>
      </div>
    );
  }

  if (hasClaimed || hasVoterId) {
    return (
      <div className="surface-card rounded-2xl p-6 text-center space-y-4">
        <ShieldCheckIcon className="w-12 h-12 text-success mx-auto" />
        <h2 className={surfaceSectionHeadingClassName}>Verified Human</h2>

        {/* Voter ID Badge */}
        {hasVoterId && (
          <div className="inline-flex items-center gap-2 bg-primary/20 border border-primary/30 rounded-full px-4 py-2">
            <IdentificationIcon className="w-5 h-5 text-primary" />
            <span className="font-bold text-primary">Voter ID #{tokenId.toString()}</span>
          </div>
        )}

        <p className="text-base-content/60">
          You have claimed your cREP tokens and received your Voter ID. Check your referral link in Settings.
        </p>

        {/* Benefits */}
        <div className="bg-base-200 rounded-xl p-4 text-left mt-4">
          <h3 className="font-semibold mb-2">Your Voter ID Unlocks:</h3>
          <ul className="space-y-1 text-base text-base-content/70">
            <li>Vote on content (up to 100 cREP per content per round)</li>
            <li>Submit content to the platform</li>
            <li>Create your profile</li>
            <li>Refer friends and gain reputation</li>
          </ul>
        </div>

        <Link href="/vote" className="btn btn-primary w-full mt-4">
          Start Voting
        </Link>
      </div>
    );
  }

  return (
    <div className="surface-card rounded-2xl p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <GiftIcon className="w-6 h-6 text-primary" />
        <h2 className={surfaceSectionHeadingClassName}>cREP Faucet</h2>
        <InfoTooltip text="Claim free cREP with a Self.xyz passport or biometric ID card proof" />
      </div>

      {/* Referral Badge */}
      {isValidReferrer && (
        <div className="bg-success/10 border border-success/20 rounded-xl p-4">
          <div className="flex items-center gap-2 text-success">
            <UserGroupIcon className="w-5 h-5" />
            <span className="font-medium">Referral Bonus Active!</span>
          </div>
          <p className="text-base text-base-content/70 mt-1">
            You will receive an extra {formatAmount(claimantBonus)} cREP bonus
          </p>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-base-200 rounded-xl p-4">
          <p className="text-base text-base-content/60">You Will Receive</p>
          <p className="text-2xl font-bold text-primary">{formatAmount(totalClaimAmount)} cREP</p>
          {isValidReferrer && <p className="text-base text-success">+{formatAmount(claimantBonus)} bonus</p>}
        </div>
        <div className="bg-base-200 rounded-xl p-4">
          <div className="flex items-center gap-1">
            <p className="text-base text-base-content/60">Current Tier</p>
            <InfoTooltip
              text={`${TIER_LABELS[currentTier] ?? `Tier ${currentTier}`}${claimantsUntilNextTier !== undefined && claimantsUntilNextTier > 0n ? ` — ${Number(claimantsUntilNextTier)} claims left` : ""}`}
            />
          </div>
          <p className="text-2xl font-bold text-warning">Tier {currentTier}</p>
        </div>
        <div className="bg-base-200 rounded-xl p-4">
          <p className="text-base text-base-content/60">Verification</p>
          <a
            href="https://self.xyz"
            target="_blank"
            rel="noopener noreferrer"
            className="text-2xl font-bold link link-hover"
          >
            Self.xyz
          </a>
        </div>
      </div>

      {/* Verify with Self.xyz */}
      <div className="bg-primary/10 rounded-xl p-6 space-y-4">
        {verificationPending ? (
          <div className="flex flex-col items-center gap-4 py-4">
            <ArrowPathIcon className="w-12 h-12 text-primary animate-spin" />
            <div className="text-center space-y-2">
              <p className="text-lg font-semibold">Verifying...</p>
              <p className="text-base-content/60 text-base">
                Your proof has been submitted. Verification may take a moment.
              </p>
            </div>
            <div className="flex gap-2 mt-2">
              {[0, 1, 2].map(i => (
                <div
                  key={i}
                  className="w-2.5 h-2.5 rounded-full bg-primary animate-pulse"
                  style={{ animationDelay: `${i * 300}ms` }}
                />
              ))}
            </div>
          </div>
        ) : termsOk ? (
          <>
            <div className="flex flex-col items-center gap-2 text-center">
              <p className="text-base-content/60 text-base">
                Claim <span className="font-bold text-primary">{formatAmount(totalClaimAmount)} cREP</span> by verifying
                with{" "}
                <a href="https://self.xyz" target="_blank" rel="noopener noreferrer" className="link link-primary">
                  Self.xyz
                </a>{" "}
                that you are a human
              </p>
              <p className="text-base-content/60 text-base">Use a passport or biometric ID card.</p>
            </div>

            <SelfVerifyButton onStart={startPolling} onSuccess={startPolling} />
          </>
        ) : (
          <div className="flex flex-col items-center gap-4 text-center">
            <p className="text-base-content/60 text-base">
              Claim <span className="font-bold text-primary">{formatAmount(totalClaimAmount)} cREP</span> by verifying
              with{" "}
              <a href="https://self.xyz" target="_blank" rel="noopener noreferrer" className="link link-primary">
                Self.xyz
              </a>{" "}
              that you are a human
            </p>
            <button
              className="btn btn-primary btn-lg"
              onClick={async () => {
                const accepted = await requireAcceptance("faucet");
                if (accepted) setTermsOk(true);
              }}
            >
              Accept Terms &amp; Verify Identity
            </button>
          </div>
        )}
      </div>

      {/* How it works */}
      <div className="space-y-3">
        <h3 className="font-semibold">How it works</h3>
        <ol className="list-decimal list-inside space-y-2 text-base text-base-content/70">
          <li>Install the Self app and scan your passport or biometric ID card</li>
          <li>Scan the QR code above with the Self app</li>
          <li>Self generates a zero-knowledge proof — no personal data is shared</li>
          <li>The proof is verified on the blockchain and you receive your cREP + Voter ID</li>
          {isValidReferrer && <li className="text-success">Referral bonus is applied automatically!</li>}
        </ol>
      </div>

      {/* Security note */}
      <div className="bg-warning/10 rounded-lg p-4 text-base text-base-content/60">
        <p>
          <strong>Security &amp; Privacy:</strong> Your document data never leaves your device. The Self.xyz app
          processes everything locally on your phone to generate a zero-knowledge proof of human.
        </p>
      </div>
    </div>
  );
}
