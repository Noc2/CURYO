"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useAccount } from "wagmi";
import { DelegationSection } from "~~/components/profile/DelegationSection";
import { RainbowKitCustomConnectButton } from "~~/components/scaffold-eth";
import { NotificationSettingsPanel } from "~~/components/settings/NotificationSettingsPanel";
import { AppPageShell } from "~~/components/shared/AppPageShell";

type SettingsTab = "delegation" | "notifications";

const settingsTabs: SettingsTab[] = ["notifications", "delegation"];

const SETTINGS_TAB_LABELS: Record<SettingsTab, string> = {
  delegation: "Delegation",
  notifications: "Notifications",
};

function normalizeSettingsTab(value: string | null): SettingsTab {
  return settingsTabs.includes((value ?? "") as SettingsTab) ? (value as SettingsTab) : "notifications";
}

function SettingsPageInner() {
  const { isConnected, address } = useAccount();
  const router = useRouter();
  const pathname = usePathname() ?? "/settings";
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<SettingsTab>("notifications");

  useEffect(() => {
    const tabParam = searchParams?.get("tab") ?? null;
    setActiveTab(normalizeSettingsTab(tabParam));
  }, [searchParams]);

  const selectTab = useCallback(
    (tab: SettingsTab) => {
      setActiveTab(tab);
      const nextParams = new URLSearchParams(searchParams?.toString() ?? "");
      if (tab === "notifications") {
        nextParams.delete("tab");
      } else {
        nextParams.set("tab", tab);
      }

      const query = nextParams.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
        <p className="text-base-content/60 mb-6 text-center">Connect your wallet to manage your settings</p>
        <RainbowKitCustomConnectButton />
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
