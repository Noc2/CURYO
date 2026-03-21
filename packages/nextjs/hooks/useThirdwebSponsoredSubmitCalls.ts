"use client";

import { useCallback, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { defineChain, prepareTransaction } from "thirdweb";
import { useActiveWallet } from "thirdweb/react";
import { sendAndConfirmCalls } from "thirdweb/wallets/eip5792";
import { type Abi, encodeFunctionData } from "viem";
import { useAccount } from "wagmi";
import {
  FREE_TRANSACTION_ALLOWANCE_QUERY_KEY,
  useFreeTransactionAllowance,
} from "~~/hooks/useFreeTransactionAllowance";
import { type WalletExecutionMode, useWalletExecutionCapabilities } from "~~/hooks/useWalletExecutionCapabilities";
import { thirdwebClient } from "~~/services/thirdweb/client";

export type SponsoredSubmitContractCall = {
  abi: Abi;
  address: `0x${string}`;
  functionName: string;
  args?: readonly unknown[];
  value?: bigint;
};

function isGaslessSubmitExecutionMode(executionMode: WalletExecutionMode) {
  return executionMode === "sponsored_7702" || executionMode === "external_send_calls";
}

export function useThirdwebSponsoredSubmitCalls() {
  const queryClient = useQueryClient();
  const activeWallet = useActiveWallet();
  const { chainId } = useAccount();
  const freeTransactionAllowance = useFreeTransactionAllowance();
  const { executionMode, hasSendCalls } = useWalletExecutionCapabilities();

  const canUseGaslessSubmitTransactions = useMemo(
    () => freeTransactionAllowance.canUseFreeTransactions && isGaslessSubmitExecutionMode(executionMode),
    [executionMode, freeTransactionAllowance.canUseFreeTransactions],
  );

  const canUseSponsoredSubmitCalls = Boolean(
    thirdwebClient && activeWallet && typeof chainId === "number" && hasSendCalls && canUseGaslessSubmitTransactions,
  );

  const executeSponsoredCalls = useCallback(
    async (calls: SponsoredSubmitContractCall[]) => {
      const client = thirdwebClient;

      if (!client || !activeWallet || typeof chainId !== "number" || !canUseSponsoredSubmitCalls) {
        throw new Error("Sponsored submit calls are unavailable.");
      }

      const chain = defineChain(chainId);

      try {
        const result = await sendAndConfirmCalls({
          atomicRequired: false,
          calls: calls.map(call =>
            prepareTransaction({
              chain,
              client,
              data: encodeFunctionData({
                abi: call.abi,
                functionName: call.functionName as never,
                args: (call.args ?? []) as never,
              }),
              to: call.address,
              ...(typeof call.value !== "undefined" ? { value: call.value } : {}),
            }),
          ),
          wallet: activeWallet,
        });

        if (result.status !== "success") {
          const error = new Error("Sponsored calls failed.");
          (error as Error & { callsStatus?: typeof result }).callsStatus = result;
          throw error;
        }

        return result;
      } finally {
        void queryClient.invalidateQueries({ queryKey: FREE_TRANSACTION_ALLOWANCE_QUERY_KEY });
      }
    },
    [activeWallet, canUseSponsoredSubmitCalls, chainId, queryClient],
  );

  return {
    canUseGaslessSubmitTransactions,
    canUseSponsoredSubmitCalls,
    executionMode,
    freeTransactionLimit: freeTransactionAllowance.limit,
    freeTransactionRemaining: freeTransactionAllowance.remaining,
    freeTransactionVerified: freeTransactionAllowance.verified,
    isAwaitingFreeTransactionAllowance:
      isGaslessSubmitExecutionMode(executionMode) && !freeTransactionAllowance.isResolved,
    executeSponsoredCalls,
  };
}
