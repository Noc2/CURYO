import { useState } from "react";
import { NetworkOptions } from "./NetworkOptions";
import { getAddress } from "viem";
import { Address } from "viem";
import { hardhat } from "viem/chains";
import { useAccount, useDisconnect } from "wagmi";
import {
  ArrowLeftOnRectangleIcon,
  ArrowsRightLeftIcon,
  ChevronLeftIcon,
  EyeIcon,
  GiftIcon,
} from "@heroicons/react/24/outline";
import { BlockieAvatar } from "~~/components/scaffold-eth";
import { InfoTooltip } from "~~/components/ui/InfoTooltip";
import { useScaffoldReadContract } from "~~/hooks/scaffold-eth";
import { useTargetNetwork } from "~~/hooks/scaffold-eth/useTargetNetwork";
import { useActiveVotesWithDeadlines } from "~~/hooks/useActiveVotesWithDeadlines";
import { useAllClaimableRewards } from "~~/hooks/useAllClaimableRewards";
import { useClaimAll } from "~~/hooks/useClaimAll";
import { useSubmissionStakes } from "~~/hooks/useSubmissionStakes";
import { useVotingStakes } from "~~/hooks/useVotingStakes";
import { getTargetNetworks } from "~~/utils/scaffold-eth";
import { isENS } from "~~/utils/scaffold-eth/common";

const BURNER_WALLET_ID = "burnerWallet";

const allowedNetworks = getTargetNetworks();

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

