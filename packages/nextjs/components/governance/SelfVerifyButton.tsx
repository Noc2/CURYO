"use client";

import { useCallback, useEffect, useState } from "react";
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

// Dynamically import SelfQRcodeWrapper to avoid SSR issues (it uses WebSocket + browser APIs)
const SelfQRcodeWrapper = dynamic(() => import("@selfxyz/qrcode").then(mod => mod.SelfQRcodeWrapper), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center p-8">
      <div className="loading loading-spinner loading-lg text-primary"></div>
    </div>
  ),
});

interface SelfVerifyButtonProps {
  referrer?: string | null;
  onStart?: () => void;
  onSuccess: () => void;
}

export function SelfVerifyButton({ referrer, onStart, onSuccess }: SelfVerifyButtonProps) {
  const { address, chain } = useAccount();
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

  useEffect(() => {
    setIsMobile(/iPhone|iPad|iPod|Android/i.test(navigator.userAgent));
  }, []);

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
  }, [
    address,
    contractInfo?.address,
    requiredChainId,
    isOnRequiredChain,
    claimAuthorizationUserData,
    isMobile,
    referrer,
  ]);

  const authorizeClaim = useCallback(async () => {
    if (!address || !contractInfo?.address || !requiredChainId) {
      return;
    }

    try {
      setErrorMessage(null);
      if (chain?.id !== requiredChainId) {
        await switchToChain(requiredChainId);
      }

      if (authorizationNonce === null) {
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
    } catch (error) {
      console.error("Failed to authorize faucet claim:", error);
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
          onClick={() => onStart?.()}
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
        onSuccess={onSuccess}
        onError={(error: any) => {
          console.error("Self.xyz verification error:", error);
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
