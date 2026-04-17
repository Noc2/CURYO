"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { usePathname, useSearchParams } from "next/navigation";
import { useAccount } from "wagmi";
import { DelegationSection } from "~~/components/profile/DelegationSection";
import { CuryoConnectButton } from "~~/components/scaffold-eth";
import { NotificationSettingsPanel } from "~~/components/settings/NotificationSettingsPanel";
import { AppPageShell } from "~~/components/shared/AppPageShell";
import { SETTINGS_FRONTEND_HASH, SETTINGS_ROUTE } from "~~/constants/routes";

type SettingsTab = "delegation" | "notifications" | typeof SETTINGS_FRONTEND_HASH;

const settingsTabs: SettingsTab[] = ["notifications", "delegation", SETTINGS_FRONTEND_HASH];

const SETTINGS_TAB_LABELS: Record<SettingsTab, string> = {
  delegation: "Delegation",
  frontend: "Frontend",
  notifications: "Notifications",
};

function SettingsSectionLoading() {
  return (
    <div className="surface-card rounded-2xl p-6">
      <div className="flex items-center gap-3 text-base-content/50">
        <span className="loading loading-spinner loading-sm text-primary" />
        <span>Loading...</span>
      </div>
    </div>
  );
}

const FrontendRegistration = dynamic(
  () => import("~~/components/governance/FrontendRegistration").then(mod => mod.FrontendRegistration),
  { loading: SettingsSectionLoading },
);

function parseSettingsTab(value: string | null): SettingsTab | null {
  return settingsTabs.includes((value ?? "") as SettingsTab) ? (value as SettingsTab) : null;
}

function getSettingsHash(tab: SettingsTab) {
  return tab === "notifications" ? "" : `#${tab}`;
}

function buildSettingsTabUrl(pathname: string, searchParams: URLSearchParams, tab: SettingsTab) {
  const nextParams = new URLSearchParams(searchParams.toString());
  nextParams.delete("tab");

  const query = nextParams.toString();
  const hash = getSettingsHash(tab);
  return `${pathname}${query ? `?${query}` : ""}${hash}`;
}

function SettingsPageInner() {
  const { isConnected, address } = useAccount();
  const pathname = usePathname() ?? SETTINGS_ROUTE;
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<SettingsTab>("notifications");

  useEffect(() => {
    const syncTabFromLocation = () => {
      const params = new URLSearchParams(searchParams?.toString() ?? "");
      const hashTab = parseSettingsTab(window.location.hash.replace(/^#/, ""));
      const queryTab = parseSettingsTab(params.get("tab"));
      const nextTab = hashTab ?? queryTab ?? "notifications";

      setActiveTab(nextTab);

      const nextUrl = buildSettingsTabUrl(window.location.pathname, params, nextTab);
      const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      if (currentUrl !== nextUrl) {
        history.replaceState(null, "", nextUrl);
      }
    };

    syncTabFromLocation();
    window.addEventListener("hashchange", syncTabFromLocation);
    return () => window.removeEventListener("hashchange", syncTabFromLocation);
  }, [searchParams]);

  const selectTab = useCallback(
    (tab: SettingsTab) => {
      setActiveTab(tab);
      const params = new URLSearchParams(searchParams?.toString() ?? "");
      history.replaceState(null, "", buildSettingsTabUrl(pathname, params, tab));
    },
    [pathname, searchParams],
  );

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
        <p className="text-base-content/60 mb-6 text-center">Sign in to manage your settings</p>
        <CuryoConnectButton />
      </div>
    );
  }

  return (
    <AppPageShell contentClassName="space-y-6">
      <div className="flex flex-wrap gap-2">
        {settingsTabs.map(tab => (
          <button
            key={tab}
            onClick={() => selectTab(tab)}
            className={`px-4 py-1.5 rounded-full text-base font-medium transition-colors ${
              activeTab === tab ? "pill-active" : "pill-inactive"
            }`}
          >
            {SETTINGS_TAB_LABELS[tab]}
          </button>
        ))}
      </div>

      {activeTab === "delegation" && <DelegationSection />}
      {activeTab === SETTINGS_FRONTEND_HASH && <FrontendRegistration />}
      {activeTab === "notifications" && <NotificationSettingsPanel address={address} />}
    </AppPageShell>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-[60vh]">Loading...</div>}>
      <SettingsPageInner />
    </Suspense>
  );
}
