"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { captureReferralAttributionFromSearchParams } from "~~/lib/referrals/referralAttribution";

export function ReferralAttributionCapture() {
  const searchParams = useSearchParams();

  useEffect(() => {
    captureReferralAttributionFromSearchParams(searchParams);
  }, [searchParams]);

  return null;
}
