"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import styles from "./LandingPageActions.module.css";
import { useAccount } from "wagmi";
import { ChevronRightIcon } from "@heroicons/react/20/solid";
import { GOVERNANCE_ROUTE, RATE_ROUTE } from "~~/constants/routes";
import { useVoterIdNFT } from "~~/hooks/useVoterIdNFT";
import { shouldAutoRedirectFromLanding } from "~~/lib/home/landingRedirect";

export function LandingPageActions() {
  const { address, connector, isConnected } = useAccount();
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
    if (
      !shouldAutoRedirectFromLanding({
        address,
        connectorId: connector?.id,
        hasExplicitLandingOverride: explicitLandingVisitRef.current,
        isConnected,
        voterIdResolved,
      })
    ) {
      redirectedAddressRef.current = null;
      return;
    }

    if (!address) {
      redirectedAddressRef.current = null;
      return;
    }

    const addressKey = address.toLowerCase();
    if (redirectedAddressRef.current === addressKey) {
      return;
    }

    router.replace(hasVoterId ? RATE_ROUTE : GOVERNANCE_ROUTE);
    redirectedAddressRef.current = addressKey;
  }, [address, connector?.id, hasVoterId, isConnected, router, voterIdResolved]);

  return (
    <div className="mt-6 flex flex-wrap justify-center gap-3 lg:justify-start">
      <Link href={RATE_ROUTE} className={`btn btn-primary ${styles.cta} ${styles.primary}`}>
        <span>Start Earning</span>
        <span className={styles.arrow} aria-hidden="true">
          <ChevronRightIcon className="h-5 w-5 text-current" />
        </span>
      </Link>
      <Link href="/docs" className={`btn whitespace-nowrap ${styles.cta} ${styles.secondary}`}>
        <span>Learn More</span>
        <span className={styles.arrow} aria-hidden="true">
          <ChevronRightIcon className="h-5 w-5 text-current" />
        </span>
      </Link>
    </div>
  );
}
