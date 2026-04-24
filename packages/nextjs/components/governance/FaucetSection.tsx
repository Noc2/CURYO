"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useAccount } from "wagmi";
import {
  ArrowPathIcon,
  ExclamationTriangleIcon,
  GiftIcon,
  IdentificationIcon,
  ShieldCheckIcon,
  UserGroupIcon,
} from "@heroicons/react/24/outline";
import { SelfVerifyButton } from "~~/components/governance/SelfVerifyButton";
import { surfaceSectionHeadingClassName } from "~~/components/shared/sectionHeading";
import { InfoTooltip } from "~~/components/ui/InfoTooltip";
import { RATE_ROUTE } from "~~/constants/routes";
import { useTermsAcceptance } from "~~/contexts/TermsAcceptanceContext";
import { useDeployedContractInfo, useScaffoldReadContract } from "~~/hooks/scaffold-eth";
import { FREE_TRANSACTION_ALLOWANCE_QUERY_KEY } from "~~/hooks/useFreeTransactionAllowance";
import { useVoterIdNFT } from "~~/hooks/useVoterIdNFT";
import { FAUCET_EXCLUDED_COUNTRY_NAMES, FAUCET_MINIMUM_AGE } from "~~/lib/governance/faucetEligibility";
import { shouldRefreshAfterFaucetClaim } from "~~/lib/governance/faucetQueryInvalidation";
import { buildSelfVerificationApp, getSelfVerificationUniversalLink } from "~~/lib/governance/selfVerificationApp";
import {
  clearStoredReferralAttribution,
  normalizeReferralAddress,
  storeReferralAttributionFromValue,
} from "~~/lib/referrals/referralAttribution";
import { notification } from "~~/utils/scaffold-eth";

interface FaucetSectionProps {
  referrer?: string | null;
}

const TIER_LABELS = ["Genesis", "Early Adopter", "Pioneer", "Explorer", "Settler"];

/**
 * FaucetSection - Claim HREP tokens using Self.xyz identity verification
 * Reads live data from the deployed HumanFaucet contract.
 */
const SELF_VERIFICATION_SESSION_KEY = "curyo_self_verification_session";
const POLL_INTERVAL_MS = 4000;
const POLL_TIMEOUT_MS = 600_000;
const POST_CLAIM_ROUTE = RATE_ROUTE;
const FAUCET_EXCLUDED_COUNTRIES_LABEL = FAUCET_EXCLUDED_COUNTRY_NAMES.join(", ");

type PendingSelfVerificationSession = {
  address: string;
  startedAt: number;
};

type FaucetClaimStatus = "unclaimed" | "verified" | "claim_without_voter_id";

type FaucetReferralInputState = {
  canCheckReferrer: boolean;
  hasReferralInput: boolean;
  isInvalid: boolean;
  isSelfReferral: boolean;
  normalizedReferrer: string | null;
};

export function getFaucetClaimStatus({
  hasClaimed,
  hasVoterId,
}: {
  hasClaimed: boolean;
  hasVoterId: boolean;
}): FaucetClaimStatus {
  if (hasVoterId) {
    return "verified";
  }

  if (hasClaimed) {
    return "claim_without_voter_id";
  }

  return "unclaimed";
}

export function getFaucetReferralInputState({
  connectedAddress,
  inputValue,
}: {
  connectedAddress?: string | null;
  inputValue: string;
}): FaucetReferralInputState {
  const hasReferralInput = inputValue.trim().length > 0;
  const normalizedReferrer = normalizeReferralAddress(inputValue);
  const normalizedConnectedAddress = normalizeReferralAddress(connectedAddress);
  const isSelfReferral = !!normalizedReferrer && normalizedReferrer === normalizedConnectedAddress;

  return {
    canCheckReferrer: !!normalizedReferrer && !isSelfReferral,
    hasReferralInput,
    isInvalid: hasReferralInput && !normalizedReferrer,
    isSelfReferral,
    normalizedReferrer,
  };
}

