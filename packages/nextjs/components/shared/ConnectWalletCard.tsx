"use client";

import { CuryoConnectButton } from "~~/components/scaffold-eth";
import { surfaceSectionHeadingClassName } from "~~/components/shared/sectionHeading";

type ConnectWalletCardProps = {
  title: string;
  message: string;
};

export function ConnectWalletCard({ title, message }: ConnectWalletCardProps) {
  return (
    <div className="flex grow flex-col items-center justify-center px-6 pt-20">
      <div className="surface-card max-w-sm rounded-2xl p-8 text-center">
        <h1 className={`${surfaceSectionHeadingClassName} mb-3`}>{title}</h1>
        <p className="mb-6 text-base text-base-content/50">{message}</p>
        <CuryoConnectButton />
      </div>
    </div>
  );
}
