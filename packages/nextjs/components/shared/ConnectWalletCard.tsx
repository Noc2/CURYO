"use client";

import Link from "next/link";
import { CuryoConnectButton } from "~~/components/scaffold-eth";
import { surfaceSectionHeadingClassName } from "~~/components/shared/sectionHeading";
import { DOCS_AI_ROUTE } from "~~/constants/routes";

type ConnectWalletCardProps = {
  title: string;
  message: string;
};

export function ConnectWalletCard({ title, message }: ConnectWalletCardProps) {
  return (
    <div className="flex grow flex-col items-center justify-center px-6 pt-20">
      <div className="surface-card max-w-md rounded-2xl p-8 text-center">
        <h1 className={`${surfaceSectionHeadingClassName} mb-3`}>{title}</h1>
        <p className="mb-6 text-base text-base-content/70">{message}</p>
        <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
          <CuryoConnectButton />
          <Link href={DOCS_AI_ROUTE} className="btn btn-outline btn-sm">
            For Agents
          </Link>
        </div>
      </div>
    </div>
  );
}
