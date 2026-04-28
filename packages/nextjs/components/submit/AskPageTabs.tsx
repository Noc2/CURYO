"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AgentSubmissionPanel } from "~~/components/submit/AgentSubmissionPanel";
import { ContentSubmissionSection } from "~~/components/submit/ContentSubmissionSection";
import { ASK_ROUTE_TAB_PARAM, type AskRouteTab, parseAskRouteTab } from "~~/constants/routes";

export function AskPageTabs() {
  const searchParams = useSearchParams();
  const requestedTab = parseAskRouteTab(searchParams?.get(ASK_ROUTE_TAB_PARAM));
  const [activeTab, setActiveTab] = useState<AskRouteTab>(requestedTab);

  useEffect(() => {
    setActiveTab(requestedTab);
  }, [requestedTab]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setActiveTab("manual")}
          className={`tab-control inline-flex items-center px-4 py-1.5 text-base font-medium transition-colors ${
            activeTab === "manual" ? "pill-active" : "pill-inactive"
          }`}
        >
          <span>Manual</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("agent")}
          className={`tab-control inline-flex items-center px-4 py-1.5 text-base font-medium transition-colors ${
            activeTab === "agent" ? "pill-active" : "pill-inactive"
          }`}
        >
          <span>Agent</span>
        </button>
      </div>

      {activeTab === "manual" ? <ContentSubmissionSection /> : <AgentSubmissionPanel />}
    </div>
  );
}
