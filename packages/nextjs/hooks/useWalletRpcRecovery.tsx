"use client";

import { useCallback, useMemo } from "react";
import { useActiveWallet } from "thirdweb/react";
import { injectedProvider } from "thirdweb/wallets";
import type { Chain } from "viem";
import { numberToHex } from "viem";
import { useAccount } from "wagmi";
import { getTargetNetworks } from "~~/utils/scaffold-eth";
import { notification } from "~~/utils/scaffold-eth";

type AddEthereumChainParameter = {
  blockExplorerUrls?: string[];
  chainId: `0x${string}`;
  chainName: string;
  nativeCurrency: Chain["nativeCurrency"];
  rpcUrls: readonly string[];
};

function unique(values: Array<string | undefined>) {
  return values.filter(
    (value, index, allValues): value is string => Boolean(value) && allValues.indexOf(value) === index,
  );
}

export function canRepairWalletRpc(params: { chain: Chain | null; walletId: string | undefined }) {
  return params.walletId === "io.metamask" && Boolean(params.chain?.rpcUrls.default.http.length);
}

export function buildAddEthereumChainParameter(chain: Chain): AddEthereumChainParameter {
  const blockExplorerUrls = unique(Object.values(chain.blockExplorers ?? {}).map(explorer => explorer?.url));

  return {
    ...(blockExplorerUrls.length > 0 ? { blockExplorerUrls } : {}),
    chainId: numberToHex(chain.id),
    chainName: chain.name,
    nativeCurrency: chain.nativeCurrency,
    rpcUrls: chain.rpcUrls.default.http,
  };
}

export function useWalletRpcRecovery() {
  const activeWallet = useActiveWallet();
  const { chain } = useAccount();
  const targetChain = useMemo(
    () => getTargetNetworks().find(targetNetwork => targetNetwork.id === chain?.id) ?? null,
    [chain?.id],
  );
  const walletId = activeWallet?.id;
  const walletName = walletId === "io.metamask" ? "MetaMask" : "Wallet";
  const provider = useMemo(() => (walletId ? injectedProvider(walletId) : undefined), [walletId]);
  const canRepairActiveWalletRpc = canRepairWalletRpc({
    chain: targetChain,
    walletId,
  });

  const repairWalletRpc = useCallback(async () => {
    if (!provider || !targetChain || !canRepairActiveWalletRpc) {
      return false;
    }

    const toastId = notification.loading(`Refreshing ${walletName} RPC...`);

    try {
      await provider.request({
        method: "wallet_addEthereumChain",
        params: [buildAddEthereumChainParameter(targetChain)],
      });

      await provider
        .request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: numberToHex(targetChain.id) }],
        })
        .catch(() => undefined);

      notification.remove(toastId);
      notification.success("RPC refreshed. Retry.");
      return true;
    } catch (error) {
      console.error(`Failed to refresh ${walletName} RPC:`, error);
      notification.remove(toastId);
      notification.error(`Update ${walletName} RPC, then retry.`);
      return false;
    }
  }, [canRepairActiveWalletRpc, provider, targetChain, walletName]);

  const showWalletRpcOverloadNotification = useCallback(() => {
    if (!canRepairActiveWalletRpc || !targetChain) {
      notification.error("Wallet RPC is overloaded. Retry soon or switch RPC.");
      return;
    }

    notification.error(
      <div className="space-y-2">
        <p>{walletName} RPC overloaded.</p>
        <button
          type="button"
          className="btn btn-xs btn-primary whitespace-nowrap"
          onClick={() => void repairWalletRpc()}
        >
          Refresh RPC
        </button>
      </div>,
      { duration: 10_000 },
    );
  }, [canRepairActiveWalletRpc, repairWalletRpc, targetChain, walletName]);

  return {
    canRepairActiveWalletRpc,
    repairWalletRpc,
    showWalletRpcOverloadNotification,
  };
}
