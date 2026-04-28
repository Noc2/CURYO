"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AgentSubmissionPanel } from "~~/components/submit/AgentSubmissionPanel";
import { ContentSubmissionSection } from "~~/components/submit/ContentSubmissionSection";
import {
  ASK_AGENT_ROUTE_TAB,
  ASK_MANUAL_ROUTE_TAB,
  ASK_ROUTE_TAB_PARAM,
  type AskRouteTab,
  parseAskRouteTab,
} from "~~/constants/routes";

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
