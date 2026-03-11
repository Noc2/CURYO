"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { isAddress } from "viem";
import { PublicProfileView } from "~~/components/profile/PublicProfileView";

export default function PublicProfilePage() {
  const params = useParams();
  const rawAddress = params?.address;
  const address = Array.isArray(rawAddress) ? rawAddress[0] : rawAddress;

  if (!address || !isAddress(address)) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
        <p className="text-base-content/60">Invalid profile address.</p>
        <Link
          href="/governance"
          className="mt-4 rounded-full bg-base-200 px-4 py-2 text-base font-medium text-white transition-colors hover:bg-base-300"
        >
          Back to governance
        </Link>
      </div>
    );
  }

  return <PublicProfileView address={address.toLowerCase() as `0x${string}`} />;
}
