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
import { useActiveVotesWithDeadlines } from "~~/hooks/useActiveVotesWithDeadlines";
import { useCuryoDisconnect } from "~~/hooks/useCuryoDisconnect";
import { useFreeTransactionAllowance } from "~~/hooks/useFreeTransactionAllowance";
import { usePageVisibility } from "~~/hooks/usePageVisibility";
import { useSubmissionStakes } from "~~/hooks/useSubmissionStakes";
import { useVotingStakes } from "~~/hooks/useVotingStakes";
import { getWalletDisplayLiquidMicro, useWalletDisplaySummary } from "~~/hooks/useWalletDisplaySummary";
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
  /** When true, render the connected wallet as a compact avatar-only header affordance */
  compact?: boolean;
};

const getMenuItemClass = (showText: boolean) =>
  showText
    ? "flex items-center justify-start gap-3 px-3 py-2.5 rounded-xl transition-colors text-base-content/60 hover:text-base-content hover:bg-base-200 w-full text-base font-medium"
    : "flex items-center justify-start gap-3 px-4 py-3 rounded-xl transition-colors text-base-content/60 hover:text-base-content hover:bg-base-200 w-full text-base font-medium";

function formatCrepAmount(value: bigint | null | undefined) {
  if (value == null) return "—";
  return (Number(value) / 1e6).toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function toMicroUnits(value: number) {
  return BigInt(Math.round(value * 1e6));
}

function useWalletSummaryData(address: Address, crepBalance: bigint | undefined) {
  const isPageVisible = usePageVisibility();
  const { totalSubmissionStake } = useSubmissionStakes(address);
  const { activeStaked: votingStaked } = useVotingStakes(address);
  const { votes: activeVotes, earliestReveal, hasPendingReveals } = useActiveVotesWithDeadlines(address);

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

  const fallbackVotingStakedMicro = activeVotes.reduce((sum, vote) => sum + BigInt(vote.stake), 0n);
  const indexedVotingStakedMicro = toMicroUnits(votingStaked);
  const votingStakedMicro =
    indexedVotingStakedMicro > fallbackVotingStakedMicro ? indexedVotingStakedMicro : fallbackVotingStakedMicro;

  const summary = useWalletDisplaySummary(
    address,
    crepBalance === undefined
      ? null
      : {
          liquidMicro: crepBalance,
          votingStakedMicro,
          submissionStakedMicro: toMicroUnits(totalSubmissionStake),
          frontendStakedMicro: frontendInfo?.[1] ?? 0n,
        },
  );

  return {
    activeVotes,
    earliestReveal,
    hasPendingReveals,
    liquidBalance: getWalletDisplayLiquidMicro(summary, crepBalance),
    summary,
  };
}

function FreeTransactionAllowanceText({ className }: { className?: string }) {
  const { isResolved, limit, remaining, verified } = useFreeTransactionAllowance();

  if (!isResolved || !verified) {
    return null;
  }

  return (
    <div className={`flex items-center gap-1.5 text-sm font-medium leading-5 text-base-content/62 ${className ?? ""}`}>
      <span className="tabular-nums">
        {remaining}/{limit}
      </span>
      <span className="text-base-content/48">free tx</span>
      <InfoTooltip text={`Verified wallets get ${limit} free app transactions. Add CELO for gas after that.`} />
    </div>
  );
}

function WalletSummaryDetails({
  address,
  crepBalance,
  balanceClassName,
  freeTxClassName,
  stakeClassName,
}: {
  address: Address;
  crepBalance: bigint | undefined;
  balanceClassName: string;
  freeTxClassName: string;
  stakeClassName: string;
}) {
  const { activeVotes, earliestReveal, hasPendingReveals, liquidBalance, summary } = useWalletSummaryData(
    address,
    crepBalance,
  );
  const totalStakedMicro = summary?.totalStakedMicro ?? 0n;
  const showStaked = totalStakedMicro > 0n || activeVotes.length > 0;
  const submissionStakedMicro = summary?.submissionStakedMicro ?? 0n;
  const frontendStakedMicro = summary?.frontendStakedMicro ?? 0n;
  const votingStakedMicro = summary?.votingStakedMicro ?? 0n;

  const stakeParts: string[] = [];
  if (submissionStakedMicro > 0n) {
    stakeParts.push(`${formatCrepAmount(submissionStakedMicro)} cREP submissions`);
  }
  if (votingStakedMicro > 0n) {
    let votingLabel = `${formatCrepAmount(votingStakedMicro)} cREP voting`;
    if (earliestReveal) {
      votingLabel += ` · reveals in ${earliestReveal}`;
    } else if (hasPendingReveals) {
      votingLabel += " · pending reveal";
    }
    stakeParts.push(votingLabel);
  }
  if (frontendStakedMicro > 0n) {
    stakeParts.push(`${formatCrepAmount(frontendStakedMicro)} cREP frontend`);
  }
  const stakeTooltip = stakeParts.join(" · ");

  return (
    <>
      <div className={balanceClassName}>
        <span className="tabular-nums">{formatCrepAmount(liquidBalance)}</span>{" "}
        <span className="text-base-content/52">cREP</span>
      </div>
      {showStaked ? (
        <div className={stakeClassName}>
          <span className="tabular-nums">{formatCrepAmount(totalStakedMicro)}</span>
          <span className="text-base-content/52">Staked</span>
          {stakeTooltip ? <InfoTooltip text={stakeTooltip} position="bottom" /> : null}
        </div>
      ) : null}
      <FreeTransactionAllowanceText className={freeTxClassName} />
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
          <span className={textClass}>Sign Out</span>
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
  compact = false,
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
        <li className="px-3 py-2" data-testid="wallet-connected">
          <div className="flex items-start gap-3">
            <BlockieAvatar address={checkSumAddress} size={24} ensImage={ensAvatar} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium leading-5 text-base-content/72">
                {isENS(displayName) ? displayName : checkSumAddress?.slice(0, 6) + "..." + checkSumAddress?.slice(-4)}
              </p>
              <WalletSummaryDetails
                address={address}
                crepBalance={crepBalance}
                balanceClassName="text-sm font-medium leading-5 text-base-content/78"
                freeTxClassName="text-left"
                stakeClassName="flex items-center gap-1.5 text-sm font-medium leading-5 text-base-content/68"
              />
            </div>
          </div>
        </li>
        <MenuItems disconnect={disconnect} showText={true} showFaucet={showFaucet} />
      </>
    );
  }

  const walletSummary = (
    <div className="w-full px-4 py-3">
      <div className="flex items-start gap-3">
        <BlockieAvatar address={checkSumAddress} size={24} ensImage={ensAvatar} />
        <div className="min-w-0 flex flex-1 flex-col gap-1">
          <span className="truncate text-sm font-medium leading-5 text-base-content/72">
            {isENS(displayName) ? displayName : checkSumAddress?.slice(0, 6) + "..." + checkSumAddress?.slice(-4)}
          </span>
          <WalletSummaryDetails
            address={address}
            crepBalance={crepBalance}
            balanceClassName="text-left text-sm font-medium leading-5 text-base-content/78"
            freeTxClassName="text-left"
            stakeClassName="flex items-center justify-start gap-1.5 text-left text-sm font-medium leading-5 text-base-content/68"
          />
        </div>
      </div>
    </div>
  );

  if (inlineMenu) {
    return (
      <div className="w-full flex flex-col" data-testid="wallet-connected">
        {walletSummary}
        <ul className="menu menu-vertical p-0 gap-0.5 w-full">
          <MenuItems disconnect={disconnect} showFaucet={showFaucet} />
        </ul>
      </div>
    );
  }

  if (compact) {
    return (
      <div className="flex items-center justify-center py-1" data-testid="wallet-connected">
        <BlockieAvatar address={checkSumAddress} size={30} ensImage={ensAvatar} />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center xl:items-start gap-0.5" data-testid="wallet-connected">
      <div className="flex items-center justify-center xl:justify-start gap-2 xl:px-2 py-1">
        <BlockieAvatar address={checkSumAddress} size={30} ensImage={ensAvatar} />
        <span className="text-base hidden lg:inline">
          {isENS(displayName) ? displayName : checkSumAddress?.slice(0, 6) + "..." + checkSumAddress?.slice(-4)}
        </span>
      </div>
      <WalletSummaryDetails
        address={address}
        crepBalance={crepBalance}
        balanceClassName="hidden lg:inline lg:px-2 text-sm font-medium leading-5 text-base-content/78"
        freeTxClassName="hidden lg:flex lg:px-2"
        stakeClassName="hidden lg:flex lg:px-2 items-center gap-1.5 text-sm font-medium leading-5 text-base-content/68"
      />
    </div>
  );
};
