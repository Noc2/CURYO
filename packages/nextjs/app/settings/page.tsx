"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useAccount } from "wagmi";
import { ReferralSection } from "~~/components/governance/ReferralSection";
import { DelegationSection } from "~~/components/profile/DelegationSection";
import { ProfileForm } from "~~/components/profile/ProfileForm";
import { RainbowKitCustomConnectButton } from "~~/components/scaffold-eth";
import { NotificationSettingsPanel } from "~~/components/settings/NotificationSettingsPanel";

type SettingsTab = "profile" | "delegation" | "referrals" | "notifications";

const settingsTabs: SettingsTab[] = ["profile", "delegation", "referrals", "notifications"];

const SETTINGS_TAB_LABELS: Record<SettingsTab, string> = {
  profile: "Profile",
  delegation: "Delegation",
  referrals: "Referrals",
  notifications: "Notifications",
};

function normalizeSettingsTab(value: string | null): SettingsTab {
  return settingsTabs.includes((value ?? "") as SettingsTab) ? (value as SettingsTab) : "profile";
}

function SettingsPageInner() {
  const { isConnected, address } = useAccount();
  const router = useRouter();
  const pathname = usePathname() ?? "/settings";
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<SettingsTab>("profile");

  useEffect(() => {
    const tabParam = searchParams?.get("tab") ?? null;
    setActiveTab(normalizeSettingsTab(tabParam));
  }, [searchParams]);

  const selectTab = useCallback(
    (tab: SettingsTab) => {
      setActiveTab(tab);
      const nextParams = new URLSearchParams(searchParams?.toString() ?? "");
      if (tab === "profile") {
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
    <div className="flex flex-col items-center grow px-4 pt-8 pb-12">
      <div className="w-full max-w-4xl space-y-6">
        <div className="flex flex-wrap gap-2">
          {settingsTabs.map(tab => (
            <button
              key={tab}
              onClick={() => selectTab(tab)}
              className={`px-4 py-1.5 rounded-full text-base font-medium transition-colors ${
                activeTab === tab ? "pill-active-yellow" : "bg-base-200 text-white hover:bg-base-300"
              }`}
            >
              {SETTINGS_TAB_LABELS[tab]}
            </button>
          ))}
        </div>

        {activeTab === "profile" && <ProfileForm />}
        {activeTab === "delegation" && <DelegationSection />}
        {activeTab === "referrals" && <ReferralSection />}
        {activeTab === "notifications" && <NotificationSettingsPanel address={address} />}
      </div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-[60vh]">Loading...</div>}>
      <SettingsPageInner />
    </Suspense>
  );
}
