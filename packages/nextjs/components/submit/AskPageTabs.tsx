"use client";

import { useState } from "react";
import { AgentSubmissionPanel } from "~~/components/submit/AgentSubmissionPanel";
import { ContentSubmissionSection } from "~~/components/submit/ContentSubmissionSection";

type AskTab = "manual" | "agent";

export function AskPageTabs() {
  const [activeTab, setActiveTab] = useState<AskTab>("manual");

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
