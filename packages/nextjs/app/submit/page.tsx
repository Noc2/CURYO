"use client";

import { Suspense } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import type { NextPage } from "next";
import { useAccount } from "wagmi";
import { IdentificationIcon } from "@heroicons/react/24/outline";
import { AppPageShell } from "~~/components/shared/AppPageShell";
import { ConnectWalletCard } from "~~/components/shared/ConnectWalletCard";
import { surfaceSectionHeadingClassName } from "~~/components/shared/sectionHeading";
import { useVoterIdNFT } from "~~/hooks/useVoterIdNFT";

const ContentSubmissionSection = dynamic(
  () => import("~~/components/submit/ContentSubmissionSection").then(mod => mod.ContentSubmissionSection),
  { loading: () => <SubmitSectionLoading /> },
);

function SubmitSectionLoading() {
  return (
    <div className="surface-card rounded-2xl p-6">
      <div className="flex items-center gap-3 text-base-content/50">
        <span className="loading loading-spinner loading-sm text-primary" />
        <span>Loading...</span>
      </div>
    </div>
  );
}

const SubmitPage: NextPage = () => {
  const { address } = useAccount();
  const { hasVoterId, isResolved: voterIdResolved } = useVoterIdNFT(address);

  if (!address) {
    return <ConnectWalletCard title="Submit" message="Sign in to submit a question." />;
  }

  if (!voterIdResolved) {
    return (
      <div className="flex flex-col items-center justify-center grow px-6 pt-20">
        <div className="surface-card rounded-2xl p-8 text-center max-w-sm">
          <span className="loading loading-spinner loading-lg"></span>
          <p className="text-base-content/50 mt-4">Loading verification status...</p>
        </div>
      </div>
    );
  }

  if (!hasVoterId) {
    return (
      <div className="flex flex-col items-center justify-center grow px-6 pt-20">
        <div className="surface-card rounded-2xl p-8 text-center max-w-md space-y-4">
          <IdentificationIcon className="w-12 h-12 text-warning mx-auto" />
          <h1 className={surfaceSectionHeadingClassName}>Voter ID Required</h1>
          <p className="text-base-content/60">
            You need a Voter ID to submit a question. Verify your identity with Self.xyz to receive your Voter ID.
          </p>
          <Link href="/governance" className="btn btn-submit">
            <IdentificationIcon className="w-5 h-5" />
            Get Voter ID
          </Link>
        </div>
      </div>
    );
  }

  return (
    <AppPageShell>
      <ContentSubmissionSection />
    </AppPageShell>
  );
};

// Wrap in Suspense for useSearchParams
const SubmitPageWrapper: NextPage = () => {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center items-center min-h-[60vh]">
          <span className="loading loading-spinner loading-lg"></span>
        </div>
      }
    >
      <SubmitPage />
    </Suspense>
  );
};

export default SubmitPageWrapper;
