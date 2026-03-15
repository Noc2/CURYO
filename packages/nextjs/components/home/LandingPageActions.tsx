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
    <div className="mt-7 flex flex-wrap justify-center gap-3 lg:justify-start">
      {!isConnected && (
        <button
          className="btn btn-primary rounded-full px-5 text-black"
          onClick={openConnectModal}
          type="button"
          style={{ fontSize: "16px" }}
        >
          Connect Wallet
        </button>
      )}
      <Link
        href="/docs"
        className="btn rounded-full border border-white/10 bg-white/[0.04] text-white hover:bg-white/[0.08]"
        style={{ fontSize: "16px" }}
      >
        Read the Docs
      </Link>
    </div>
  );
}
