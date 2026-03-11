import Link from "next/link";
import { getAddress } from "viem";
import { Address } from "viem";
import { hardhat } from "viem/chains";
import { useAccount, useDisconnect } from "wagmi";
import { ArrowLeftOnRectangleIcon, Cog6ToothIcon, EyeIcon, GiftIcon } from "@heroicons/react/24/outline";
import { BlockieAvatar } from "~~/components/scaffold-eth";
import { InfoTooltip } from "~~/components/ui/InfoTooltip";
import { useScaffoldReadContract } from "~~/hooks/scaffold-eth";
import { useTargetNetwork } from "~~/hooks/scaffold-eth/useTargetNetwork";
import { useActiveVotesWithDeadlines } from "~~/hooks/useActiveVotesWithDeadlines";
import { useAllClaimableRewards } from "~~/hooks/useAllClaimableRewards";
import { useClaimAll } from "~~/hooks/useClaimAll";
import { useManualRevealVotes } from "~~/hooks/useManualRevealVotes";
import { useSubmissionStakes } from "~~/hooks/useSubmissionStakes";
import { useVotingStakes } from "~~/hooks/useVotingStakes";
import { isENS } from "~~/utils/scaffold-eth/common";

const BURNER_WALLET_ID = "burnerWallet";

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

function ExtendedWalletSummary({ address }: { address: Address }) {
  const { claimableItems, totalClaimable, refetch: refetchClaimable } = useAllClaimableRewards();
  const { totalSubmissionStake } = useSubmissionStakes(address);
  const { activeStaked: votingStaked } = useVotingStakes(address);
  const { claimAll, isClaiming, progress } = useClaimAll();
  const { votes: activeVotes, earliestReveal, hasPendingReveals } = useActiveVotesWithDeadlines(address);
  const { readyCount: manualRevealReadyCount } = useManualRevealVotes(address);
  const showManualRevealLink = manualRevealReadyCount > 0;

  const claimableFormatted =
    totalClaimable > 0n ? (Number(totalClaimable) / 1e6).toLocaleString(undefined, { maximumFractionDigits: 0 }) : "";

  const handleClaimAll = () => {
    claimAll(claimableItems, () => refetchClaimable());
  };

  const { data: frontendInfo } = useScaffoldReadContract({
    contractName: "FrontendRegistry",
    functionName: "getFrontendInfo",
    args: [address],
    watch: false,
    query: {
      staleTime: 30_000,
      refetchInterval: 30_000,
    },
  });
  const frontendStake = frontendInfo ? Number(frontendInfo[1]) / 1e6 : 0;

  const fallbackVotingStaked = activeVotes.reduce((sum, vote) => sum + Number(vote.stake) / 1e6, 0);
  const effectiveVotingStaked = Math.max(votingStaked, fallbackVotingStaked);
  const totalStaked = effectiveVotingStaked + totalSubmissionStake + frontendStake;
  const stakedFormatted = totalStaked.toLocaleString(undefined, { maximumFractionDigits: 0 });
  const shouldShowStaked = totalStaked > 0 || activeVotes.length > 0;

  const stakeParts: string[] = [];
  if (totalSubmissionStake > 0) stakeParts.push(`${totalSubmissionStake} cREP submissions`);
  if (effectiveVotingStaked > 0) {
    let votingLabel = `${effectiveVotingStaked} cREP voting`;
    if (earliestReveal) votingLabel += ` · reveals in ${earliestReveal}`;
    else if (showManualRevealLink || hasPendingReveals) votingLabel += ` · pending reveal`;
    stakeParts.push(votingLabel);
  }
  if (frontendStake > 0) stakeParts.push(`${frontendStake} cREP frontend`);
  const stakeTooltip = stakeParts.join(" · ");

  return (
    <>
      {showManualRevealLink ? (
        <div className="text-left px-4 pl-12">
          <Link
            href="/vote/reveal"
            className="text-xs text-base-content/50 hover:text-base-content underline underline-offset-2"
          >
            Reveal my vote
          </Link>
        </div>
      ) : null}
      {shouldShowStaked && (
        <div className="flex items-center justify-start gap-1 text-base text-base-content px-4 pl-12">
          {stakedFormatted} Staked
          <InfoTooltip text={stakeTooltip} position="bottom" />
        </div>
      )}
      {totalClaimable > 0n && (
        <div className="text-left px-4 pl-12 mt-1">
          <button onClick={handleClaimAll} disabled={isClaiming} className="btn btn-primary btn-xs text-white">
            {isClaiming ? `Claiming ${progress.current}/${progress.total}...` : `Claim ${claimableFormatted}`}
          </button>
        </div>
      )}
    </>
  );
}

function MenuItems({
  disconnect,
  connector,
  showText = false,
  showFaucet,
}: {
  disconnect: () => void;
  connector: { id: string } | undefined;
  showText?: boolean;
  showFaucet?: boolean;
}) {
  const textClass = "inline";
  const menuItemClass = getMenuItemClass(showText);
  return (
    <>
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

  const { data: crepBalance } = useScaffoldReadContract({
    contractName: "CuryoReputation",
    functionName: "balanceOf",
    args: [address],
    watch: false,
    query: {
      staleTime: 30_000,
      refetchInterval: 30_000,
    },
  });
  const crepFormatted =
    crepBalance != null ? (Number(crepBalance) / 1e6).toLocaleString(undefined, { maximumFractionDigits: 0 }) : "—";

  if (menuItemsOnly) {
    return <MenuItems disconnect={disconnect} connector={connector} showText={true} showFaucet={showFaucet} />;
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
      {inlineMenu ? <ExtendedWalletSummary address={address} /> : null}
    </div>
  );

  if (inlineMenu) {
    return (
      <div className="w-full flex flex-col">
        {walletSummary}
        <ul className="menu menu-vertical p-0 gap-0.5 w-full">
          <MenuItems disconnect={disconnect} connector={connector} showFaucet={showFaucet} />
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
    </div>
  );
};
