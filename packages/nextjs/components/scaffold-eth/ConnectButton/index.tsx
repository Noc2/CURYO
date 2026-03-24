"use client";

// @refresh reset
import { AddressInfoDropdown } from "./AddressInfoDropdown";
import { WrongNetworkDropdown } from "./WrongNetworkDropdown";
import { useActiveAccount, useActiveWalletChain } from "thirdweb/react";
import { Address } from "viem";
import { useAccount } from "wagmi";
import { useTargetNetwork } from "~~/hooks/scaffold-eth/useTargetNetwork";
import { useCuryoConnectModal } from "~~/hooks/useCuryoConnectModal";

export const CuryoConnectButton = ({ inlineMenu = false }: { inlineMenu?: boolean }) => {
  const { targetNetwork } = useTargetNetwork();
  const { address, chain } = useAccount();
  const activeThirdwebAccount = useActiveAccount();
  const activeThirdwebChain = useActiveWalletChain();
  const { openConnectModal, isConnecting, thirdwebEnabled } = useCuryoConnectModal();
  const resolvedChain = chain ?? activeThirdwebChain;

  const syncingThirdwebAccount = Boolean(activeThirdwebAccount && (!address || !resolvedChain));

  if (!address || !resolvedChain) {
    return (
      <button
        className="btn btn-sm btn-curyo border-none"
        disabled={!thirdwebEnabled || isConnecting || syncingThirdwebAccount}
        onClick={() => {
          void openConnectModal();
        }}
        type="button"
        style={{ fontSize: "16px" }}
      >
        <span className="sm:hidden">
          {!thirdwebEnabled ? "Unavailable" : isConnecting || syncingThirdwebAccount ? "..." : "Sign In"}
        </span>
        <span className="hidden sm:inline">
          {!thirdwebEnabled
            ? "Sign In Unavailable"
            : isConnecting || syncingThirdwebAccount
              ? "Signing In..."
              : "Sign In"}
        </span>
      </button>
    );
  }

  if (resolvedChain.id !== targetNetwork.id) {
    return <WrongNetworkDropdown />;
  }

  return (
    <>
      <AddressInfoDropdown
        address={address as Address}
        displayName={`${address?.slice(0, 6)}...${address?.slice(-4)}`}
        inlineMenu={inlineMenu}
      />
    </>
  );
};
