"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { ChevronRightIcon } from "@heroicons/react/20/solid";
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
      <Link href="/vote" className="btn btn-primary landing-cta landing-cta--primary">
        <span>Discover</span>
        <span className="landing-cta__arrow" aria-hidden="true">
          <ChevronRightIcon className="h-5 w-5 text-primary-content" />
        </span>
      </Link>
      <Link href="/docs" className="btn landing-cta landing-cta--secondary whitespace-nowrap">
        <span>Learn More</span>
        <span className="landing-cta__arrow" aria-hidden="true">
          <ChevronRightIcon className="h-5 w-5 text-primary-content" />
        </span>
      </Link>
    </div>
  );
}
