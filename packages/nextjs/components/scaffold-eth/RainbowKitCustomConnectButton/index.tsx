"use client";

// @refresh reset
import { AddressInfoDropdown } from "./AddressInfoDropdown";
import { AddressQRCodeModal } from "./AddressQRCodeModal";
import { PortfolioModal } from "./PortfolioModal";
import { RevealBurnerPKModal } from "./RevealBurnerPKModal";
import { WrongNetworkDropdown } from "./WrongNetworkDropdown";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Address } from "viem";
import { hardhat } from "viem/chains";
import { Faucet } from "~~/components/scaffold-eth";
import { useTargetNetwork } from "~~/hooks/scaffold-eth/useTargetNetwork";

/**
 * Custom Wagmi Connect Button (watch balance + custom design)
 * @param inlineMenu When true, wallet + menu items render inline (e.g. in sidebar) instead of dropdown
 */
export const RainbowKitCustomConnectButton = ({ inlineMenu = false }: { inlineMenu?: boolean }) => {
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
                    className="btn btn-sm bg-white text-black hover:bg-gray-200 border-none"
                    onClick={openConnectModal}
                    type="button"
                    style={{ fontSize: "16px" }}
                  >
                    Connect Wallet
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
                  <AddressQRCodeModal address={account.address as Address} modalId="qrcode-modal" />
                  <PortfolioModal address={account.address as Address} modalId="portfolio-modal" />
                  <RevealBurnerPKModal />
                  {inlineMenu && chain?.id === hardhat.id && (
                    <div className="[&>div>label:first-child]:hidden">
                      <Faucet />
                    </div>
                  )}
                </>
              );
            })()}
          </>
        );
      }}
    </ConnectButton.Custom>
  );
};