function MenuItems({
  selectingNetwork,
  setSelectingNetwork,
  disconnect,
  connector,
  showBackWhenSelectingNetwork,
  showText = false,
  showFaucet,
}: {
  selectingNetwork: boolean;
  setSelectingNetwork: (v: boolean) => void;
  disconnect: () => void;
  connector: { id: string } | undefined;
  showBackWhenSelectingNetwork?: boolean;
  showText?: boolean;
  showFaucet?: boolean;
}) {
  const textClass = "inline";
  const menuItemClass = getMenuItemClass(showText);
  return (
    <>
      {showBackWhenSelectingNetwork && selectingNetwork ? (
        <li>
          <button className={menuItemClass} type="button" onClick={() => setSelectingNetwork(false)}>
            <ChevronLeftIcon className="w-6 h-6 shrink-0" />
            <span className={textClass}>Back</span>
          </button>
        </li>
      ) : null}
      <NetworkOptions hidden={!selectingNetwork} />
      {allowedNetworks.length > 1 ? (
        <li className={selectingNetwork ? "hidden" : ""}>
          <button className={menuItemClass} type="button" onClick={() => setSelectingNetwork(true)}>
            <ArrowsRightLeftIcon className="w-6 h-6 shrink-0" />
            <span className={textClass}>Switch Network</span>
          </button>
        </li>
      ) : null}
      {connector?.id === BURNER_WALLET_ID ? (
        <li>
          <label
            htmlFor="reveal-burner-pk-modal"
            className={`${menuItemClass} text-error hover:text-error`}
            onClick={e => e.stopPropagation()}
          >
            <EyeIcon className="w-6 h-6 shrink-0" />
            <span className={textClass}>Reveal Private Key</span>
          </label>
        </li>
      ) : null}
      {showFaucet && (
        <li className={selectingNetwork ? "hidden" : ""}>
          <label htmlFor="faucet-modal" className={menuItemClass}>
            <GiftIcon className="w-6 h-6 shrink-0" />
            <span className={textClass}>Faucet</span>
          </label>
        </li>
      )}
      <li className={selectingNetwork ? "hidden" : ""}>
        <button className={`${menuItemClass} text-error hover:text-error`} type="button" onClick={() => disconnect()}>
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
  const { disconnect } = useDisconnect();
  const { connector, chain } = useAccount();
  const { targetNetwork } = useTargetNetwork();
  const checkSumAddress = getAddress(address);
  const isLocalNetwork = targetNetwork.id === hardhat.id && chain?.id === hardhat.id;
  const showFaucet = isLocalNetwork;

  const { claimableItems, totalClaimable, activeStake, refetch: refetchClaimable } = useAllClaimableRewards();
  const { totalSubmissionStake } = useSubmissionStakes(address);
  const { activeStaked: votingStaked } = useVotingStakes(address);
  const { claimAll, isClaiming, progress } = useClaimAll();
  const { earliestDeadline, earliestReveal, hasPendingReveals } = useActiveVotesWithDeadlines(address);

  const claimableFormatted =
    totalClaimable > 0n ? (Number(totalClaimable) / 1e6).toLocaleString(undefined, { maximumFractionDigits: 0 }) : "";

  const activeFormatted =
    activeStake > 0n ? (Number(activeStake) / 1e6).toLocaleString(undefined, { maximumFractionDigits: 0 }) : "";

  const handleClaimAll = () => {
    claimAll(claimableItems, () => refetchClaimable());
  };

  const { data: crepBalance } = useScaffoldReadContract({
    contractName: "CuryoReputation",
    functionName: "balanceOf",
    args: [address],
  });
  const crepFormatted =
    crepBalance != null ? (Number(crepBalance) / 1e6).toLocaleString(undefined, { maximumFractionDigits: 0 }) : "—";

  // Frontend operator stake
  const { data: frontendInfo } = useScaffoldReadContract({
    contractName: "FrontendRegistry",
    functionName: "getFrontendInfo",
    args: [address],
  });
  const frontendStake = frontendInfo ? Number(frontendInfo[1]) / 1e6 : 0;

  // Combine all staked amounts (voting + submissions + frontend)
  const totalStaked = votingStaked + totalSubmissionStake + frontendStake;
  const stakedFormatted = totalStaked.toLocaleString(undefined, { maximumFractionDigits: 0 });

  // Build tooltip showing stake breakdown
  const stakeParts: string[] = [];
  if (totalSubmissionStake > 0) stakeParts.push(`${totalSubmissionStake} cREP submissions`);
  if (votingStaked > 0) {
    let votingLabel = `${votingStaked} cREP voting`;
    if (earliestReveal) votingLabel += ` · reveals in ${earliestReveal}`;
    else if (hasPendingReveals) votingLabel += ` · pending reveal`;
    stakeParts.push(votingLabel);
  }
  if (frontendStake > 0) stakeParts.push(`${frontendStake} cREP frontend`);
  const stakeTooltip = stakeParts.join(" · ");

  const [selectingNetwork, setSelectingNetwork] = useState(false);

  if (menuItemsOnly) {
    return (
      <MenuItems
        selectingNetwork={selectingNetwork}
        setSelectingNetwork={setSelectingNetwork}
        disconnect={disconnect}
        connector={connector}
        showText={true}
        showFaucet={showFaucet}
      />
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
      <div className="text-base text-base-content text-left px-4 pl-12">{crepFormatted} cREP</div>
      {totalStaked > 0 && (
        <div className="flex items-center justify-start gap-1 text-base text-base-content px-4 pl-12">
          {stakedFormatted} Staked
          <InfoTooltip text={stakeTooltip} position="bottom" />
        </div>
      )}
      {activeStake > 0n && (
        <div
          className="tooltip tooltip-top text-sm text-base-content/40 text-left px-4 pl-12 cursor-help"
          data-tip={
            earliestDeadline
              ? `Staked in active rounds. Votes revealed each epoch (~1h). If unsettled after 7 days, stakes are refunded.`
              : "Staked in active rounds. If unsettled after 7 days, stakes are refunded."
          }
        >
          {activeFormatted} cREP in active votes
        </div>
      )}
      {totalClaimable > 0n && (
        <div className="text-left px-4 pl-12 mt-1">
          <button onClick={handleClaimAll} disabled={isClaiming} className="btn btn-primary btn-xs text-white">
            {isClaiming ? `Claiming ${progress.current}/${progress.total}...` : `Claim ${claimableFormatted}`}
          </button>
        </div>
      )}
    </div>
  );

  if (inlineMenu) {
    return (
      <div className="w-full flex flex-col">
        {walletSummary}
        <ul className="menu menu-vertical p-0 gap-0.5 w-full">
          <MenuItems
            selectingNetwork={selectingNetwork}
            setSelectingNetwork={setSelectingNetwork}
            disconnect={disconnect}
            connector={connector}
            showBackWhenSelectingNetwork
            showFaucet={showFaucet}
          />
        </ul>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center xl:items-start gap-0.5">
      <div className="flex items-center justify-center xl:justify-start gap-2 xl:px-2 py-1">
        <BlockieAvatar address={checkSumAddress} size={30} ensImage={ensAvatar} />
        <span className="text-base hidden xl:inline">
          {isENS(displayName) ? displayName : checkSumAddress?.slice(0, 6) + "..." + checkSumAddress?.slice(-4)}
        </span>
      </div>
      <span className="text-base text-base-content hidden xl:inline xl:px-2">{crepFormatted} cREP</span>
      {totalStaked > 0 && (
        <span className="text-base text-base-content hidden xl:inline xl:px-2 items-center gap-1">
          {stakedFormatted} Staked
          <InfoTooltip text={stakeTooltip} position="top" />
        </span>
      )}
      {activeStake > 0n && (
        <span
          className="tooltip tooltip-right text-sm text-base-content/40 hidden xl:inline xl:px-2 cursor-help"
          data-tip={
            earliestDeadline
              ? `Staked in active rounds. Votes revealed each epoch (~1h). If unsettled after 7 days, stakes are refunded.`
              : "Staked in active rounds. If unsettled after 7 days, stakes are refunded."
          }
        >
          {activeFormatted} cREP in active votes
        </span>
      )}
      {totalClaimable > 0n && (
        <span className="hidden xl:inline xl:px-2 mt-1">
          <button onClick={handleClaimAll} disabled={isClaiming} className="btn btn-primary btn-xs text-white">
            {isClaiming ? `Claiming ${progress.current}/${progress.total}...` : `Claim ${claimableFormatted}`}
          </button>
        </span>
      )}
    </div>
  );
};
