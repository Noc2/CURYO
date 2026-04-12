"use client";

import { useCallback, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { defineChain, prepareTransaction } from "thirdweb";
import { useActiveWallet, useActiveWalletChain, useSetActiveWallet } from "thirdweb/react";
import { sendAndConfirmCalls } from "thirdweb/wallets/eip5792";
import { type Abi, type Hex, encodeFunctionData } from "viem";
import { useAccount } from "wagmi";
import {
  FREE_TRANSACTION_ALLOWANCE_QUERY_KEY,
  useFreeTransactionAllowance,
} from "~~/hooks/useFreeTransactionAllowance";
import { useThirdwebWagmiSync } from "~~/hooks/useThirdwebWagmiSync";
import { useTransactionStatusToast } from "~~/hooks/useTransactionStatusToast";
import {
  type WalletExecutionMode,
  resolveWalletExecutionChainId,
  useWalletExecutionCapabilities,
} from "~~/hooks/useWalletExecutionCapabilities";
import { buildFreeTransactionOperationKey } from "~~/lib/thirdweb/freeTransactionOperation";
import { isFreeTransactionExhaustedError } from "~~/lib/transactionErrors";
import {
  createThirdwebInAppWallet,
  supportsThirdwebExecutionCapabilities,
  thirdwebClient,
} from "~~/services/thirdweb/client";

type SponsoredSubmitContractCall = {
  abi: Abi;
  address: `0x${string}`;
  functionName: string;
  args?: readonly unknown[];
  value?: bigint;
};

type ExecuteSponsoredCallsOptions = {
  atomicRequired?: boolean;
  action?: string;
  suppressStatusToast?: boolean;
};

export function shouldPreferSponsoredSubmitCalls(params: {
  canUseFreeTransactions: boolean;
  chainId: number | undefined;
  connectorId: string | undefined;
  isThirdwebInApp?: boolean;
}) {
  return params.canUseFreeTransactions && shouldExpectSponsoredSubmitCalls(params);
}

export function shouldExpectSponsoredSubmitCalls(params: {
  chainId: number | undefined;
  connectorId: string | undefined;
  isThirdwebInApp?: boolean;
}) {
  return (
    (params.connectorId === "in-app-wallet" || params.isThirdwebInApp === true) &&
    typeof params.chainId === "number" &&
    supportsThirdwebExecutionCapabilities(params.chainId)
  );
}

export function isThirdwebSponsorshipDeniedError(error: unknown) {
  const message =
    (error as { message?: string; shortMessage?: string } | undefined)?.message ??
    (error as { message?: string; shortMessage?: string } | undefined)?.shortMessage ??
    "";

  return message.toLowerCase().includes("transaction not sponsored") || isFreeTransactionExhaustedError(error);
}

export function isThirdwebSelfFundedFallbackEligibleError(error: unknown) {
  return isThirdwebSponsorshipDeniedError(error) || isFreeTransactionExhaustedError(error);
}

export function shouldAttemptSelfFundedThirdwebFallback(params: {
  activeWalletId: string | undefined;
  chainId: number | undefined;
  error: unknown;
  executionMode: WalletExecutionMode;
  hasReservedFreeTransaction: boolean;
}) {
  return (
    params.activeWalletId === "inApp" &&
    params.executionMode === "sponsored_7702" &&
    typeof params.chainId === "number" &&
    !params.hasReservedFreeTransaction &&
    isThirdwebSelfFundedFallbackEligibleError(params.error)
  );
}

export function shouldAwaitSelfFundedSubmitCalls(params: {
  canUseFreeTransactions: boolean;
  chainId: number | undefined;
  connectorId: string | undefined;
  executionMode: WalletExecutionMode;
  freeTransactionAllowanceResolved: boolean;
  isThirdwebInApp?: boolean;
}) {
  return (
    shouldExpectSponsoredSubmitCalls(params) &&
    params.freeTransactionAllowanceResolved &&
    !params.canUseFreeTransactions &&
    params.executionMode !== "self_funded_7702"
  );
}

export function shouldIgnorePostTransactionFallbackWalletSyncError(callStatus: string | undefined) {
  return callStatus === "success";
}

export function useThirdwebSponsoredSubmitCalls() {
  const queryClient = useQueryClient();
  const activeWallet = useActiveWallet();
  const activeWalletChain = useActiveWalletChain();
  const setActiveWallet = useSetActiveWallet();
  const { syncWalletToWagmi } = useThirdwebWagmiSync();
  const statusToast = useTransactionStatusToast();
  const { address, chainId: wagmiChainId, connector } = useAccount();
  const freeTransactionAllowance = useFreeTransactionAllowance();
  const { executionMode, hasSendCalls, isThirdwebInApp } = useWalletExecutionCapabilities();
  const chainId = resolveWalletExecutionChainId(wagmiChainId, activeWalletChain?.id);

  const expectsSponsoredSubmitCalls = useMemo(
    () =>
      shouldExpectSponsoredSubmitCalls({
        chainId,
        connectorId: connector?.id,
        isThirdwebInApp,
      }),
    [chainId, connector?.id, isThirdwebInApp],
  );

  const prefersSponsoredSubmitCalls = useMemo(
    () =>
      shouldPreferSponsoredSubmitCalls({
        canUseFreeTransactions: freeTransactionAllowance.canUseFreeTransactions,
        chainId,
        connectorId: connector?.id,
        isThirdwebInApp,
      }),
    [chainId, connector?.id, freeTransactionAllowance.canUseFreeTransactions, isThirdwebInApp],
  );

  const canUseGaslessSubmitTransactions = useMemo(
    () =>
      freeTransactionAllowance.canUseFreeTransactions &&
      (executionMode === "sponsored_7702" || expectsSponsoredSubmitCalls),
    [expectsSponsoredSubmitCalls, executionMode, freeTransactionAllowance.canUseFreeTransactions],
  );

  const isEligibleForGaslessSubmitTransactions = executionMode === "sponsored_7702" || expectsSponsoredSubmitCalls;

  const canUseSponsoredSubmitCalls = Boolean(
    thirdwebClient && activeWallet && typeof chainId === "number" && hasSendCalls && canUseGaslessSubmitTransactions,
  );
  const isAwaitingSponsoredSubmitCalls =
    expectsSponsoredSubmitCalls &&
    (!freeTransactionAllowance.isResolved || (prefersSponsoredSubmitCalls && !canUseSponsoredSubmitCalls));
  const isAwaitingSelfFundedSubmitCalls = useMemo(
    () =>
      shouldAwaitSelfFundedSubmitCalls({
        canUseFreeTransactions: freeTransactionAllowance.canUseFreeTransactions,
        chainId,
        connectorId: connector?.id,
        executionMode,
        freeTransactionAllowanceResolved: freeTransactionAllowance.isResolved,
        isThirdwebInApp,
      }),
    [
      chainId,
      connector?.id,
      executionMode,
      freeTransactionAllowance.canUseFreeTransactions,
      freeTransactionAllowance.isResolved,
      isThirdwebInApp,
    ],
  );

  const postFreeTransactionMutation = useCallback(async (path: string, body: Record<string, unknown>) => {
    const response = await fetch(path, {
      body: JSON.stringify(body),
      headers: {
        "content-type": "application/json",
      },
      method: "POST",
    });

    if (response.ok) {
      return;
    }

    const responseBody = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(responseBody?.error || "Free transaction update failed");
  }, []);

  const executeSponsoredCalls = useCallback(
    async (calls: SponsoredSubmitContractCall[], options: ExecuteSponsoredCallsOptions = {}) => {
      const client = thirdwebClient;

      if (!client || !activeWallet || typeof chainId !== "number" || !canUseSponsoredSubmitCalls) {
        throw new Error("Sponsored submit calls are unavailable.");
      }

      const chain = defineChain(chainId);
      const encodedCalls = calls.map(call => ({
        data: encodeFunctionData({
          abi: call.abi,
          functionName: call.functionName as never,
          args: (call.args ?? []) as never,
        }),
        to: call.address,
        ...(typeof call.value !== "undefined" ? { value: call.value } : {}),
      }));
      const operationKey =
        typeof address === "string"
          ? buildFreeTransactionOperationKey({
              chainId,
              calls: encodedCalls.map(call => ({
                data: call.data,
                to: call.to,
                value: call.value,
              })),
              sender: address,
            })
          : null;
      const preparedCalls = encodedCalls.map(call =>
        prepareTransaction({
          chain,
          client,
          data: call.data,
          to: call.to,
          ...(typeof call.value !== "undefined" ? { value: call.value } : {}),
        }),
      );
      const sendCallsWithWallet = async (wallet: NonNullable<typeof activeWallet>) =>
        sendAndConfirmCalls({
          atomicRequired: options.atomicRequired ?? false,
          calls: preparedCalls,
          wallet,
        });

      try {
        if (!options.suppressStatusToast) {
          statusToast.showSubmitting({ action: options.action ?? "transaction" });
        }

        const result = await sendCallsWithWallet(activeWallet);

        if (result.status !== "success") {
          const error = new Error("Sponsored calls failed.");
          (error as Error & { callsStatus?: typeof result }).callsStatus = result;
          throw error;
        }

        if (operationKey && address) {
          const transactionHashes = (result.receipts ?? [])
            .map(receipt => receipt.transactionHash)
            .filter((hash): hash is Hex => typeof hash === "string");

          if (transactionHashes.length > 0) {
            try {
              await postFreeTransactionMutation("/api/transactions/free/confirm", {
                address,
                chainId,
                operationKey,
                transactionHashes,
              });
            } catch (error) {
              console.error("Failed to confirm sponsored free transaction usage:", error);
            }
          }
        }

        return result;
      } catch (error) {
        if (
          shouldAttemptSelfFundedThirdwebFallback({
            activeWalletId: activeWallet.id,
            chainId,
            error,
            executionMode,
            // A locally derived operation key only identifies the payload shape.
            // The actual free-tx reservation happens server-side in the verifier,
            // and the client has no reliable signal that one was created here.
            hasReservedFreeTransaction: false,
          })
        ) {
          try {
            const fallbackWallet = createThirdwebInAppWallet(chainId, {
              sponsorshipMode: "self-funded",
            });

            await fallbackWallet.autoConnect({
              chain,
              client,
            });

            const fallbackResult = await sendCallsWithWallet(fallbackWallet);

            if (fallbackResult.status !== "success") {
              const fallbackStatusError = new Error("Self-funded calls failed.");
              (fallbackStatusError as Error & { callsStatus?: typeof fallbackResult }).callsStatus = fallbackResult;
              throw fallbackStatusError;
            }

            try {
              await syncWalletToWagmi(fallbackWallet, chainId, { reconnect: true });
              await setActiveWallet(fallbackWallet);
            } catch (syncError) {
              if (!shouldIgnorePostTransactionFallbackWalletSyncError(fallbackResult.status)) {
                throw syncError;
              }

              console.error("Self-funded fallback transaction succeeded, but wallet sync failed:", syncError);
            }

            return fallbackResult;
          } catch (fallbackError) {
            error = fallbackError;
          }
        }

        throw error;
      } finally {
        statusToast.dismiss();
        void queryClient.invalidateQueries({ queryKey: FREE_TRANSACTION_ALLOWANCE_QUERY_KEY });
      }
    },
    [
      activeWallet,
      address,
      canUseSponsoredSubmitCalls,
      chainId,
      executionMode,
      postFreeTransactionMutation,
      queryClient,
      setActiveWallet,
      statusToast,
      syncWalletToWagmi,
    ],
  );

  return {
    canUseGaslessSubmitTransactions,
    canUseSponsoredSubmitCalls,
    executionMode,
    freeTransactionLimit: freeTransactionAllowance.limit,
    freeTransactionRemaining: freeTransactionAllowance.remaining,
    freeTransactionVerified: freeTransactionAllowance.verified,
    isAwaitingSponsoredSubmitCalls,
    isAwaitingSelfFundedSubmitCalls,
    isAwaitingFreeTransactionAllowance: isEligibleForGaslessSubmitTransactions && !freeTransactionAllowance.isResolved,
    executeSponsoredCalls,
  };
}
