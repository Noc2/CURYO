"use client";

// @refresh reset
import { AddressInfoDropdown } from "./AddressInfoDropdown";
import { RevealBurnerPKModal } from "./RevealBurnerPKModal";
import { WrongNetworkDropdown } from "./WrongNetworkDropdown";
import { useActiveAccount } from "thirdweb/react";
import { Address } from "viem";
import { useAccount } from "wagmi";
import { useTargetNetwork } from "~~/hooks/scaffold-eth/useTargetNetwork";
import { useCuryoConnectModal } from "~~/hooks/useCuryoConnectModal";

export const CuryoConnectButton = ({ inlineMenu = false }: { inlineMenu?: boolean }) => {
  const { targetNetwork } = useTargetNetwork();
  const { address, chain } = useAccount();
  const activeThirdwebAccount = useActiveAccount();
  const { connectAvailable, openConnectModal, isConnecting } = useCuryoConnectModal();

  const syncingThirdwebAccount = Boolean(activeThirdwebAccount && !address);

  if (!address || !chain) {
    return (
      <button
        className="btn btn-sm btn-curyo border-none"
        disabled={!connectAvailable || isConnecting || syncingThirdwebAccount}
        onClick={() => {
          void openConnectModal();
        }}
        type="button"
        style={{ fontSize: "16px" }}
      >
        <span className="sm:hidden">
          {!connectAvailable ? "Unavailable" : isConnecting || syncingThirdwebAccount ? "..." : "Connect"}
        </span>
        <span className="hidden sm:inline">
          {!connectAvailable
            ? "Wallet Unavailable"
            : isConnecting || syncingThirdwebAccount
              ? "Connecting..."
              : "Connect Wallet"}
        </span>
      </button>
    );
  }

  if (chain.id !== targetNetwork.id) {
    return <WrongNetworkDropdown />;
  }

  return (
    <>
      <AddressInfoDropdown
        address={address as Address}
        displayName={`${address?.slice(0, 6)}...${address?.slice(-4)}`}
        inlineMenu={inlineMenu}
      />
      <RevealBurnerPKModal />
    </>
  );
};
