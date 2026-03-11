"use client";

import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

const SNAPSHOT_MAX_AGE_MS = 120_000;

export interface WalletDisplaySummary {
  liquidMicro: bigint;
  votingStakedMicro: bigint;
  submissionStakedMicro: bigint;
  frontendStakedMicro: bigint;
  totalStakedMicro: bigint;
  totalMicro: bigint;
  updatedAt: number;
}

interface WalletDisplaySummaryInput {
  liquidMicro: bigint;
  votingStakedMicro: bigint;
  submissionStakedMicro: bigint;
  frontendStakedMicro: bigint;
}

export function getWalletDisplaySummaryQueryKey(address: string) {
  return ["wallet-display-summary", address.toLowerCase()] as const;
}

function buildSnapshot(input: WalletDisplaySummaryInput): WalletDisplaySummary {
  const totalStakedMicro = input.votingStakedMicro + input.submissionStakedMicro + input.frontendStakedMicro;

  return {
    ...input,
    totalStakedMicro,
    totalMicro: input.liquidMicro + totalStakedMicro,
    updatedAt: Date.now(),
  };
}

function snapshotsEqual(a: WalletDisplaySummary, b: WalletDisplaySummary) {
  return (
    a.liquidMicro === b.liquidMicro &&
    a.votingStakedMicro === b.votingStakedMicro &&
    a.submissionStakedMicro === b.submissionStakedMicro &&
    a.frontendStakedMicro === b.frontendStakedMicro &&
    a.totalStakedMicro === b.totalStakedMicro &&
    a.totalMicro === b.totalMicro
  );
}

export function useWalletDisplaySummary(address: string | undefined, input: WalletDisplaySummaryInput | null) {
  const queryClient = useQueryClient();
  const normalizedAddress = address?.toLowerCase();

  const rawSnapshot = useMemo(() => {
    if (!normalizedAddress || !input) return null;
    return buildSnapshot(input);
  }, [normalizedAddress, input]);

  const queryKey = normalizedAddress ? getWalletDisplaySummaryQueryKey(normalizedAddress) : ["wallet-display-summary"];

  const { data } = useQuery({
    queryKey,
    queryFn: async () => rawSnapshot,
    enabled: Boolean(normalizedAddress && rawSnapshot),
    initialData: rawSnapshot ?? undefined,
    staleTime: Infinity,
    gcTime: 30 * 60 * 1000,
  });

  useEffect(() => {
    if (!normalizedAddress || !rawSnapshot) return;

    const current = queryClient.getQueryData<WalletDisplaySummary>(getWalletDisplaySummaryQueryKey(normalizedAddress));
    if (!current) {
      queryClient.setQueryData(getWalletDisplaySummaryQueryKey(normalizedAddress), rawSnapshot);
      return;
    }

    const snapshotExpired = Date.now() - current.updatedAt > SNAPSHOT_MAX_AGE_MS;
    const totalsMatch = current.totalMicro === rawSnapshot.totalMicro;

    if ((totalsMatch || snapshotExpired) && !snapshotsEqual(current, rawSnapshot)) {
      queryClient.setQueryData(getWalletDisplaySummaryQueryKey(normalizedAddress), rawSnapshot);
    }
  }, [normalizedAddress, queryClient, rawSnapshot]);

  return (data ?? rawSnapshot) as WalletDisplaySummary | null;
}
