"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { SelfAppBuilder } from "@selfxyz/qrcode";
import type { SelfApp } from "@selfxyz/qrcode";
import { useAccount } from "wagmi";
import { useDeployedContractInfo } from "~~/hooks/scaffold-eth";
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
  onSuccess: () => void;
}

const ENDPOINT_TYPES: Record<number, "celo" | "staging_celo"> = {
  42220: "celo",
  11142220: "staging_celo",
};

const SELF_WEBSOCKET_URLS: Record<number, string> = {
  42220: "wss://websocket.self.xyz",
  11142220: "wss://websocket.staging.self.xyz",
};

export function SelfVerifyButton({ onSuccess }: SelfVerifyButtonProps) {
  const { address, chain } = useAccount();
  const { data: contractInfo } = useDeployedContractInfo({ contractName: "HumanFaucet" });
  const [selfApp, setSelfApp] = useState<SelfApp | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    setIsMobile(/iPhone|iPad|iPod|Android/i.test(navigator.userAgent));
  }, []);

  useEffect(() => {
    if (!address || !contractInfo?.address || !chain?.id) return;

    const endpointType = ENDPOINT_TYPES[chain.id];
    if (!endpointType) return;

    const app = new SelfAppBuilder({
      appName: "Curyo",
      scope: "curyo-faucet",
      endpoint: contractInfo.address.toLowerCase(),
      endpointType,
      userId: address,
      userIdType: "hex",
      disclosures: {
        minimumAge: 18,
        ofac: true,
        excludedCountries: [],
        issuing_state: false,
        name: false,
        passport_number: false,
        nationality: false,
        date_of_birth: false,
        gender: false,
        expiry_date: false,
      },
    }).build();

    setSelfApp(app);
  }, [address, contractInfo?.address, chain?.id]);

  if (!chain?.id || !ENDPOINT_TYPES[chain.id]) {
    return (
      <div className="bg-error/10 border border-error/20 rounded-xl p-4 text-center">
        <p className="text-error font-medium">Unsupported network</p>
        <p className="text-base-content/60 text-base mt-1">
          Please switch to Celo or Celo Sepolia to verify your identity.
        </p>
      </div>
    );
  }

  if (!address) {
    return <div className="text-center text-base-content/60 py-4">Connect your wallet to verify your identity.</div>;
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
          href={`https://self.xyz/verify?app=${encodeURIComponent(JSON.stringify(selfApp))}`}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-curyo btn-lg inline-flex"
        >
          Open Self App
        </a>
        <p className="text-base text-base-content/60">Tap to open the Self app and verify your identity</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <SelfQRcodeWrapper
        selfApp={selfApp}
        websocketUrl={SELF_WEBSOCKET_URLS[chain.id]}
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
      <p className="text-base text-base-content/60 text-center">Scan this QR code with the Self app on your phone</p>
    </div>
  );
}