function readPendingSelfVerificationSession(): PendingSelfVerificationSession | null {
  if (typeof window === "undefined") {
    return null;
  }

  const rawSession =
    sessionStorage.getItem(SELF_VERIFICATION_SESSION_KEY) ?? localStorage.getItem(SELF_VERIFICATION_SESSION_KEY);
  if (!rawSession) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawSession) as Partial<PendingSelfVerificationSession>;
    if (typeof parsed.address !== "string" || typeof parsed.startedAt !== "number") {
      sessionStorage.removeItem(SELF_VERIFICATION_SESSION_KEY);
      localStorage.removeItem(SELF_VERIFICATION_SESSION_KEY);
      return null;
    }

    if (Date.now() - parsed.startedAt > POLL_TIMEOUT_MS) {
      sessionStorage.removeItem(SELF_VERIFICATION_SESSION_KEY);
      localStorage.removeItem(SELF_VERIFICATION_SESSION_KEY);
      return null;
    }

    return {
      address: parsed.address.toLowerCase(),
      startedAt: parsed.startedAt,
    };
  } catch {
    sessionStorage.removeItem(SELF_VERIFICATION_SESSION_KEY);
    localStorage.removeItem(SELF_VERIFICATION_SESSION_KEY);
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
  localStorage.setItem(SELF_VERIFICATION_SESSION_KEY, JSON.stringify(nextSession));
  return nextSession;
}

function clearPendingSelfVerificationSession() {
  if (typeof window === "undefined") {
    return;
  }

  sessionStorage.removeItem(SELF_VERIFICATION_SESSION_KEY);
  localStorage.removeItem(SELF_VERIFICATION_SESSION_KEY);
}

