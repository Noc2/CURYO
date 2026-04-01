"use client";

import { useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { defineChain } from "thirdweb";
import { useActiveWallet, useSetActiveWallet } from "thirdweb/react";
import { useAccount } from "wagmi";
import { useThirdwebWagmiSync } from "~~/hooks/useThirdwebWagmiSync";
import {
  createThirdwebInAppWallet,
  getThirdwebWalletSponsorshipMode,
  setStoredThirdwebSponsorshipMode,
  supportsThirdwebExecutionCapabilities,
  thirdwebClient,
} from "~~/services/thirdweb/client";
import { notification } from "~~/utils/scaffold-eth";

export const FREE_TRANSACTION_ALLOWANCE_QUERY_KEY = ["free-transactions"] as const;

type FreeTransactionAllowanceResponse = {
  chainId: number;
  environment: string;
  limit: number;
  used: number;
  remaining: number;
  verified: boolean;
  exhausted: boolean;
  walletAddress: `0x${string}` | null;
  voterIdTokenId: string | null;
};

function buildFreeTransactionAllowanceSnapshotKey(address?: string, chainId?: number) {
  if (!address || typeof chainId !== "number") {
    return null;
  }

  return `curyo-free-transactions-summary:${address.toLowerCase()}:${chainId}`;
}

function readStoredFreeTransactionAllowanceSummary(address?: string, chainId?: number) {
  if (typeof window === "undefined") {
    return null;
  }

  const storageKey = buildFreeTransactionAllowanceSnapshotKey(address, chainId);
  if (!storageKey) {
    return null;
  }

  try {
    const rawValue = window.sessionStorage.getItem(storageKey);
    if (!rawValue) {
      return null;
    }

    return JSON.parse(rawValue) as FreeTransactionAllowanceResponse;
  } catch {
    return null;
  }
}

function storeFreeTransactionAllowanceSummary(
  summary: FreeTransactionAllowanceResponse,
  address?: string,
  chainId?: number,
) {
  if (typeof window === "undefined") {
    return;
  }

  const storageKey = buildFreeTransactionAllowanceSnapshotKey(address, chainId);
  if (!storageKey) {
    return;
  }

  try {
    window.sessionStorage.setItem(storageKey, JSON.stringify(summary));
  } catch {
    // Ignore storage failures.
  }
}

function buildExhaustionToastKey(params: { chainId: number; voterIdTokenId: string }) {
  return `curyo-free-transactions-exhausted:${params.chainId}:${params.voterIdTokenId}`;
}

function hasShownExhaustionToast(params: { chainId: number; voterIdTokenId: string }) {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    return window.sessionStorage.getItem(buildExhaustionToastKey(params)) === "1";
  } catch {
    return false;
  }
}

function markExhaustionToastShown(params: { chainId: number; voterIdTokenId: string }) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.setItem(buildExhaustionToastKey(params), "1");
  } catch {
    // Ignore storage errors.
  }
}

export function getFreeTransactionAllowanceQueryKey(address?: string, chainId?: number) {
  return [...FREE_TRANSACTION_ALLOWANCE_QUERY_KEY, address?.toLowerCase() ?? null, chainId ?? null] as const;
}

