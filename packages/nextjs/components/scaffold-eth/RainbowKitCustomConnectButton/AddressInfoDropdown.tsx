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
import { usePageVisibility } from "~~/hooks/usePageVisibility";
import { useSubmissionStakes } from "~~/hooks/useSubmissionStakes";
import { useVotingStakes } from "~~/hooks/useVotingStakes";
import { useWalletDisplaySummary } from "~~/hooks/useWalletDisplaySummary";
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

function formatCrepAmount(value: bigint | null | undefined) {
  if (value == null) return "—";
  return (Number(value) / 1e6).toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function InlineWalletSummary({ address, crepBalance }: { address: Address; crepBalance: bigint | undefined }) {
  const isPageVisible = usePageVisibility();
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
      staleTime: 60_000,
      refetchInterval: isPageVisible ? 60_000 : false,
    },
  });

  const fallbackVotingStaked = activeVotes.reduce((sum, vote) => sum + Number(vote.stake) / 1e6, 0);
  const effectiveVotingStaked = Math.max(votingStaked, fallbackVotingStaked);
  const summary = useWalletDisplaySummary(
    address,
    crepBalance === undefined
      ? null
      : {
          liquidMicro: crepBalance,
          votingStakedMicro: BigInt(Math.round(effectiveVotingStaked * 1e6)),
          submissionStakedMicro: BigInt(Math.round(totalSubmissionStake * 1e6)),
          frontendStakedMicro: frontendInfo?.[1] ?? 0n,
        },
  );
  const shouldShowStaked = (summary?.totalStakedMicro ?? 0n) > 0n || activeVotes.length > 0;

  const stakeParts: string[] = [];
  const submissionStake = Number(summary?.submissionStakedMicro ?? 0n) / 1e6;
  const frontendStake = Number(summary?.frontendStakedMicro ?? 0n) / 1e6;
  const votingStake = Number(summary?.votingStakedMicro ?? 0n) / 1e6;

  if (submissionStake > 0) stakeParts.push(`${submissionStake} cREP submissions`);
  if (votingStake > 0) {
    let votingLabel = `${votingStake} cREP voting`;
    if (earliestReveal) votingLabel += ` · reveals in ${earliestReveal}`;
    else if (showManualRevealLink || hasPendingReveals) votingLabel += ` · pending reveal`;
    stakeParts.push(votingLabel);
  }
  if (frontendStake > 0) stakeParts.push(`${frontendStake} cREP frontend`);
  const stakeTooltip = stakeParts.join(" · ");

  return (
    <>
      <div className="text-base text-base-content text-left px-4 pl-12">
        {formatCrepAmount(summary?.liquidMicro)} cREP
      </div>
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
          {formatCrepAmount(summary?.totalStakedMicro)} Staked
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
  const isPageVisible = usePageVisibility();
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
      staleTime: 60_000,
      refetchInterval: isPageVisible ? 60_000 : false,
    },
  });
  const crepFormatted = crepBalance != null ? formatCrepAmount(crepBalance) : "—";

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
      {inlineMenu ? <InlineWalletSummary address={address} crepBalance={crepBalance} /> : null}
      {!inlineMenu ? (
        <div className="text-base text-base-content text-left px-4 pl-12">{crepFormatted} cREP</div>
      ) : null}
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
