"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ASK_AGENT_ROUTE_TAB,
  ASK_MANUAL_ROUTE_TAB,
  ASK_ROUTE_TAB_PARAM,
  type AskRouteTab,
  parseAskRouteTab,
} from "~~/constants/routes";

const ContentSubmissionSection = dynamic(
  () => import("~~/components/submit/ContentSubmissionSection").then(mod => mod.ContentSubmissionSection),
  {
    loading: () => <AskTabPanelLoading />,
  },
);
const AgentSubmissionPanel = dynamic(
  () => import("~~/components/submit/AgentSubmissionPanel").then(mod => mod.AgentSubmissionPanel),
  {
    loading: () => <AskTabPanelLoading />,
  },
);

function AskTabPanelLoading() {
  return (
    <div className="surface-card rounded-2xl p-6">
      <div className="flex items-center gap-3 text-base-content/50">
        <span className="loading loading-spinner loading-sm text-primary" />
        <span>Loading...</span>
      </div>
    </div>
  );
}

export function AskPageTabs() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedTab = parseAskRouteTab(searchParams?.get(ASK_ROUTE_TAB_PARAM));
  const [activeTab, setActiveTab] = useState<AskRouteTab>(requestedTab);

  useEffect(() => {
    setActiveTab(requestedTab);
  }, [requestedTab]);

  const handleSelectTab = (tab: AskRouteTab) => {
    setActiveTab(tab);

    const params = new URLSearchParams(searchParams?.toString());
    if (tab === ASK_MANUAL_ROUTE_TAB) {
      params.delete(ASK_ROUTE_TAB_PARAM);
    } else {
      params.set(ASK_ROUTE_TAB_PARAM, ASK_AGENT_ROUTE_TAB);
    }

    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => handleSelectTab(ASK_MANUAL_ROUTE_TAB)}
          className={`tab-control inline-flex items-center px-4 py-1.5 text-base font-medium transition-colors ${
            activeTab === ASK_MANUAL_ROUTE_TAB ? "pill-active" : "pill-inactive"
          }`}
        >
          <span>Manual</span>
        </button>
        <button
          type="button"
          onClick={() => handleSelectTab(ASK_AGENT_ROUTE_TAB)}
          className={`tab-control inline-flex items-center px-4 py-1.5 text-base font-medium transition-colors ${
            activeTab === ASK_AGENT_ROUTE_TAB ? "pill-active" : "pill-inactive"
          }`}
        >
          <span>Agent</span>
        </button>
      </div>

      {activeTab === ASK_MANUAL_ROUTE_TAB ? <ContentSubmissionSection /> : <AgentSubmissionPanel />}
    </div>
  );
}
