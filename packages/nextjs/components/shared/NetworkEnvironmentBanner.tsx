"use client";

import { useEffect, useMemo, useState } from "react";
import { hardhat } from "viem/chains";
import { BeakerIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { useTargetNetwork } from "~~/hooks/scaffold-eth/useTargetNetwork";

const BANNER_VERSION = "v1";

function getBannerMessage(networkName: string, isLocalNetwork: boolean) {
  if (isLocalNetwork) {
    return "Curyo is connected to a local dev chain. Tokens, reputation, votes, and rewards here are for testing only.";
  }

  return `Curyo is currently running on ${networkName}, not mainnet. Tokens, reputation, votes, and rewards here are for testing only.`;
}

export function NetworkEnvironmentBanner() {
  const { targetNetwork } = useTargetNetwork();
  const isLocalNetwork = targetNetwork.id === hardhat.id;
  const isTestNetwork = Boolean(targetNetwork.testnet) || isLocalNetwork;
  const storageKey = useMemo(() => `curyo-network-banner:${BANNER_VERSION}:${targetNetwork.id}`, [targetNetwork.id]);
  const [isDismissed, setIsDismissed] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    if (!isTestNetwork) {
      setIsDismissed(false);
      setIsHydrated(true);
      return;
    }

    try {
      setIsDismissed(window.localStorage.getItem(storageKey) === "1");
    } catch {
      setIsDismissed(false);
    }

    setIsHydrated(true);
  }, [isTestNetwork, storageKey]);

  const dismissBanner = () => {
    setIsDismissed(true);

    try {
      window.localStorage.setItem(storageKey, "1");
    } catch {
      // Ignore storage failures and still dismiss for this session.
    }
  };

  if (!isHydrated || !isTestNetwork || isDismissed) {
    return null;
  }

  return (
    <div className="border-b border-warning/20 bg-warning/10 px-4 py-3 sm:px-6">
      <div className="mx-auto flex w-full max-w-5xl items-start gap-3">
        <div className="mt-0.5 rounded-full bg-warning/15 p-2 text-warning">
          <BeakerIcon className="h-5 w-5" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-warning/15 px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-warning">
              {isLocalNetwork ? "Local Preview" : "Testnet Preview"}
            </span>
            <p className="text-sm font-semibold text-base-content">Not live yet</p>
          </div>

          <p className="mt-1 text-sm text-base-content/70">{getBannerMessage(targetNetwork.name, isLocalNetwork)}</p>
        </div>

        <button
          type="button"
          onClick={dismissBanner}
          className="btn btn-ghost btn-sm btn-square text-base-content/50 hover:text-base-content"
          aria-label="Dismiss network notice"
        >
          <XMarkIcon className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
