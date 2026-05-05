"use client";

import { usePathname } from "next/navigation";
import { useAccount } from "wagmi";
import { RewardNotifier } from "~~/components/RewardNotifier";
import { SettlementNotifier } from "~~/components/SettlementNotifier";
import { GOVERNANCE_ROUTE, RATE_ROUTE } from "~~/constants/routes";

const NOTIFIER_ROUTE_PREFIXES = [RATE_ROUTE, GOVERNANCE_ROUTE];

export function RouteScopedNotifiers() {
  const pathname = usePathname() ?? "";
  const { address } = useAccount();

  const shouldMount =
    Boolean(address) &&
    NOTIFIER_ROUTE_PREFIXES.some(prefix => pathname === prefix || pathname.startsWith(`${prefix}/`));

  if (!shouldMount) {
    return null;
  }

  return (
    <>
      <SettlementNotifier />
      <RewardNotifier />
    </>
  );
}
