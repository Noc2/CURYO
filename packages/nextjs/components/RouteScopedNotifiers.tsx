"use client";

import { usePathname } from "next/navigation";
import { useAccount } from "wagmi";
import { RewardNotifier } from "~~/components/RewardNotifier";
import { SettlementNotifier } from "~~/components/SettlementNotifier";

const NOTIFIER_ROUTE_PREFIXES = ["/vote", "/governance"];

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
