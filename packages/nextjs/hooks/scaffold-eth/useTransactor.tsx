import { useQueryClient } from "@tanstack/react-query";
import { Hash, SendTransactionParameters, TransactionReceipt, WalletClient } from "viem";
import { Config, useConfig, useWalletClient } from "wagmi";
import { getPublicClient } from "wagmi/actions";
import { SendTransactionMutate } from "wagmi/query";
import { FREE_TRANSACTION_ALLOWANCE_QUERY_KEY } from "~~/hooks/useFreeTransactionAllowance";
import scaffoldConfig from "~~/scaffold.config";
import { AllowedChainIds, getBlockExplorerTxLink, notification } from "~~/utils/scaffold-eth";
import { TransactorFuncOptions, getParsedErrorWithAllAbis } from "~~/utils/scaffold-eth/contract";

type TransactionFunc = (
  tx: (() => Promise<Hash>) | Parameters<SendTransactionMutate<Config, undefined>>[0],
  options?: TransactorFuncOptions,
) => Promise<Hash | undefined>;

/**
 * Custom notification content for TXs.
 */
const TxnNotification = ({ message, blockExplorerLink }: { message: string; blockExplorerLink?: string }) => {
  return (
    <div className={`flex flex-col ml-1 cursor-default`}>
      <p className="my-0">{message}</p>
      {blockExplorerLink && blockExplorerLink.length > 0 ? (
        <a href={blockExplorerLink} target="_blank" rel="noreferrer" className="block link">
          check out transaction
        </a>
      ) : null}
    </div>
  );
};

/**
 * Runs Transaction passed in to returned function showing UI feedback.
 * @param _walletClient - Optional wallet client to use. If not provided, will use the one from useWalletClient.
 * @returns function that takes in transaction function as callback, shows UI feedback for transaction and returns a promise of the transaction hash
 */
export const useTransactor = (_walletClient?: WalletClient): TransactionFunc => {
  let walletClient = _walletClient;
  const { data } = useWalletClient();
  const runtimeConfig = useConfig();
  const queryClient = useQueryClient();
  if (walletClient === undefined && data) {
    walletClient = data;
  }

  const result: TransactionFunc = async (tx, options) => {
    if (!walletClient) {
      notification.error("Cannot access account");
      return;
    }

    let notificationId = null;
    let transactionHash: Hash | undefined = undefined;
    let transactionReceipt: TransactionReceipt | undefined;
    let blockExplorerTxURL = "";
    let chainId: number = scaffoldConfig.targetNetworks[0].id;
    try {
      const cachedChainId =
        walletClient.chain?.id ??
        (typeof walletClient.account === "object" && "chainId" in walletClient.account
          ? Number((walletClient.account as { chainId?: number }).chainId)
          : undefined);
      chainId = Number.isFinite(cachedChainId) ? cachedChainId : scaffoldConfig.targetNetworks[0].id;
      if (!Number.isFinite(chainId)) {
        chainId = await walletClient.getChainId();
      }
      // Get full transaction from public client for the correct chain
      const publicClient = getPublicClient(runtimeConfig, { chainId: chainId as any });
      if (!publicClient) {
        throw new Error("Public client not available for this chain");
      }

      notificationId = notification.loading(<TxnNotification message="Waiting for confirmation" />);
      if (typeof tx === "function") {
        // Tx is already prepared by the caller
        const result = await tx();
        transactionHash = result;
      } else if (tx != null) {
        transactionHash = await walletClient.sendTransaction(tx as SendTransactionParameters);
      } else {
        throw new Error("Incorrect transaction passed to transactor");
      }
      notification.remove(notificationId);

      blockExplorerTxURL = chainId ? getBlockExplorerTxLink(chainId, transactionHash) : "";

      // Local Anvil with automine: tx is mined instantly when accepted.
      // The simulation already validated the tx, so skip receipt polling which is
      // unreliable on local chains due to publicClient transport issues.
      if (chainId === 31337) {
        notification.remove(notificationId);
        void queryClient.invalidateQueries({ queryKey: FREE_TRANSACTION_ALLOWANCE_QUERY_KEY });
        notification.success(
          <TxnNotification message="Transaction completed successfully!" blockExplorerLink={blockExplorerTxURL} />,
          {
            icon: "🎉",
          },
        );
        return transactionHash;
      }

      notificationId = notification.loading(
        <TxnNotification message="Waiting for transaction to complete." blockExplorerLink={blockExplorerTxURL} />,
      );

      transactionReceipt = await publicClient.waitForTransactionReceipt({
        hash: transactionHash,
        confirmations: options?.blockConfirmations,
      });
      notification.remove(notificationId);

      if (transactionReceipt.status === "reverted") throw new Error("Transaction reverted");

      notification.success(
        <TxnNotification message="Transaction completed successfully!" blockExplorerLink={blockExplorerTxURL} />,
        {
          icon: "🎉",
        },
      );

      void queryClient.invalidateQueries({ queryKey: FREE_TRANSACTION_ALLOWANCE_QUERY_KEY });

      if (options?.onBlockConfirmation) options.onBlockConfirmation(transactionReceipt);
    } catch (error: any) {
      if (notificationId) {
        notification.remove(notificationId);
      }
      const message = getParsedErrorWithAllAbis(error, chainId as AllowedChainIds);

      // if receipt was reverted, show notification with block explorer link and return error
      if (transactionReceipt?.status === "reverted") {
        notification.error(<TxnNotification message={message} blockExplorerLink={blockExplorerTxURL} />);
        throw error;
      }

      notification.error(message);
      void queryClient.invalidateQueries({ queryKey: FREE_TRANSACTION_ALLOWANCE_QUERY_KEY });
      throw error;
    }

    return transactionHash;
  };

  return result;
};
