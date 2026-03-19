"use client";

// @refresh reset
import { useCallback } from "react";
import { AddressInfoDropdown } from "./AddressInfoDropdown";
import { RevealBurnerPKModal } from "./RevealBurnerPKModal";
import { WrongNetworkDropdown } from "./WrongNetworkDropdown";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useActiveAccount, useConnectModal } from "thirdweb/react";
import { Address } from "viem";
import { useAccount } from "wagmi";
import { useTargetNetwork } from "~~/hooks/scaffold-eth/useTargetNetwork";
import { useThirdwebWagmiSync } from "~~/hooks/useThirdwebWagmiSync";
import { isThirdwebWalletChain, thirdwebConnectOptions } from "~~/services/thirdweb/client";

function LegacyRainbowKitConnectButton({ inlineMenu = false }: { inlineMenu?: boolean }) {
  const { targetNetwork } = useTargetNetwork();

  return (
    <ConnectButton.Custom>
      {({ account, chain, openConnectModal, mounted }) => {
        const connected = mounted && account && chain;

        return (
          <>
            {(() => {
              if (!connected) {
                return (
                  <button
                    className="btn btn-sm btn-curyo border-none"
                    onClick={openConnectModal}
                    type="button"
                    style={{ fontSize: "16px" }}
                  >
                    <span className="sm:hidden">Connect</span>
                    <span className="hidden sm:inline">Connect Wallet</span>
                  </button>
                );
              }

              if (chain.unsupported || chain.id !== targetNetwork.id) {
                return <WrongNetworkDropdown />;
              }

              return (
                <>
                  <AddressInfoDropdown
                    address={account.address as Address}
                    displayName={account.displayName}
                    ensAvatar={account.ensAvatar}
                    inlineMenu={inlineMenu}
                  />
                  <RevealBurnerPKModal />
                </>
              );
            })()}
          </>
        );
      }}
    </ConnectButton.Custom>
  );
}

/**
 * Custom connect button that prefers thirdweb on Celo/Celo Sepolia,
 * while preserving the legacy RainbowKit path as a fallback.
 */
export const RainbowKitCustomConnectButton = ({ inlineMenu = false }: { inlineMenu?: boolean }) => {
  const { targetNetwork } = useTargetNetwork();
  const { address, chain } = useAccount();
  const activeThirdwebAccount = useActiveAccount();
  const { connect, isConnecting } = useConnectModal();
  const { syncWalletToWagmi } = useThirdwebWagmiSync();

  const thirdwebEnabled = Boolean(thirdwebConnectOptions) && isThirdwebWalletChain(targetNetwork.id);

  const handleThirdwebConnect = useCallback(async () => {
    if (!thirdwebConnectOptions) {
      return;
    }

    try {
      const wallet = await connect(thirdwebConnectOptions);
      await syncWalletToWagmi(wallet);
    } catch {
      // User closed the modal or the wallet connection was interrupted.
    }
  }, [connect, syncWalletToWagmi]);

  if (!thirdwebEnabled) {
    return <LegacyRainbowKitConnectButton inlineMenu={inlineMenu} />;
  }

  const syncingThirdwebAccount = Boolean(activeThirdwebAccount && !address);

  if (!address || !chain) {
    return (
      <button
        className="btn btn-sm btn-curyo border-none"
        disabled={isConnecting || syncingThirdwebAccount}
        onClick={handleThirdwebConnect}
        type="button"
        style={{ fontSize: "16px" }}
      >
        <span className="sm:hidden">{isConnecting || syncingThirdwebAccount ? "..." : "Connect"}</span>
        <span className="hidden sm:inline">
          {isConnecting || syncingThirdwebAccount ? "Connecting..." : "Connect Wallet"}
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
