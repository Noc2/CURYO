import React from "react";
import Link from "next/link";
import { hardhat } from "viem/chains";
import { Faucet } from "~~/components/scaffold-eth";
import { useTargetNetwork } from "~~/hooks/scaffold-eth/useTargetNetwork";

/**
 * Site footer
 */
export const Footer = () => {
  const { targetNetwork } = useTargetNetwork();
  const showFaucet = targetNetwork.id === hardhat.id;

  return (
    <div className="min-h-0 shrink-0 py-5 px-1 mb-11 lg:mb-0">
      <div>
        <div className="fixed flex justify-between items-center w-full z-10 p-4 bottom-0 left-0 pointer-events-none">
          <div className="flex flex-col md:flex-row gap-2 pointer-events-auto">{showFaucet && <Faucet />}</div>
        </div>
      </div>
      <div className="w-full">
        <ul className="menu menu-horizontal w-full">
          <div className="flex justify-center items-center gap-2 text-base w-full">
            <div className="text-center">
              <Link href="/legal/terms" className="link">
                Terms
              </Link>
            </div>
            <span>·</span>
            <div className="text-center">
              <Link href="/legal/privacy" className="link">
                Privacy
              </Link>
            </div>
            <span>·</span>
            <div className="text-center">
              <Link href="/legal/imprint" className="link">
                Imprint
              </Link>
            </div>
          </div>
        </ul>
      </div>
    </div>
  );
};
