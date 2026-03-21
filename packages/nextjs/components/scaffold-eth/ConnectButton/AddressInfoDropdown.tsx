import { useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { getAddress } from "viem";
import { Address } from "viem";
import { hardhat } from "viem/chains";
import { useAccount } from "wagmi";
import { ArrowLeftOnRectangleIcon, Cog6ToothIcon, GiftIcon } from "@heroicons/react/24/outline";
import { BlockieAvatar } from "~~/components/scaffold-eth";
import { InfoTooltip } from "~~/components/ui/InfoTooltip";
import { useScaffoldReadContract } from "~~/hooks/scaffold-eth";
import { useTargetNetwork } from "~~/hooks/scaffold-eth/useTargetNetwork";
import { useCuryoDisconnect } from "~~/hooks/useCuryoDisconnect";
import { useFreeTransactionAllowance } from "~~/hooks/useFreeTransactionAllowance";
import { usePageVisibility } from "~~/hooks/usePageVisibility";
import { isENS } from "~~/utils/scaffold-eth/common";

type AddressInfoDropdownProps = {
  address: Address;
  displayName: string;
  ensAvatar?: string;
  blockExplorerAddressLink?: string;
  /** When true, render wallet + menu items inline (e.g. in sidebar) instead of dropdown */
  inlineMenu?: boolean;
  /** When true, render only the menu items list (for mobile menu) */
  menuItemsOnly?: boolean;
};

const getMenuItemClass = (showText: boolean) =>
  showText
    ? "flex items-center justify-start gap-3 px-3 py-2.5 rounded-xl transition-colors text-base-content/60 hover:text-base-content hover:bg-base-200 w-full text-base font-medium"
    : "flex items-center justify-start gap-3 px-4 py-3 rounded-xl transition-colors text-base-content/60 hover:text-base-content hover:bg-base-200 w-full text-base font-medium";

const WalletDetailsPanel = dynamic(() => import("./WalletDetailsPanel").then(mod => mod.WalletDetailsPanel), {
  loading: () => (
    <div className="px-4 pl-12 py-1 text-xs text-base-content/50">
      <span className="loading loading-spinner loading-xs text-primary" /> Loading...
    </div>
  ),
});

function formatCrepAmount(value: bigint | null | undefined) {
  if (value == null) return "—";
  return (Number(value) / 1e6).toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function FreeTransactionAllowanceText({ className }: { className?: string }) {
  const { isResolved, limit, remaining, verified } = useFreeTransactionAllowance();

  if (!isResolved || !verified) {
    return null;
  }

  return (
    <div className={`flex items-center gap-1 text-xs text-base-content/50 ${className ?? ""}`}>
      <span>
        {remaining}/{limit} free tx
      </span>
      <InfoTooltip text={`Verified wallets get ${limit} free app transactions. Add CELO for gas after that.`} />
    </div>
  );
}

function InlineWalletSummary({ address, crepBalance }: { address: Address; crepBalance: bigint | undefined }) {
  const [showDetails, setShowDetails] = useState(false);

  return (
    <>
      <div className="text-base text-base-content text-left px-4 pl-12">{formatCrepAmount(crepBalance)} cREP</div>
      <FreeTransactionAllowanceText className="px-4 pl-12 text-left" />
      <div className="px-4 pl-12 pt-1">
        <button
          type="button"
          onClick={() => setShowDetails(current => !current)}
          className="text-xs text-base-content/50 underline underline-offset-2 hover:text-base-content"
        >
          {showDetails ? "Hide details" : "Details"}
        </button>
      </div>
      {showDetails ? (
        <div className="pt-1">
          <WalletDetailsPanel address={address} crepBalance={crepBalance} />
        </div>
      ) : null}
    </>
  );
}

function MenuItems({
  disconnect,
  showText = false,
  showFaucet,
}: {
  disconnect: () => void;
  showText?: boolean;
  showFaucet?: boolean;
}) {
  const textClass = "inline";
  const menuItemClass = getMenuItemClass(showText);
  return (
    <>
      {showFaucet && (
        <li>
          <label htmlFor="faucet-modal" className={menuItemClass}>
            <GiftIcon className="w-6 h-6 shrink-0" />
            <span className={textClass}>Faucet</span>
          </label>
        </li>
      )}
      <li>
        <Link href="/settings" className={menuItemClass}>
          <Cog6ToothIcon className="w-6 h-6 shrink-0" />
          <span className={textClass}>Settings</span>
        </Link>
      </li>
      <li>
        <button
          className={`${menuItemClass} text-error hover:text-error`}
          type="button"
          onClick={() => void disconnect()}
        >
          <ArrowLeftOnRectangleIcon className="w-6 h-6 shrink-0" />
          <span className={textClass}>Disconnect</span>
        </button>
      </li>
    </>
  );
}

export const AddressInfoDropdown = ({
  address,
  ensAvatar,
  displayName,
  inlineMenu = false,
  menuItemsOnly = false,
}: AddressInfoDropdownProps) => {
  const isPageVisible = usePageVisibility();
  const disconnect = useCuryoDisconnect();
  const { chain } = useAccount();
  const { targetNetwork } = useTargetNetwork();
  const checkSumAddress = getAddress(address);
  const isLocalNetwork = targetNetwork.id === hardhat.id && chain?.id === hardhat.id;
  const showFaucet = isLocalNetwork;

  const { data: crepBalance } = useScaffoldReadContract({
    contractName: "CuryoReputation",
    functionName: "balanceOf",
    args: [address],
    watch: false,
    query: {
      staleTime: 60_000,
      refetchInterval: isPageVisible ? 60_000 : false,
    },
  });

  if (menuItemsOnly) {
    return (
      <>
        <li className="px-3 py-2">
          <div className="flex items-center gap-3">
            <BlockieAvatar address={checkSumAddress} size={24} ensImage={ensAvatar} />
            <div className="min-w-0">
              <p className="truncate text-base">
                {isENS(displayName) ? displayName : checkSumAddress?.slice(0, 6) + "..." + checkSumAddress?.slice(-4)}
              </p>
              <p className="text-sm text-base-content/60">{formatCrepAmount(crepBalance)} cREP</p>
              <FreeTransactionAllowanceText className="pt-0.5" />
            </div>
          </div>
        </li>
        <MenuItems disconnect={disconnect} showText={true} showFaucet={showFaucet} />
      </>
    );
  }

  const walletSummary = (
    <div className="w-full flex flex-col gap-0.5">
      <div className="flex items-center justify-start gap-3 px-4 py-3 w-full">
        <BlockieAvatar address={checkSumAddress} size={24} ensImage={ensAvatar} />
        <span className="text-base truncate">
          {isENS(displayName) ? displayName : checkSumAddress?.slice(0, 6) + "..." + checkSumAddress?.slice(-4)}
        </span>
      </div>
      {inlineMenu ? <InlineWalletSummary address={address} crepBalance={crepBalance} /> : null}
      {!inlineMenu ? (
        <>
          <div className="text-base text-base-content text-left px-4 pl-12">{formatCrepAmount(crepBalance)} cREP</div>
          <FreeTransactionAllowanceText className="px-4 pl-12 text-left" />
        </>
      ) : null}
    </div>
  );

  if (inlineMenu) {
    return (
      <div className="w-full flex flex-col">
        {walletSummary}
        <ul className="menu menu-vertical p-0 gap-0.5 w-full">
          <MenuItems disconnect={disconnect} showFaucet={showFaucet} />
        </ul>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center xl:items-start gap-0.5">
      <div className="flex items-center justify-center xl:justify-start gap-2 xl:px-2 py-1">
        <BlockieAvatar address={checkSumAddress} size={30} ensImage={ensAvatar} />
        <span className="text-base hidden lg:inline">
          {isENS(displayName) ? displayName : checkSumAddress?.slice(0, 6) + "..." + checkSumAddress?.slice(-4)}
        </span>
      </div>
      <div className="text-base text-base-content hidden lg:inline lg:px-2">{formatCrepAmount(crepBalance)} cREP</div>
      <FreeTransactionAllowanceText className="hidden lg:flex lg:px-2" />
    </div>
  );
};
