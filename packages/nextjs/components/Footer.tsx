import { hardhat } from "viem/chains";
import { FooterLinks } from "~~/components/FooterLinks";
import { FaucetTrigger } from "~~/components/scaffold-eth";
import { useTargetNetwork } from "~~/hooks/scaffold-eth/useTargetNetwork";

/**
 * Site footer
 */
export const Footer = () => {
  const { targetNetwork } = useTargetNetwork();
  const showFaucet = targetNetwork.id === hardhat.id;

  return (
    <div className="min-h-0 shrink-0 px-1 py-2 lg:py-3 mb-11 lg:mb-0">
      <div>
        <div className="fixed flex justify-between items-center w-full z-10 p-4 bottom-0 left-0 pointer-events-none">
          <div className="flex flex-col md:flex-row gap-2 pointer-events-auto">{showFaucet && <FaucetTrigger />}</div>
        </div>
      </div>
      <FooterLinks className="w-full" listClassName="w-full justify-center text-sm lg:text-base" />
    </div>
  );
};
