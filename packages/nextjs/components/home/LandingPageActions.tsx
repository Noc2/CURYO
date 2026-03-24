"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import styles from "./LandingPageActions.module.css";
import { useAccount } from "wagmi";
import { ChevronRightIcon } from "@heroicons/react/20/solid";
import { useVoterIdNFT } from "~~/hooks/useVoterIdNFT";

export function LandingPageActions() {
  const { address, isConnected } = useAccount();
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectedAddressRef = useRef<string | null>(null);
  const explicitLandingVisitRef = useRef(false);
  const { hasVoterId, isResolved: voterIdResolved } = useVoterIdNFT(address);
  const showLanding = searchParams?.get("landing") === "1";

  useEffect(() => {
    if (!showLanding) {
      return;
    }

    explicitLandingVisitRef.current = true;
    redirectedAddressRef.current = null;

    const url = new URL(window.location.href);
    url.searchParams.delete("landing");
    const nextSearch = url.searchParams.toString();
    const cleanedUrl = `${url.pathname}${nextSearch ? `?${nextSearch}` : ""}${url.hash}`;
    window.history.replaceState(window.history.state, "", cleanedUrl);
  }, [showLanding]);

  useEffect(() => {
    if (explicitLandingVisitRef.current) {
      return;
    }

    if (!isConnected || !address) {
      redirectedAddressRef.current = null;
      return;
    }

    if (!voterIdResolved) {
      return;
    }

    const addressKey = address.toLowerCase();
    if (redirectedAddressRef.current === addressKey) {
      return;
    }

    router.replace(hasVoterId ? "/vote" : "/governance");
    redirectedAddressRef.current = addressKey;
  }, [address, hasVoterId, isConnected, router, voterIdResolved]);

  return (
    <div className="mt-6 flex flex-wrap justify-center gap-3 lg:justify-start">
      <Link href="/vote" className={`btn btn-primary ${styles.cta} ${styles.primary}`}>
        <span>Discover</span>
        <span className={styles.arrow} aria-hidden="true">
          <ChevronRightIcon className="h-5 w-5 text-primary-content" />
        </span>
      </Link>
      <Link href="/docs" className={`btn whitespace-nowrap ${styles.cta} ${styles.secondary}`}>
        <span>Learn More</span>
        <span className={styles.arrow} aria-hidden="true">
          <ChevronRightIcon className="h-5 w-5 text-primary-content" />
        </span>
      </Link>
    </div>
  );
}
