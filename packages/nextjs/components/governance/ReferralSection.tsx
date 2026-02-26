"use client";

import { useAccount } from "wagmi";
import { CheckIcon, ClipboardDocumentIcon, GiftIcon, LinkIcon, UserGroupIcon } from "@heroicons/react/24/outline";
import { InfoTooltip } from "~~/components/ui/InfoTooltip";
import { useScaffoldReadContract } from "~~/hooks/scaffold-eth";
import { useCopyToClipboard } from "~~/hooks/scaffold-eth/useCopyToClipboard";
import { useVoterIdNFT } from "~~/hooks/useVoterIdNFT";

interface ReferralSectionProps {
  className?: string;
}

export function ReferralSection({ className = "" }: ReferralSectionProps) {
  const { address } = useAccount();
  const { copyToClipboard, isCopiedToClipboard } = useCopyToClipboard();
  const { hasVoterId } = useVoterIdNFT(address);

  // Read referral amounts from HumanFaucet contract
  const { data: referralAmounts } = useScaffoldReadContract({
    contractName: "HumanFaucet",
    functionName: "getCurrentReferralAmounts",
  });

  // Read referral stats for this user
  const { data: referralStats } = useScaffoldReadContract({
    contractName: "HumanFaucet",
    functionName: "getReferralStats",
    args: [address],
  });

  const claimantBonus = referralAmounts?.[0];
  const referralReward = referralAmounts?.[1];
  const referralCount = referralStats?.[0] ?? 0n;
  const totalEarned = referralStats?.[1] ?? 0n;

  // Format token amount (6 decimals)
  const formatAmount = (amount: bigint | undefined) => {
    if (!amount) return "0";
    return (Number(amount) / 1e6).toLocaleString();
  };

  // Generate referral link
  const referralLink =
    typeof window !== "undefined" && address ? `${window.location.origin}/governance?ref=${address}` : "";

  const tweetText = `Join Curyo and claim free cREP tokens! Use my referral link to get a bonus: ${referralLink}`;

  const handleCopy = () => {
    copyToClipboard(referralLink);
  };

  if (!hasVoterId) {
    return (
      <div className={`surface-card rounded-2xl p-6 ${className}`}>
        <div className="flex items-center gap-2 mb-4">
          <UserGroupIcon className="w-6 h-6 text-primary" />
          <h3 className="text-lg font-semibold">Referral Program</h3>
          <InfoTooltip text="Get a Voter ID to unlock the referral program" />
        </div>
        <p className="text-base-content/60">
          Get a Voter ID to unlock your personal referral link and grow your reputation!
        </p>

        {/* Preview of rewards */}
        <div className="bg-primary/10 rounded-xl p-4 mt-4 space-y-2">
          <div className="flex items-center gap-2">
            <GiftIcon className="w-5 h-5 text-primary" />
            <span className="font-medium">Upcoming Tokens</span>
          </div>
          <ul className="text-base text-base-content/70 space-y-1 ml-7">
            <li>
              You receive: <span className="text-primary font-semibold">{formatAmount(referralReward)} cREP</span> per
              referral
            </li>
            <li>
              Your friend gets: <span className="text-primary font-semibold">{formatAmount(claimantBonus)} cREP</span>{" "}
              bonus
            </li>
          </ul>
        </div>
      </div>
    );
  }

  return (
    <div className={`surface-card rounded-2xl p-6 space-y-5 ${className}`}>
      {/* Header */}
      <div className="flex items-center gap-2">
        <UserGroupIcon className="w-6 h-6 text-primary" />
        <h3 className="text-lg font-semibold">Referral Program</h3>
        <InfoTooltip text="Share your link to gain reputation when friends join" />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-base-200 rounded-xl p-4">
          <p className="text-base text-base-content/60">Successful Referrals</p>
          <p className="text-2xl font-bold">{Number(referralCount)}</p>
        </div>
        <div className="bg-base-200 rounded-xl p-4">
          <p className="text-base text-base-content/60">Total Received</p>
          <p className="text-2xl font-bold text-primary">{formatAmount(totalEarned)} cREP</p>
        </div>
      </div>

      {/* Rewards Info */}
      <div className="bg-primary/10 rounded-xl p-4 space-y-2">
        <div className="flex items-center gap-2">
          <GiftIcon className="w-5 h-5 text-primary" />
          <span className="font-medium">Referral Tokens</span>
        </div>
        <ul className="text-base text-base-content/70 space-y-1 ml-7">
          <li>
            You receive: <span className="text-primary font-semibold">{formatAmount(referralReward)} cREP</span> per
            referral
          </li>
          <li>
            Your friend gets: <span className="text-primary font-semibold">{formatAmount(claimantBonus)} cREP</span>{" "}
            bonus
          </li>
        </ul>
      </div>

      {/* Referral Link */}
      <div className="space-y-3">
        <label className="text-base font-medium">Your Referral Link</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={referralLink}
            readOnly
            className="input input-bordered flex-1 bg-base-100 text-base font-mono"
          />
          <button onClick={handleCopy} className="btn btn-curyo btn-square" title="Copy to clipboard">
            {isCopiedToClipboard ? <CheckIcon className="w-5 h-5" /> : <ClipboardDocumentIcon className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Share Buttons */}
      <div className="flex gap-3">
        <a
          href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-outline flex-1 gap-2"
        >
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
          </svg>
          Share on X
        </a>
        <button onClick={handleCopy} className="btn btn-curyo flex-1 gap-2">
          <LinkIcon className="w-5 h-5" />
          {isCopiedToClipboard ? "Copied!" : "Copy Link"}
        </button>
      </div>
    </div>
  );
}
