import { useState } from "react";
import { MutateOptions } from "@tanstack/react-query";
import { Abi, ExtractAbiFunctionNames } from "abitype";
import { Config, useAccount, useConfig, useWriteContract } from "wagmi";
import { WriteContractErrorType, WriteContractReturnType, getPublicClient } from "wagmi/actions";
import { WriteContractVariables } from "wagmi/query";
import { useSelectedNetwork } from "~~/hooks/scaffold-eth";
import { useDeployedContractInfo, useTransactor } from "~~/hooks/scaffold-eth";
import { useLocalE2ETestWalletClient } from "~~/hooks/scaffold-eth/useLocalE2ETestWalletClient";
import { AllowedChainIds, notification } from "~~/utils/scaffold-eth";
import {
  ContractAbi,
  ContractName,
  ScaffoldWriteContractOptions,
  ScaffoldWriteContractVariables,
  TransactorFuncOptions,
  UseScaffoldWriteConfig,
  simulateContractWriteAndNotifyError,
} from "~~/utils/scaffold-eth/contract";

type ScaffoldWriteContractReturnType<TContractName extends ContractName> = Omit<
  ReturnType<typeof useWriteContract>,
  "writeContract" | "writeContractAsync"
> & {
  isMining: boolean;
  writeContractAsync: <
    TFunctionName extends ExtractAbiFunctionNames<ContractAbi<TContractName>, "nonpayable" | "payable">,
  >(
    variables: ScaffoldWriteContractVariables<TContractName, TFunctionName>,
    options?: ScaffoldWriteContractOptions,
  ) => Promise<WriteContractReturnType | undefined>;
  writeContract: <TFunctionName extends ExtractAbiFunctionNames<ContractAbi<TContractName>, "nonpayable" | "payable">>(
    variables: ScaffoldWriteContractVariables<TContractName, TFunctionName>,
    options?: Omit<ScaffoldWriteContractOptions, "onBlockConfirmation" | "blockConfirmations">,
  ) => void;
};

export function pickTransactorOptions(options?: ScaffoldWriteContractOptions): TransactorFuncOptions {
  if (!options) {
    return {};
  }

  const transactorOptions: TransactorFuncOptions = {};

  if (options.action !== undefined) {
    transactorOptions.action = options.action;
  }
  if (options.blockConfirmations !== undefined) {
    transactorOptions.blockConfirmations = options.blockConfirmations;
  }
  if (options.onBlockConfirmation !== undefined) {
    transactorOptions.onBlockConfirmation = options.onBlockConfirmation;
  }
  if (options.getErrorMessage !== undefined) {
    transactorOptions.getErrorMessage = options.getErrorMessage;
  }
  if (options.suppressErrorToast !== undefined) {
    transactorOptions.suppressErrorToast = options.suppressErrorToast;
  }
  if (options.suppressStatusToast !== undefined) {
    transactorOptions.suppressStatusToast = options.suppressStatusToast;
  }
  if (options.suppressSuccessToast !== undefined) {
    transactorOptions.suppressSuccessToast = options.suppressSuccessToast;
  }

  return transactorOptions;
}

export function useScaffoldWriteContract<TContractName extends ContractName>(
  config: UseScaffoldWriteConfig<TContractName>,
): ScaffoldWriteContractReturnType<TContractName>;

/**
 * Wrapper around wagmi's useWriteContract hook which automatically loads (by name) the contract ABI and address from
 * the contracts present in deployedContracts.ts corresponding to targetNetworks configured in scaffold.config.ts
 * @param config.contractName - name of the contract to be written to
 * @param config.chainId - optional chainId that is configured with the scaffold project to make use for multi-chain interactions.
 * @param config.writeContractParams - wagmi's useWriteContract parameters
 */
