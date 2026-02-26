"use client";

import { useState } from "react";
import { createWalletClient, http, parseEther } from "viem";
import { hardhat } from "viem/chains";
import { useAccount } from "wagmi";
import { useTransactor } from "~~/hooks/scaffold-eth";
import { notification } from "~~/utils/scaffold-eth";

const FAUCET_ADDRESS = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

const localWalletClient = createWalletClient({
  chain: hardhat,
  transport: http(),
});

/**
 * Text-link button to claim 1 ETH from the local hardhat faucet.
 */
export function NativeFaucetClaim() {
  const { address, chain } = useAccount();
  const [loading, setLoading] = useState(false);
  const faucetTxn = useTransactor(localWalletClient);

  if (!address || chain?.id !== hardhat.id) return null;

  const handleClaim = async () => {
    try {
      setLoading(true);
      await faucetTxn({
        account: FAUCET_ADDRESS,
        to: address,
        value: parseEther("1"),
      });
      notification.success("Claimed 1 ETH from faucet!");
    } catch {
      notification.error("ETH faucet claim failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleClaim}
      className="text-base font-medium text-primary hover:text-primary/80 transition-colors disabled:opacity-40"
      disabled={loading}
    >
      {loading ? (
        <span className="flex items-center gap-1.5">
          <span className="loading loading-spinner loading-xs"></span>
          Claiming...
        </span>
      ) : (
        "Get 1 ETH"
      )}
    </button>
  );
}
