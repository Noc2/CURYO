"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
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
const CategorySubmissionForm = dynamic(
  () => import("~~/components/governance/CategorySubmissionForm").then(mod => mod.CategorySubmissionForm),
  { loading: () => <SubmitSectionLoading /> },
);
const FrontendRegistration = dynamic(
  () => import("~~/components/governance/FrontendRegistration").then(mod => mod.FrontendRegistration),
  { loading: () => <SubmitSectionLoading /> },
);

type SubmissionType = "content" | "category" | "frontend";

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
  const [submissionType, setSubmissionType] = useState<SubmissionType>("content");
  const requiresPageLevelVoterId = submissionType !== "frontend";

  const selectTab = useCallback((tab: SubmissionType) => {
    setSubmissionType(tab);
    const hash = tab === "content" ? "" : `#${tab}`;
    history.replaceState(null, "", hash || window.location.pathname + window.location.search);
  }, []);

  useEffect(() => {
    const applyHash = () => {
      const hash = window.location.hash.replace(/^#/, "") as SubmissionType;
      if (hash && ["content", "category", "frontend"].includes(hash)) {
        setSubmissionType(hash);
      }
    };
    applyHash();
    window.addEventListener("hashchange", applyHash);
    return () => window.removeEventListener("hashchange", applyHash);
  }, []);

  if (!address) {
    return (
      <ConnectWalletCard title="Submit" message="Connect your wallet to submit content or propose new categories." />
    );
  }

  if (requiresPageLevelVoterId && !voterIdResolved) {
    return (
      <div className="flex flex-col items-center justify-center grow px-6 pt-20">
        <div className="surface-card rounded-2xl p-8 text-center max-w-sm">
          <span className="loading loading-spinner loading-lg"></span>
          <p className="text-base-content/50 mt-4">Loading verification status...</p>
        </div>
      </div>
    );
  }

  if (requiresPageLevelVoterId && !hasVoterId) {
    return (
      <div className="flex flex-col items-center justify-center grow px-6 pt-20">
        <div className="surface-card rounded-2xl p-8 text-center max-w-md space-y-4">
          <IdentificationIcon className="w-12 h-12 text-warning mx-auto" />
          <h1 className={surfaceSectionHeadingClassName}>Voter ID Required</h1>
          <p className="text-base-content/60">
            You need a Voter ID to submit content, propose platforms, or register as a frontend operator. Verify your
            identity with Self.xyz to receive your Voter ID.
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
      <div className="mb-6 flex flex-wrap gap-2">
        <button
          onClick={() => selectTab("content")}
          className={`px-4 py-1.5 rounded-full text-base font-medium transition-colors ${
            submissionType === "content" ? "pill-active" : "pill-inactive"
          }`}
        >
          Content
        </button>
        <button
          onClick={() => selectTab("category")}
          className={`px-4 py-1.5 rounded-full text-base font-medium transition-colors ${
            submissionType === "category" ? "pill-active" : "pill-inactive"
          }`}
        >
          Platform
        </button>
        <button
          onClick={() => selectTab("frontend")}
          className={`px-4 py-1.5 rounded-full text-base font-medium transition-colors ${
            submissionType === "frontend" ? "pill-active" : "pill-inactive"
          }`}
        >
          Frontend
        </button>
      </div>

      {submissionType === "content" ? (
        <ContentSubmissionSection />
      ) : submissionType === "category" ? (
        <CategorySubmissionForm />
      ) : (
        <FrontendRegistration />
      )}
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