export function useScaffoldWriteContract<TContractName extends ContractName>(
  config: UseScaffoldWriteConfig<TContractName>,
): ScaffoldWriteContractReturnType<TContractName> {
  const { contractName, chainId, writeContractParams: finalWriteContractParams } = config;

  const wagmiConfig = useConfig();

  const { chain: accountChain, address: accountAddress } = useAccount();
  const [isMining, setIsMining] = useState(false);
  const selectedNetwork = useSelectedNetwork(chainId);
  const localE2ETestWalletClient = useLocalE2ETestWalletClient(accountAddress, selectedNetwork.id);
  const writeTx = useTransactor(localE2ETestWalletClient);

  const wagmiContractWrite = useWriteContract(finalWriteContractParams);

  const { data: deployedContractData, isLoading: deployedContractLoading } = useDeployedContractInfo({
    contractName,
    chainId: selectedNetwork.id as AllowedChainIds,
  });

  const sendContractWriteAsyncTx = async <
    TFunctionName extends ExtractAbiFunctionNames<ContractAbi<TContractName>, "nonpayable" | "payable">,
  >(
    variables: ScaffoldWriteContractVariables<TContractName, TFunctionName>,
    options?: ScaffoldWriteContractOptions,
  ) => {
    if (!deployedContractData) {
      notification.error(
        deployedContractLoading ? "Still loading. Try again in a moment." : "This action is unavailable right now.",
      );
      return;
    }

    if (!accountChain?.id) {
      notification.error("Please connect your wallet");
      return;
    }

    if (accountChain?.id !== selectedNetwork.id) {
      notification.error(`Wallet is connected to the wrong network. Please switch to ${selectedNetwork.name}`);
      return;
    }

    try {
      // Reset wagmi mutation state to prevent stale state from blocking new transactions
      wagmiContractWrite.reset();
      setIsMining(true);
      const transactorOptions = pickTransactorOptions(options);
      const mutateOptions = options ? { ...options } : undefined;
      if (mutateOptions) {
        delete mutateOptions.action;
        delete mutateOptions.blockConfirmations;
        delete mutateOptions.onBlockConfirmation;
        delete mutateOptions.getErrorMessage;
        delete mutateOptions.suppressErrorToast;
        delete mutateOptions.suppressStatusToast;
        delete mutateOptions.suppressSuccessToast;
      }

      const writeContractObject = {
        abi: deployedContractData.abi as Abi,
        address: deployedContractData.address,
        ...variables,
      } as WriteContractVariables<Abi, string, any[], Config, number>;

      if (!config.disableSimulate) {
        await simulateContractWriteAndNotifyError({
          wagmiConfig,
          writeContractParams: writeContractObject,
          chainId: selectedNetwork.id as AllowedChainIds,
        });
      }

      // Pre-fill gas and nonce via the public client (direct RPC) to avoid
      // wallet-side stale state during sequential writes on external wallets.
      if (accountAddress) {
        const publicClient = getPublicClient(wagmiConfig, { chainId: selectedNetwork.id as any });
        if (publicClient) {
          try {
            const estimated = await publicClient.estimateContractGas({
              address: deployedContractData.address,
              abi: deployedContractData.abi as Abi,
              functionName: (variables as any).functionName,
              args: (variables as any).args,
              account: accountAddress,
              value: (variables as any).value,
            });
            // Add 20% buffer; setting gas explicitly skips wallet-side gas estimation
            (writeContractObject as any).gas = (estimated * 120n) / 100n;
          } catch {
            // Fallback: let the wallet estimate gas
          }

          try {
            (writeContractObject as any).nonce = await publicClient.getTransactionCount({
              address: accountAddress,
              blockTag: "pending",
            });
          } catch {
            // Fallback: let the wallet choose the nonce
          }
        }
      }

      const makeWriteWithParams = () => {
        if (localE2ETestWalletClient) {
          return localE2ETestWalletClient.writeContract(writeContractObject as any);
        }

        return wagmiContractWrite.writeContractAsync(
          writeContractObject,
          mutateOptions as
            | MutateOptions<
                WriteContractReturnType,
                WriteContractErrorType,
                WriteContractVariables<Abi, string, any[], Config, number>,
                unknown
              >
            | undefined,
        );
      };
      const writeTxResult = await writeTx(makeWriteWithParams, {
        ...transactorOptions,
      });

      return writeTxResult;
    } catch (e: any) {
      throw e;
    } finally {
      setIsMining(false);
    }
  };

  const sendContractWriteTx = <
    TContractName extends ContractName,
    TFunctionName extends ExtractAbiFunctionNames<ContractAbi<TContractName>, "nonpayable" | "payable">,
  >(
    variables: ScaffoldWriteContractVariables<TContractName, TFunctionName>,
    options?: Omit<ScaffoldWriteContractOptions, "onBlockConfirmation" | "blockConfirmations">,
  ) => {
    if (!deployedContractData) {
      notification.error(
        deployedContractLoading ? "Still loading. Try again in a moment." : "This action is unavailable right now.",
      );
      return;
    }
    if (!accountChain?.id) {
      notification.error("Please connect your wallet");
      return;
    }

    if (accountChain?.id !== selectedNetwork.id) {
      notification.error(`Wallet is connected to the wrong network. Please switch to ${selectedNetwork.name}`);
      return;
    }

    // Reset wagmi mutation state to prevent stale state from blocking new transactions
    wagmiContractWrite.reset();
    if (localE2ETestWalletClient) {
      void sendContractWriteAsyncTx(variables as any, options as any).catch(() => undefined);
      return;
    }
    wagmiContractWrite.writeContract(
      {
        abi: deployedContractData.abi as Abi,
        address: deployedContractData.address,
        ...variables,
      } as WriteContractVariables<Abi, string, any[], Config, number>,
      options as
        | MutateOptions<
            WriteContractReturnType,
            WriteContractErrorType,
            WriteContractVariables<Abi, string, any[], Config, number>,
            unknown
          >
        | undefined,
    );
  };

  return {
    ...wagmiContractWrite,
    isMining,
    isPending: wagmiContractWrite.isPending || isMining,
    // Overwrite wagmi's writeContactAsync
    writeContractAsync: sendContractWriteAsyncTx,
    // Overwrite wagmi's writeContract
    writeContract: sendContractWriteTx,
  };
}