export function useFreeTransactionAllowance() {
  const { address, chain } = useAccount();
  const activeWallet = useActiveWallet();
  const setActiveWallet = useSetActiveWallet();
  const { syncWalletToWagmi } = useThirdwebWagmiSync();
  const previousRemainingRef = useRef<number | null>(null);
  const sponsorshipSyncAttemptRef = useRef<string | null>(null);

  const query = useQuery({
    queryKey: getFreeTransactionAllowanceQueryKey(address, chain?.id),
    queryFn: async () => {
      const response = await fetch(`/api/transactions/free/session?address=${address}&chainId=${chain?.id}`);
      const body = (await response.json().catch(() => null)) as
        | FreeTransactionAllowanceResponse
        | { error?: string }
        | null;

      if (!response.ok) {
        throw new Error((body as { error?: string } | null)?.error || "Failed to load free transaction summary");
      }

      return body as FreeTransactionAllowanceResponse;
    },
    enabled: Boolean(address) && typeof chain?.id === "number",
    staleTime: 30_000,
    retry: false,
  });

  const fallbackSummary = useMemo(
    () => (query.data ? null : readStoredFreeTransactionAllowanceSummary(address, chain?.id)),
    [address, chain?.id, query.data],
  );

  useEffect(() => {
    if (!query.data) {
      return;
    }

    storeFreeTransactionAllowanceSummary(query.data, address, chain?.id);
  }, [address, chain?.id, query.data]);

  const allowance = useMemo(() => {
    const summary = query.data ?? fallbackSummary;
    const canUseFreeTransactions = Boolean(summary?.verified && summary.remaining > 0);

    return {
      ...query,
      isResolved: query.isFetched || query.isError || Boolean(summary),
      canUseFreeTransactions,
      exhausted: Boolean(summary?.verified && summary.remaining === 0),
      limit: summary?.limit ?? 0,
      remaining: summary?.remaining ?? 0,
      used: summary?.used ?? 0,
      verified: Boolean(summary?.verified),
      voterIdTokenId: summary?.voterIdTokenId ?? null,
    };
  }, [fallbackSummary, query]);

  const desiredSponsorshipMode = useMemo(() => {
    if (!chain?.id || !supportsThirdwebExecutionCapabilities(chain.id) || !allowance.isResolved) {
      return null;
    }

    return allowance.canUseFreeTransactions ? "sponsored" : "self-funded";
  }, [allowance.canUseFreeTransactions, allowance.isResolved, chain?.id]);

  useEffect(() => {
    if (!chain?.id || !supportsThirdwebExecutionCapabilities(chain.id)) {
      setStoredThirdwebSponsorshipMode(null);
      return;
    }

    if (!desiredSponsorshipMode) {
      return;
    }

    setStoredThirdwebSponsorshipMode(desiredSponsorshipMode);
  }, [chain?.id, desiredSponsorshipMode]);

  useEffect(() => {
    if (
      !thirdwebClient ||
      !address ||
      !chain?.id ||
      !desiredSponsorshipMode ||
      !activeWallet ||
      activeWallet.id !== "inApp"
    ) {
      return;
    }

    const currentMode = getThirdwebWalletSponsorshipMode(activeWallet);
    if (currentMode === desiredSponsorshipMode) {
      sponsorshipSyncAttemptRef.current = null;
      return;
    }

    const attemptKey = `${address.toLowerCase()}:${chain.id}:${desiredSponsorshipMode}`;
    if (sponsorshipSyncAttemptRef.current === attemptKey) {
      return;
    }

    sponsorshipSyncAttemptRef.current = attemptKey;

    void (async () => {
      try {
        const replacementWallet = createThirdwebInAppWallet(chain.id, {
          sponsorshipMode: desiredSponsorshipMode,
        });

        await replacementWallet.autoConnect({
          chain: defineChain(chain.id),
          client: thirdwebClient,
        });
        await syncWalletToWagmi(replacementWallet, chain.id, { reconnect: true });
        await setActiveWallet(replacementWallet);
      } catch (error) {
        console.error("Failed to sync thirdweb sponsorship mode:", error);
      }
    })();
  }, [activeWallet, address, chain?.id, desiredSponsorshipMode, setActiveWallet, syncWalletToWagmi]);

  useEffect(() => {
    if (!allowance.verified || !chain?.id || !allowance.voterIdTokenId) {
      previousRemainingRef.current = allowance.remaining;
      return;
    }

    const previousRemaining = previousRemainingRef.current;
    previousRemainingRef.current = allowance.remaining;

    if (previousRemaining === null || previousRemaining <= 0 || allowance.remaining > 0) {
      return;
    }

    const toastKey = {
      chainId: chain.id,
      voterIdTokenId: allowance.voterIdTokenId,
    };

    if (hasShownExhaustionToast(toastKey)) {
      return;
    }

    markExhaustionToastShown(toastKey);
    notification.warning("Free transactions used up. Add CELO to continue.");
  }, [allowance.remaining, allowance.verified, allowance.voterIdTokenId, chain?.id]);

  return allowance;
}
