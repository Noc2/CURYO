"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { SelfApp } from "@selfxyz/qrcode";
import type { Hex } from "viem";
import { useAccount, useSignTypedData } from "wagmi";
import { useDeployedContractInfo, useScaffoldReadContract, useTargetNetwork } from "~~/hooks/scaffold-eth";
import { useCuryoSwitchNetwork } from "~~/hooks/useCuryoSwitchNetwork";
import { FAUCET_MINIMUM_AGE } from "~~/lib/governance/faucetEligibility";
import {
  FAUCET_CLAIM_AUTHORIZATION_TYPES,
  buildSelfVerificationApp,
  encodeFaucetClaimAuthorizationUserData,
  getSelfVerificationUniversalLink,
  getSelfVerificationWebsocketUrl,
  isSelfVerificationSupportedChain,
  normalizeFaucetClaimReferrer,
} from "~~/lib/governance/selfVerificationApp";
import { resolveSelfVerificationErrorMessage } from "~~/lib/governance/selfVerificationError";
import {
  SELF_QRCODE_SDK_VERSION,
  type SelfVerificationTelemetryEvent,
  extractSelfVerificationErrorTelemetry,
  sendSelfVerificationTelemetry,
} from "~~/lib/governance/selfVerificationTelemetry";

// Dynamically import SelfQRcodeWrapper to avoid SSR issues (it uses WebSocket + browser APIs)
const SelfQRcodeWrapper = dynamic(() => import("@selfxyz/qrcode").then(mod => mod.SelfQRcodeWrapper), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center p-8">
      <div className="loading loading-spinner loading-lg text-primary"></div>
    </div>
  ),
});

export type SelfVerificationAttempt = {
  attemptId: string;
};

interface SelfVerifyButtonProps {
  referrer?: string | null;
  onStart?: (attempt: SelfVerificationAttempt) => void;
  onSuccess: (attempt: SelfVerificationAttempt) => void;
}

