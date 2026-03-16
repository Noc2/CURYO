"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { useScaffoldReadContract } from "~~/hooks/scaffold-eth";

export function LandingPageActions() {
  const { address, isConnected } = useAccount();
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
    <div className="mt-6 flex flex-wrap justify-center gap-3 lg:justify-start">
      <Link href="/vote" className="btn btn-primary rounded-full px-5" style={{ fontSize: "16px" }}>
        Discover
      </Link>
      <Link href="/docs" className="btn btn-shell-secondary rounded-full px-5" style={{ fontSize: "16px" }}>
        Learn More
      </Link>
    </div>
  );
}
