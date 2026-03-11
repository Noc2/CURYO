"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { useAccount } from "wagmi";
import { useScaffoldReadContract } from "~~/hooks/scaffold-eth";

export function LandingPageActions() {
  const { address, isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const router = useRouter();
  const wasConnected = useRef(isConnected);

  const { data: crepBalance } = useScaffoldReadContract({
    contractName: "CuryoReputation",
    functionName: "balanceOf",
    args: [address],
    watch: false,
    query: { enabled: !!address, staleTime: 30_000 },
  });

  useEffect(() => {
    if (isConnected && !wasConnected.current) {
      const hasBalance = crepBalance && crepBalance > 0n;
      router.push(hasBalance ? "/vote" : "/governance");
    }
    wasConnected.current = isConnected;
  }, [crepBalance, isConnected, router]);

  return (
    <div className="flex gap-3 mt-6">
      {!isConnected && (
        <button
          className="btn bg-white text-black hover:bg-gray-200 border-none"
          onClick={openConnectModal}
          type="button"
          style={{ fontSize: "16px" }}
        >
          Connect Wallet
        </button>
      )}
      <Link
        href="/docs"
        className="btn bg-gray-800 text-white hover:bg-gray-700 border-none"
        style={{ fontSize: "16px" }}
      >
        Learn More
      </Link>
    </div>
  );
}
