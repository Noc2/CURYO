"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import type { SelfApp } from "@selfxyz/qrcode";
import { useAccount } from "wagmi";
import { useDeployedContractInfo } from "~~/hooks/scaffold-eth";
import { FAUCET_MINIMUM_AGE } from "~~/lib/governance/faucetEligibility";
import {
  buildSelfVerificationApp,
  getSelfVerificationUniversalLink,
  getSelfVerificationWebsocketUrl,
  isSelfVerificationSupportedChain,
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
  const { data: contractInfo } = useDeployedContractInfo({ contractName: "HumanFaucet" });
  const [selfApp, setSelfApp] = useState<SelfApp | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    setIsMobile(/iPhone|iPad|iPod|Android/i.test(navigator.userAgent));
  }, []);

  useEffect(() => {
    if (!address || !contractInfo?.address || !chain?.id) {
      setSelfApp(null);
      return;
    }

    const nextSelfApp = buildSelfVerificationApp({
      address,
      contractAddress: contractInfo.address,
      chainId: chain.id,
      deeplinkCallback: isMobile ? window.location.href : undefined,
      referrer,
    });

    setSelfApp(nextSelfApp);
  }, [address, contractInfo?.address, chain?.id, isMobile, referrer]);

  if (!isSelfVerificationSupportedChain(chain?.id)) {
    return (
      <div className="bg-error/10 border border-error/20 rounded-xl p-4 text-center">
        <p className="text-error font-medium">Unsupported network</p>
        <p className="text-base-content/60 text-base mt-1">
          Please switch to Celo or Celo Sepolia to verify your identity.
        </p>
      </div>
    );
  }

  const websocketUrl = getSelfVerificationWebsocketUrl(chain.id);
  if (!websocketUrl) {
    return null;
  }

  if (!address) {
    return <div className="text-center text-base-content/60 py-4">Sign in to verify your identity.</div>;
  }

  if (!selfApp) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="loading loading-spinner loading-lg text-primary"></div>
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
