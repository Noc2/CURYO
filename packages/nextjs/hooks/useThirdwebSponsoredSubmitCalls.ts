"use client";

import { useCallback, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { defineChain, prepareTransaction } from "thirdweb";
import { useActiveWallet, useSetActiveWallet } from "thirdweb/react";
import { sendAndConfirmCalls } from "thirdweb/wallets/eip5792";
import { type Abi, type Hex, encodeFunctionData } from "viem";
import { useAccount } from "wagmi";
import {
  FREE_TRANSACTION_ALLOWANCE_QUERY_KEY,
  useFreeTransactionAllowance,
} from "~~/hooks/useFreeTransactionAllowance";
import { useThirdwebWagmiSync } from "~~/hooks/useThirdwebWagmiSync";
import { type WalletExecutionMode, useWalletExecutionCapabilities } from "~~/hooks/useWalletExecutionCapabilities";
import { buildFreeTransactionOperationKey } from "~~/lib/thirdweb/freeTransactionOperation";
import {
  createThirdwebInAppWallet,
  getThirdwebPaymasterServiceUrl,
  supportsThirdwebExecutionCapabilities,
  thirdwebClient,
} from "~~/services/thirdweb/client";

type SponsoredSubmitCapabilities = {
  paymasterService: {
    url: string;
  };
};

export type SponsoredSubmitContractCall = {
  abi: Abi;
  address: `0x${string}`;
  functionName: string;
  args?: readonly unknown[];
  value?: bigint;
};

type ExecuteSponsoredCallsOptions = {
  atomicRequired?: boolean;
};

function getSponsoredSubmitCapabilities(params: {
  chainId: number | undefined;
  executionMode: WalletExecutionMode;
  supportsPaymasterService: boolean;
}): SponsoredSubmitCapabilities | undefined {
  if (params.executionMode !== "external_send_calls" || !params.supportsPaymasterService) {
    return undefined;
  }

  const paymasterServiceUrl =
    typeof params.chainId === "number" ? getThirdwebPaymasterServiceUrl(params.chainId) : null;
  if (!paymasterServiceUrl) {
    return undefined;
  }

  return {
    paymasterService: {
      url: paymasterServiceUrl,
    },
  };
}

export function shouldPreferSponsoredSubmitCalls(params: {
  canUseFreeTransactions: boolean;
  chainId: number | undefined;
  connectorId: string | undefined;
}) {
  return params.canUseFreeTransactions && shouldExpectSponsoredSubmitCalls(params);
}

export function shouldExpectSponsoredSubmitCalls(params: {
  chainId: number | undefined;
  connectorId: string | undefined;
}) {
  return (
    params.connectorId === "in-app-wallet" &&
    typeof params.chainId === "number" &&
    supportsThirdwebExecutionCapabilities(params.chainId)
  );
}

export function isThirdwebSponsorshipDeniedError(error: unknown) {
  const message =
    (error as { message?: string; shortMessage?: string } | undefined)?.message ??
    (error as { message?: string; shortMessage?: string } | undefined)?.shortMessage ??
    "";

  return message.toLowerCase().includes("transaction not sponsored");
}

export function useThirdwebSponsoredSubmitCalls() {
  const queryClient = useQueryClient();
  const activeWallet = useActiveWallet();
  const setActiveWallet = useSetActiveWallet();
  const { syncWalletToWagmi } = useThirdwebWagmiSync();
  const { address, chainId, connector } = useAccount();
  const freeTransactionAllowance = useFreeTransactionAllowance();
  const { executionMode, hasSendCalls, supportsPaymasterService } = useWalletExecutionCapabilities();

  const sponsoredSubmitCapabilities = useMemo(
    () =>
      getSponsoredSubmitCapabilities({
        chainId,
        executionMode,
        supportsPaymasterService,
      }),
    [chainId, executionMode, supportsPaymasterService],
  );

  const expectsSponsoredSubmitCalls = useMemo(
    () =>
      shouldExpectSponsoredSubmitCalls({
        chainId,
        connectorId: connector?.id,
      }),
    [chainId, connector?.id],
  );

  const prefersSponsoredSubmitCalls = useMemo(
    () =>
      shouldPreferSponsoredSubmitCalls({
        canUseFreeTransactions: freeTransactionAllowance.canUseFreeTransactions,
        chainId,
        connectorId: connector?.id,
      }),
    [chainId, connector?.id, freeTransactionAllowance.canUseFreeTransactions],
  );

  const canUseGaslessSubmitTransactions = useMemo(
    () =>
      freeTransactionAllowance.canUseFreeTransactions &&
      (executionMode === "sponsored_7702" || sponsoredSubmitCapabilities !== undefined || expectsSponsoredSubmitCalls),
    [
      expectsSponsoredSubmitCalls,
      executionMode,
      freeTransactionAllowance.canUseFreeTransactions,
      sponsoredSubmitCapabilities,
    ],
  );

  const isEligibleForGaslessSubmitTransactions =
    executionMode === "sponsored_7702" || sponsoredSubmitCapabilities !== undefined || expectsSponsoredSubmitCalls;

  const canUseSponsoredSubmitCalls = Boolean(
    thirdwebClient && activeWallet && typeof chainId === "number" && hasSendCalls && canUseGaslessSubmitTransactions,
  );
  const isAwaitingSponsoredSubmitCalls =
    expectsSponsoredSubmitCalls &&
    (!freeTransactionAllowance.isResolved || (prefersSponsoredSubmitCalls && !canUseSponsoredSubmitCalls));

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
      const sendCallsWithWallet = async (
        wallet: NonNullable<typeof activeWallet>,
        capabilities?: SponsoredSubmitCapabilities,
      ) =>
        sendAndConfirmCalls({
          atomicRequired: options.atomicRequired ?? false,
          ...(capabilities ? { capabilities } : {}),
          calls: preparedCalls,
          wallet,
        });

      try {
        const result = await sendCallsWithWallet(activeWallet, sponsoredSubmitCapabilities);

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
          activeWallet.id === "inApp" &&
          executionMode === "sponsored_7702" &&
          typeof chainId === "number" &&
          isThirdwebSponsorshipDeniedError(error)
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
            await syncWalletToWagmi(fallbackWallet, chainId, { reconnect: true });
            await setActiveWallet(fallbackWallet);

            if (fallbackResult.status !== "success") {
              const fallbackStatusError = new Error("Self-funded calls failed.");
              (fallbackStatusError as Error & { callsStatus?: typeof fallbackResult }).callsStatus = fallbackResult;
              throw fallbackStatusError;
            }

            if (operationKey && address) {
              const transactionHashes = (fallbackResult.receipts ?? [])
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
                } catch (confirmationError) {
                  console.error("Failed to confirm fallback free transaction usage:", confirmationError);
                }
              }
            }

            return fallbackResult;
          } catch (fallbackError) {
            error = fallbackError;
          }
        }

        throw error;
      } finally {
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
      sponsoredSubmitCapabilities,
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
    isAwaitingFreeTransactionAllowance: isEligibleForGaslessSubmitTransactions && !freeTransactionAllowance.isResolved,
    executeSponsoredCalls,
  };
}
