"use client";

import { Suspense } from "react";
import dynamic from "next/dynamic";
import type { NextPage } from "next";
import { useAccount } from "wagmi";
import { AppPageShell } from "~~/components/shared/AppPageShell";
import { ConnectWalletCard } from "~~/components/shared/ConnectWalletCard";

const ContentSubmissionSection = dynamic(
  () => import("~~/components/submit/ContentSubmissionSection").then(mod => mod.ContentSubmissionSection),
  { loading: () => <AskSectionLoading /> },
);

function AskSectionLoading() {
  return (
    <div className="surface-card rounded-2xl p-6">
      <div className="flex items-center gap-3 text-base-content/50">
        <span className="loading loading-spinner loading-sm text-primary" />
        <span>Loading...</span>
      </div>
    </div>
  );
}

const AskPage: NextPage = () => {
  const { address } = useAccount();

  if (!address) {
    return <ConnectWalletCard title="Ask" message="Sign in to ask a question." />;
  }

  return (
    <AppPageShell>
      <ContentSubmissionSection />
    </AppPageShell>
  );
};

const AskPageWrapper: NextPage = () => {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center items-center min-h-[60vh]">
          <span className="loading loading-spinner loading-lg"></span>
        </div>
      }
    >
      <AskPage />
    </Suspense>
  );
};

export default AskPageWrapper;
