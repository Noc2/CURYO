"use client";

import { useAccount } from "wagmi";
import { NotificationSettingsPanel } from "~~/components/settings/NotificationSettingsPanel";

export default function NotificationSettingsPage() {
  const { address } = useAccount();

  return (
    <div className="flex flex-col items-center grow px-4 pt-8 pb-12">
      <div className="w-full max-w-4xl">
        <NotificationSettingsPanel address={address} />
      </div>
    </div>
  );
}
