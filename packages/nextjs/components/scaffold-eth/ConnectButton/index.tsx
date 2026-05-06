"use client";

// @refresh reset
import { AddressInfoDropdown } from "./AddressInfoDropdown";
import { WrongNetworkDropdown } from "./WrongNetworkDropdown";
import { useActiveAccount, useActiveWalletChain } from "thirdweb/react";
import { Address } from "viem";
import { useAccount } from "wagmi";
import { HumanSignInButton } from "~~/components/shared/HumanSignInButton";
import { useTargetNetwork } from "~~/hooks/scaffold-eth/useTargetNetwork";

export const CuryoConnectButton = ({
  inlineMenu = false,
  compact = false,
}: {
  inlineMenu?: boolean;
  compact?: boolean;
}) => {
  const { targetNetwork } = useTargetNetwork();
  const { address, chain } = useAccount();
  const activeThirdwebAccount = useActiveAccount();
  const activeThirdwebChain = useActiveWalletChain();
  const resolvedChain = chain ?? activeThirdwebChain;

  const syncingThirdwebAccount = Boolean(activeThirdwebAccount && (!address || !resolvedChain));

  if (!address || !resolvedChain) {
    return (
      <HumanSignInButton
        className="btn btn-sm btn-primary border-none"
        data-testid="auth-connect-button"
        disabled={syncingThirdwebAccount}
        style={{ fontSize: "16px" }}
      >
        Sign In as Human
      </HumanSignInButton>
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
        compact={compact}
        inlineMenu={inlineMenu}
      />
    </>
  );
};
