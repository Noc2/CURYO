"use client";

import { Suspense } from "react";
import dynamic from "next/dynamic";
import type { NextPage } from "next";
import { useAccount } from "wagmi";
import { AppPageShell } from "~~/components/shared/AppPageShell";
import { ConnectWalletCard } from "~~/components/shared/ConnectWalletCard";

const AskPageTabs = dynamic(() => import("~~/components/submit/AskPageTabs").then(mod => mod.AskPageTabs), {
  loading: () => <AskSectionLoading />,
});

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
    return <ConnectWalletCard title="Submit" message="Sign in to submit a question." />;
  }

  return (
    <AppPageShell>
      <AskPageTabs />
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