export function FaucetSection({ referrer }: FaucetSectionProps) {
  const referralInputMessageId = useId();
  const { address, chain } = useAccount();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { hasVoterId, tokenId, isLoading: voterIdLoading, refetch: refetchVoterId } = useVoterIdNFT(address);
  const { isAccepted, requireAcceptance } = useTermsAcceptance();
  const { data: faucetContractInfo } = useDeployedContractInfo({ contractName: "HumanFaucet" });
  const [termsOk, setTermsOk] = useState(false);
  const [verificationPending, setVerificationPending] = useState(false);
  const [verificationConfirmed, setVerificationConfirmed] = useState(false);
  const [referralInput, setReferralInput] = useState(() => normalizeReferralAddress(referrer) ?? "");
  const [hasEditedReferralInput, setHasEditedReferralInput] = useState(false);
  const [selfRetryLink, setSelfRetryLink] = useState<string | null>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval>>(null);
  const pollStart = useRef<number>(0);
  const completionHandled = useRef(false);
  const statusToastId = useRef<string | null>(null);
  const normalizedIncomingReferrer = normalizeReferralAddress(referrer);
  const referralInputState = getFaucetReferralInputState({ connectedAddress: address, inputValue: referralInput });
  const effectiveReferrer = referralInputState.canCheckReferrer ? referralInputState.normalizedReferrer : null;

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

  const { refetch: refetchHrepBalance } = useScaffoldReadContract({
    contractName: "HumanReputation",
    functionName: "balanceOf",
    args: [address],
    query: { enabled: !!address },
  });

  // Check if referrer is valid (has a Voter ID)
  const { data: isValidReferrer, isLoading: referrerLoading } = useScaffoldReadContract({
    contractName: "HumanFaucet",
    functionName: "isValidReferrer",
    args: [effectiveReferrer as `0x${string}`],
    query: { enabled: !!effectiveReferrer },
  });

  // When the Self app reports success, start polling hasClaimed until on-chain tx confirms
  const stopPolling = useCallback(() => {
    if (pollTimer.current) {
      clearInterval(pollTimer.current);
      pollTimer.current = null;
    }
  }, []);

  const clearStatusToast = useCallback(() => {
    if (statusToastId.current) {
      notification.remove(statusToastId.current);
      statusToastId.current = null;
    }
  }, []);

  const showStatusToast = useCallback(
    (message: string) => {
      clearStatusToast();
      statusToastId.current = notification.loading(message);
    },
    [clearStatusToast],
  );

  const finishVerification = useCallback(
    async (claimStatus: Exclude<FaucetClaimStatus, "unclaimed">) => {
      if (completionHandled.current) {
        return;
      }

      completionHandled.current = true;
      clearPendingSelfVerificationSession();
      stopPolling();
      setVerificationPending(false);
      setVerificationConfirmed(false);
      clearStatusToast();

      if (address) {
        try {
          const balanceResult = await refetchHrepBalance();
          if (balanceResult.data !== undefined) {
            queryClient.setQueryData(["wallet-hrep-balance", address.toLowerCase()], balanceResult.data);
          }
        } catch {
          // Fall back to invalidation-only refresh if the direct balance read fails.
        }

        void queryClient.invalidateQueries({ queryKey: ["wallet-hrep-balance", address.toLowerCase()] });
      }

      void queryClient.invalidateQueries({ queryKey: FREE_TRANSACTION_ALLOWANCE_QUERY_KEY });
      void queryClient.invalidateQueries({
        predicate: query => shouldRefreshAfterFaucetClaim(query.queryKey, address),
      });
      void refetchVoterId();

      if (claimStatus === "verified") {
        notification.success("HREP sent and Voter ID minted. Your wallet balance may take a few seconds to refresh.", {
          duration: 6000,
        });
        router.replace(POST_CLAIM_ROUTE);
        return;
      }

      notification.warning(
        "HREP sent, but your Voter ID is still pending. Voting will unlock after minting is retried.",
        {
          duration: 9000,
        },
      );
    },
    [address, clearStatusToast, queryClient, refetchHrepBalance, refetchVoterId, router, stopPolling],
  );

  const startPolling = useCallback(() => {
    const activeSession = address ? beginPendingSelfVerificationSession(address) : null;
    setVerificationPending(true);
    pollStart.current = activeSession?.startedAt ?? Date.now();
    stopPolling();

    const pollClaimStatus = async () => {
      if (hasVoterId) {
        await finishVerification("verified");
        return true;
      }

      const result = await refetchClaimed();
      if (result.data === true) {
        const voterIdResult = await refetchVoterId();
        await finishVerification(voterIdResult.hasVoterId ? "verified" : "claim_without_voter_id");
        return true;
      }

      if (Date.now() - pollStart.current > POLL_TIMEOUT_MS) {
        clearPendingSelfVerificationSession();
        stopPolling();
        setVerificationPending(false);
        setVerificationConfirmed(false);
        clearStatusToast();
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
  }, [address, clearStatusToast, finishVerification, hasVoterId, refetchClaimed, refetchVoterId, stopPolling]);

  // Clean up polling on unmount
  useEffect(
    () => () => {
      clearStatusToast();
      stopPolling();
    },
    [clearStatusToast, stopPolling],
  );

  useEffect(() => {
    completionHandled.current = false;
    clearStatusToast();
    setVerificationConfirmed(false);

    if (!address) {
      stopPolling();
      setVerificationPending(false);
    }
  }, [address, clearStatusToast, stopPolling]);

  useEffect(() => {
    if (!address) {
      stopPolling();
      setVerificationPending(false);
      setVerificationConfirmed(false);
      clearStatusToast();
      return;
    }

    const activeSession = readPendingSelfVerificationSession();
    if (activeSession?.address !== address.toLowerCase()) {
      return;
    }

    if (hasVoterId) {
      void finishVerification("verified");
      return;
    }

    if (hasClaimed === true) {
      void refetchVoterId();
      void finishVerification("claim_without_voter_id");
      return;
    }

    if (!verificationPending) {
      startPolling();
    }
  }, [
    address,
    clearStatusToast,
    finishVerification,
    hasClaimed,
    hasVoterId,
    refetchVoterId,
    startPolling,
    stopPolling,
    verificationPending,
  ]);

  useEffect(() => {
    if (!address) {
      return;
    }

    const resumeVerificationTracking = () => {
      const activeSession = readPendingSelfVerificationSession();
      if (activeSession?.address !== address.toLowerCase()) {
        return;
      }

      if (hasVoterId) {
        void finishVerification("verified");
        return;
      }

      if (hasClaimed === true) {
        void refetchVoterId();
        void finishVerification("claim_without_voter_id");
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
  }, [address, finishVerification, hasClaimed, hasVoterId, refetchVoterId, startPolling, verificationPending]);

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      !/iPhone|iPad|iPod|Android/i.test(window.navigator.userAgent) ||
      !address ||
      !chain?.id ||
      !faucetContractInfo?.address
    ) {
      setSelfRetryLink(null);
      return;
    }

    const selfApp = buildSelfVerificationApp({
      address,
      contractAddress: faucetContractInfo.address,
      chainId: chain.id,
      deeplinkCallback: window.location.href,
      referrer: effectiveReferrer,
    });

    setSelfRetryLink(selfApp ? getSelfVerificationUniversalLink(selfApp) : null);
  }, [address, chain?.id, effectiveReferrer, faucetContractInfo?.address]);

  useEffect(() => {
    if (hasEditedReferralInput) {
      return;
    }

    setReferralInput(normalizedIncomingReferrer ?? "");
  }, [hasEditedReferralInput, normalizedIncomingReferrer]);

  const handleVerificationStarted = useCallback(() => {
    completionHandled.current = false;
    setVerificationConfirmed(false);
    notification.info("Finish verification in Self. If it does not open, tap Open Self again.", {
      duration: 5000,
    });
    startPolling();
  }, [startPolling]);

  const handleVerificationSuccess = useCallback(() => {
    completionHandled.current = false;
    setVerificationConfirmed(true);
    showStatusToast("Verification received. Finalizing your HREP faucet claim...");
    startPolling();
  }, [showStatusToast, startPolling]);

  const handleReferralInputChange = useCallback((value: string) => {
    setHasEditedReferralInput(true);
    setReferralInput(value);
  }, []);

  const handleReferralInputBlur = useCallback(() => {
    if (!referralInputState.canCheckReferrer || !referralInputState.normalizedReferrer) {
      return;
    }

    storeReferralAttributionFromValue(referralInputState.normalizedReferrer, { source: "manual" });
  }, [referralInputState.canCheckReferrer, referralInputState.normalizedReferrer]);

  const handleClearReferralInput = useCallback(() => {
    setHasEditedReferralInput(true);
    setReferralInput("");
    clearStoredReferralAttribution();
  }, []);

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
  const referralBonusActive = referralInputState.canCheckReferrer && isValidReferrer === true;
  const referralCheckPending = referralInputState.canCheckReferrer && referrerLoading;
  const referralInputMessage = referralInputState.isInvalid
    ? "Enter a valid EVM address. The base faucet claim still works without it."
    : referralInputState.isSelfReferral
      ? "Use a different wallet address. Self-referrals do not receive a bonus."
      : referralCheckPending
        ? "Checking referral eligibility..."
        : referralInputState.canCheckReferrer && !referralBonusActive
          ? "Referral saved, but this address is not eligible yet. Your base claim will still work."
          : "";
  const referralInputMessageClassName = referralInputState.isInvalid
    ? "text-error"
    : referralInputState.isSelfReferral
      ? "text-warning"
      : "text-base-content/60";
  const bonusAmount = referralBonusActive ? (claimantBonus ?? 0n) : 0n;
  const totalClaimAmount = baseAmount + bonusAmount;
  const faucetClaimStatus = getFaucetClaimStatus({ hasClaimed: hasClaimed === true, hasVoterId });

  if (voterIdLoading || tierLoading || claimLoading) {
    return (
      <div className="surface-card rounded-2xl p-6 text-center">
        <div className="loading loading-spinner loading-lg text-primary mx-auto mb-4"></div>
        <p className="text-base-content/60">Loading verification status...</p>
      </div>
    );
  }

  if (faucetClaimStatus === "verified") {
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
          You have claimed your HREP tokens and received your Voter ID. Check your referral link in Settings.
        </p>

        {/* Benefits */}
        <div className="bg-base-200 rounded-xl p-4 text-left mt-4">
          <h3 className="font-semibold mb-2">Your Voter ID Unlocks:</h3>
          <ul className="space-y-1 text-base text-base-content/70">
            <li>Vote on content (up to 100 HREP per content per round)</li>
            <li>Create your profile</li>
            <li>Refer friends and gain reputation</li>
          </ul>
        </div>

        <Link href={RATE_ROUTE} className="btn btn-primary w-full mt-4">
          Start Rating
        </Link>
      </div>
    );
  }

  if (faucetClaimStatus === "claim_without_voter_id") {
    return (
      <div className="surface-card rounded-2xl p-6 text-center space-y-4">
        <ExclamationTriangleIcon className="w-12 h-12 text-warning mx-auto" />
        <h2 className={surfaceSectionHeadingClassName}>HREP Claimed, Voter ID Pending</h2>

        <p className="text-base-content/70">
          Your faucet claim succeeded, but your Voter ID was not minted. Voting, profiles, and referrals unlock after
          the Voter ID mint is retried.
        </p>

        {address && (
          <div className="bg-base-200 rounded-xl p-4 text-left text-sm text-base-content/70">
            <p className="font-semibold text-base-content mb-1">Use an official support channel for this wallet:</p>
            <p className="break-all font-mono">{address}</p>
          </div>
        )}

        <button
          type="button"
          className="btn btn-primary w-full mt-4"
          onClick={() => {
            void refetchClaimed();
            void refetchVoterId();
          }}
        >
          Refresh Voter ID Status
        </button>
      </div>
    );
  }

  return (
    <div className="surface-card rounded-2xl p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <GiftIcon className="w-6 h-6 text-primary" />
        <h2 className={surfaceSectionHeadingClassName}>Human Reputation (HREP) Faucet</h2>
        <InfoTooltip
          text={`Claim free HREP after proving you are ${FAUCET_MINIMUM_AGE}+, human, and sanctions eligible with Self.xyz.`}
        />
      </div>

      <div className="rounded-xl bg-base-200/60 p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label htmlFor="faucet-referral-address" className="font-semibold">
            Referral address (optional)
          </label>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            id="faucet-referral-address"
            type="text"
            value={referralInput}
            placeholder="0x..."
            aria-describedby={referralInputMessage ? referralInputMessageId : undefined}
            aria-invalid={referralInputState.isInvalid || referralInputState.isSelfReferral || undefined}
            className={`input input-bordered min-w-0 flex-1 font-mono text-sm ${
              referralInputState.isInvalid || referralInputState.isSelfReferral ? "input-error" : ""
            }`}
            disabled={verificationPending}
            onBlur={handleReferralInputBlur}
            onChange={event => handleReferralInputChange(event.target.value)}
          />
          <button
            type="button"
            className="btn btn-ghost border border-base-300 sm:w-auto"
            disabled={!referralInput || verificationPending}
            onClick={handleClearReferralInput}
          >
            Clear
          </button>
        </div>
        {referralInputMessage ? (
          <p
            id={referralInputMessageId}
            className={`text-sm ${referralInputMessageClassName}`}
            role="status"
            aria-live="polite"
          >
            {referralInputMessage}
          </p>
        ) : null}
      </div>

      {/* Referral Badge */}
      {referralBonusActive && (
        <div className="bg-success/10 border border-success/20 rounded-xl p-4">
          <div className="flex items-center gap-2 text-success">
            <UserGroupIcon className="w-5 h-5" />
            <span className="font-medium">Referral Bonus Active!</span>
          </div>
          <p className="text-base text-base-content/70 mt-1">
            You will receive an extra {formatAmount(claimantBonus)} HREP bonus
          </p>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-base-200 rounded-xl p-4">
          <p className="text-base text-base-content/60">You Will Receive</p>
          <p className="text-2xl font-bold text-primary">{formatAmount(totalClaimAmount)} HREP</p>
          {referralBonusActive && <p className="text-base text-success">+{formatAmount(claimantBonus)} bonus</p>}
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
          <p className="text-base text-base-content/60">Verification Service</p>
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
              <p className="text-lg font-semibold">
                {verificationConfirmed ? "Finalizing claim..." : "Waiting for Self..."}
              </p>
              <p className="text-base-content/60 text-base">
                {verificationConfirmed
                  ? "Self verification succeeded. Your HREP claim is being finalized. Your wallet balance can lag briefly."
                  : "Complete verification in Self."}
              </p>
            </div>
            {!verificationConfirmed && selfRetryLink ? (
              <a
                href={selfRetryLink}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-primary btn-sm"
                onClick={handleVerificationStarted}
              >
                Open Self again
              </a>
            ) : null}
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
          <SelfVerifyButton
            referrer={effectiveReferrer}
            onStart={handleVerificationStarted}
            onSuccess={handleVerificationSuccess}
          />
        ) : (
          <div className="flex flex-col items-center gap-4 text-center">
            <p className="text-base-content/60 text-base">
              Claim <span className="font-bold text-primary">{formatAmount(totalClaimAmount)} HREP</span> by verifying
              with{" "}
              <a href="https://self.xyz" target="_blank" rel="noopener noreferrer" className="link link-primary">
                Self.xyz
              </a>{" "}
              that you are an eligible human
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
          <li>Self proves you are {FAUCET_MINIMUM_AGE}+ without sharing your date of birth</li>
          <li>Sanctions screening must pass, and claims are unavailable from {FAUCET_EXCLUDED_COUNTRIES_LABEL}</li>
          <li>Self generates a zero-knowledge proof without sharing personal document data</li>
          <li>The proof is verified on the blockchain and you receive your HREP + Voter ID</li>
        </ol>
      </div>

      {/* Security note */}
      <div className="bg-warning/10 rounded-lg p-4 text-base text-base-content/60">
        <p>
          <strong>Security &amp; Privacy:</strong> Your document data never leaves your device. The Self.xyz app
          processes everything locally on your phone to generate a zero-knowledge proof of humanity, age, and sanctions
          eligibility.
        </p>
      </div>
    </div>
  );
}