function createSelfVerificationAttemptId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function SelfVerifyButton({ referrer, onStart, onSuccess }: SelfVerifyButtonProps) {
  const { address, chain, connector } = useAccount();
  const { signTypedDataAsync, isPending: isSigningAuthorization } = useSignTypedData();
  const { targetNetwork } = useTargetNetwork();
  const { switchToChain, switchingChainId } = useCuryoSwitchNetwork();
  const requiredChainId = isSelfVerificationSupportedChain(targetNetwork.id) ? targetNetwork.id : undefined;
  const { data: contractInfo } = useDeployedContractInfo({
    contractName: "HumanFaucet",
    chainId: requiredChainId,
  });
  const { data: recipientAuthorizationNonce } = useScaffoldReadContract({
    contractName: "HumanFaucet",
    functionName: "recipientAuthorizationNonces",
    args: [address],
    chainId: requiredChainId,
    query: { enabled: !!address && !!requiredChainId },
  });
  const [selfApp, setSelfApp] = useState<SelfApp | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [claimAuthorizationUserData, setClaimAuthorizationUserData] = useState<Hex | null>(null);
  const authorizationNonce = typeof recipientAuthorizationNonce === "bigint" ? recipientAuthorizationNonce : null;
  const isOnRequiredChain = !!requiredChainId && chain?.id === requiredChainId;
  const attemptId = useRef<string | null>(null);
  const attemptStartedAt = useRef<number | null>(null);
  const flowLoadedKey = useRef<string | null>(null);

  useEffect(() => {
    setIsMobile(/iPhone|iPad|iPod|Android/i.test(navigator.userAgent));
  }, []);

  const startTelemetryAttempt = useCallback(() => {
    const nextAttemptId = createSelfVerificationAttemptId();
    attemptId.current = nextAttemptId;
    attemptStartedAt.current = Date.now();
    return nextAttemptId;
  }, []);

  const getTelemetryAttempt = useCallback((): SelfVerificationAttempt => {
    if (!attemptId.current) {
      startTelemetryAttempt();
    }

    return {
      attemptId: attemptId.current!,
    };
  }, [startTelemetryAttempt]);

  const logSelfVerificationTelemetry = useCallback(
    (event: SelfVerificationTelemetryEvent, extra: Record<string, unknown> = {}) => {
      sendSelfVerificationTelemetry({
        attemptId: attemptId.current,
        contractAddress: contractInfo?.address ?? null,
        elapsedMs: attemptStartedAt.current ? Date.now() - attemptStartedAt.current : null,
        endpointType: requiredChainId === 42220 ? "celo" : requiredChainId === 11142220 ? "staging_celo" : null,
        event,
        isMobile,
        requiredChainId: requiredChainId ?? null,
        sdkVersion: SELF_QRCODE_SDK_VERSION,
        walletAddress: address ?? null,
        walletChainId: chain?.id ?? null,
        walletId: connector?.id ?? null,
        walletName: connector?.name ?? null,
        ...extra,
      });
    },
    [address, chain?.id, connector?.id, connector?.name, contractInfo?.address, isMobile, requiredChainId],
  );

  useEffect(() => {
    const nextFlowLoadedKey = `${address ?? "anonymous"}:${requiredChainId ?? "unsupported"}:${contractInfo?.address ?? "missing"}`;
    if (flowLoadedKey.current === nextFlowLoadedKey) {
      return;
    }

    flowLoadedKey.current = nextFlowLoadedKey;
    logSelfVerificationTelemetry("self_flow_loaded");
  }, [address, contractInfo?.address, logSelfVerificationTelemetry, requiredChainId]);

  useEffect(() => {
    setClaimAuthorizationUserData(null);
  }, [address, authorizationNonce, contractInfo?.address, referrer, requiredChainId]);

  useEffect(() => {
    if (!address || !contractInfo?.address || !requiredChainId || !isOnRequiredChain) {
      setSelfApp(null);
      return;
    }
    if (!claimAuthorizationUserData) {
      setSelfApp(null);
      return;
    }

    const nextSelfApp = buildSelfVerificationApp({
      address,
      contractAddress: contractInfo.address,
      chainId: requiredChainId,
      deeplinkCallback: isMobile ? window.location.href : undefined,
      referrer,
      claimAuthorizationUserData,
    });

    setSelfApp(nextSelfApp);
    logSelfVerificationTelemetry("self_qr_created");
  }, [
    address,
    contractInfo?.address,
    requiredChainId,
    isOnRequiredChain,
    claimAuthorizationUserData,
    isMobile,
    logSelfVerificationTelemetry,
    referrer,
  ]);

  const authorizeClaim = useCallback(async () => {
    if (!address || !contractInfo?.address || !requiredChainId) {
      return;
    }

    try {
      startTelemetryAttempt();
      logSelfVerificationTelemetry("claim_authorization_started");
      setErrorMessage(null);
      if (chain?.id !== requiredChainId) {
        logSelfVerificationTelemetry("wrong_chain_detected");
        logSelfVerificationTelemetry("wallet_switch_started");
        await switchToChain(requiredChainId);
        logSelfVerificationTelemetry("wallet_chain_ready");
      }

      if (authorizationNonce === null) {
        logSelfVerificationTelemetry("claim_authorization_failed", {
          errorReason: "claim_nonce_loading",
        });
        setErrorMessage("Claim status is still loading. Please try again in a moment.");
        return;
      }

      const normalizedReferrer = normalizeFaucetClaimReferrer(referrer);
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 60 * 60);
      const signature = await signTypedDataAsync({
        domain: {
          name: "Curyo Human Faucet",
          version: "1",
          chainId: requiredChainId,
          verifyingContract: contractInfo.address,
        },
        types: FAUCET_CLAIM_AUTHORIZATION_TYPES,
        primaryType: "FaucetClaimAuthorization",
        message: {
          recipient: address,
          referrer: normalizedReferrer,
          nonce: authorizationNonce,
          deadline,
        },
      });
      setClaimAuthorizationUserData(
        encodeFaucetClaimAuthorizationUserData({
          referrer: normalizedReferrer,
          deadline,
          signature,
        }),
      );
      logSelfVerificationTelemetry("claim_authorization_signed");
    } catch (error) {
      console.error("Failed to authorize faucet claim:", error);
      logSelfVerificationTelemetry("claim_authorization_failed", extractSelfVerificationErrorTelemetry(error));
      setErrorMessage(`Switch to ${targetNetwork.name}, then authorize the claim again.`);
    }
  }, [
    address,
    authorizationNonce,
    chain?.id,
    contractInfo?.address,
    referrer,
    requiredChainId,
    signTypedDataAsync,
    startTelemetryAttempt,
    logSelfVerificationTelemetry,
    switchToChain,
    targetNetwork.name,
  ]);

  if (!address) {
    return <div className="text-center text-base-content/60 py-4">Sign in to verify your identity.</div>;
  }

  if (!requiredChainId) {
    return (
      <div className="bg-error/10 border border-error/20 rounded-xl p-4 text-center">
        <p className="text-error font-medium">Unsupported network</p>
        <p className="text-base-content/60 text-base mt-1">
          Please switch the app to Celo or Celo Sepolia to verify your identity.
        </p>
      </div>
    );
  }

  const websocketUrl = getSelfVerificationWebsocketUrl(requiredChainId);
  if (!websocketUrl) {
    return null;
  }

  if (!selfApp) {
    const isSwitchingRequiredChain = switchingChainId === requiredChainId;
    const authorizeDisabled =
      isSigningAuthorization ||
      isSwitchingRequiredChain ||
      !contractInfo?.address ||
      (isOnRequiredChain && authorizationNonce === null);
    const buttonLabel = isOnRequiredChain ? "Authorize claim" : `Switch to ${targetNetwork.name}`;

    return (
      <div className="flex flex-col items-center gap-3 p-8 text-center">
        <button className="btn btn-curyo btn-lg" onClick={authorizeClaim} disabled={authorizeDisabled}>
          {isSigningAuthorization || isSwitchingRequiredChain ? (
            <span className="loading loading-spinner loading-sm" />
          ) : null}
          {buttonLabel}
        </button>
        {!isOnRequiredChain && (
          <p className="max-w-[300px] text-base text-base-content/60">
            Your wallet needs to be on {targetNetwork.name} before signing the claim authorization.
          </p>
        )}
        {errorMessage && (
          <div className="bg-error/10 border border-error/20 rounded-xl p-3 text-center max-w-[300px]">
            <p className="text-error text-base">{errorMessage}</p>
          </div>
        )}
      </div>
    );
  }

  if (isMobile) {
    return (
      <div className="space-y-3 text-center">
        <a
          href={getSelfVerificationUniversalLink(selfApp)}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-curyo btn-lg inline-flex"
          onClick={() => onStart?.(getTelemetryAttempt())}
        >
          Open Self App
        </a>
        <p className="text-base text-base-content/60">
          Use a passport or biometric ID card in Self. You must be {FAUCET_MINIMUM_AGE}+ and sanctions eligible.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <SelfQRcodeWrapper
        selfApp={selfApp}
        websocketUrl={websocketUrl}
        onSuccess={() => {
          const attempt = getTelemetryAttempt();
          logSelfVerificationTelemetry("self_verification_succeeded", {
            attemptId: attempt.attemptId,
          });
          onSuccess(attempt);
        }}
        onError={(error: any) => {
          console.error("Self.xyz verification error:", error);
          logSelfVerificationTelemetry("self_verification_failed", extractSelfVerificationErrorTelemetry(error));
          setErrorMessage(resolveSelfVerificationErrorMessage(error));
        }}
        size={250}
        darkMode={true}
      />
      {errorMessage && (
        <div className="bg-error/10 border border-error/20 rounded-xl p-3 text-center max-w-[300px]">
          <p className="text-error text-base">{errorMessage}</p>
        </div>
      )}
    </div>
  );
}
