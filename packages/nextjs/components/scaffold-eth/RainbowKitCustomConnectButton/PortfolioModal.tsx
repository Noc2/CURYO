"use client";

import { Address } from "viem";
import { useScaffoldEventHistory, useScaffoldReadContract } from "~~/hooks/scaffold-eth";
import { useClaimReward } from "~~/hooks/useClaimReward";
import { notification } from "~~/utils/scaffold-eth";

type PortfolioModalProps = {
  address: Address;
  modalId: string;
};

export const PortfolioModal = ({ address, modalId }: PortfolioModalProps) => {
  const { claimReward, isClaiming } = useClaimReward();

  const { data: commitEvents, isLoading: commitsLoading } = useScaffoldEventHistory({
    contractName: "RoundVotingEngine",
    eventName: "VoteCommitted",
    fromBlock: 0n,
    filters: { voter: address },
    watch: true,
  } as any);

  const { data: settledEvents, isLoading: settledLoading } = useScaffoldEventHistory({
    contractName: "RoundVotingEngine",
    eventName: "RoundSettled",
    fromBlock: 0n,
    watch: true,
  } as any);

  const { data: balance } = useScaffoldReadContract({
    contractName: "CuryoReputation",
    functionName: "balanceOf",
    args: [address],
  });

  const handleClaim = async (contentId: bigint, roundId: bigint) => {
    const success = await claimReward(contentId, roundId);
    if (success) {
      notification.success("Reward claimed!");
    }
  };

  const formattedBalance = balance
    ? (Number(balance) / 1e6).toLocaleString(undefined, { maximumFractionDigits: 0 })
    : "0";

  // Count settled rounds where user participated
  const settledRoundKeys = new Set(
    settledEvents
      ?.map(e => {
        const args = e.args as { contentId?: bigint; roundId?: bigint };
        if (args.contentId === undefined || args.roundId === undefined) return null;
        return `${args.contentId.toString()}-${args.roundId.toString()}`;
      })
      .filter((key): key is string => Boolean(key)) ?? [],
  );
  const settledVoteCount =
    commitEvents?.filter(e => {
      const args = e.args as { contentId?: bigint; roundId?: bigint };
      if (args.contentId === undefined || args.roundId === undefined) return false;
      return settledRoundKeys.has(`${args.contentId.toString()}-${args.roundId.toString()}`);
    }).length ?? 0;

  const isLoading = commitsLoading || settledLoading;

  return (
    <div>
      <input type="checkbox" id={modalId} className="modal-toggle" />
      <label htmlFor={modalId} className="modal cursor-pointer">
        <label className="modal-box relative max-w-md">
          {/* dummy input to capture event onclick on modal box */}
          <input className="h-0 w-0 absolute top-0 left-0" />
          <label htmlFor={modalId} className="btn btn-ghost btn-sm btn-circle absolute right-3 top-3">
            ✕
          </label>

          <h3 className="text-lg font-bold mb-4">Portfolio</h3>

          {/* Stats */}
          <div className="bg-base-300 rounded-xl p-4 mb-4">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <p className="text-xl font-bold tabular-nums">{formattedBalance}</p>
                <p className="text-base text-base-content/50">cREP</p>
              </div>
              <div>
                <p className="text-xl font-bold tabular-nums">{commitEvents?.length ?? 0}</p>
                <p className="text-base text-base-content/50">Votes</p>
              </div>
              <div>
                <p className="text-xl font-bold tabular-nums">{settledVoteCount}</p>
                <p className="text-base text-base-content/50">Settled</p>
              </div>
            </div>
          </div>

          {/* Vote History */}
          <div>
            <h4 className="text-base font-semibold mb-2">Vote History</h4>
            {isLoading ? (
              <div className="flex justify-center py-8">
                <span className="loading loading-spinner loading-md text-primary"></span>
              </div>
            ) : commitEvents && commitEvents.length > 0 ? (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {commitEvents.map((event, idx) => {
                  const args = event.args as { contentId?: bigint; roundId?: bigint; stake?: bigint };
                  const contentId = args.contentId;
                  const roundId = args.roundId;
                  const stake = args.stake ? (Number(args.stake) / 1e6).toFixed(0) : "?";

                  const isSettled =
                    contentId !== undefined &&
                    roundId !== undefined &&
                    settledRoundKeys.has(`${contentId.toString()}-${roundId.toString()}`);

                  return (
                    <div key={idx} className="bg-base-300 rounded-lg p-3 flex items-center justify-between">
                      <div>
                        <p className="text-base font-medium">Content #{contentId?.toString() ?? "?"}</p>
                        <p className="text-base text-base-content/50">
                          {stake} cREP · Round #{roundId?.toString() ?? "?"}
                        </p>
                      </div>
                      {isSettled ? (
                        <button
                          onClick={() => contentId && roundId && handleClaim(contentId, roundId)}
                          className="text-base font-medium px-2 py-1 rounded-full bg-success/10 text-success hover:bg-success/20 transition-colors disabled:opacity-40"
                          disabled={isClaiming || !contentId || !roundId}
                        >
                          {isClaiming ? <span className="loading loading-spinner loading-xs"></span> : "Claim"}
                        </button>
                      ) : (
                        <span className="text-base font-medium px-2 py-1 rounded-full bg-warning/10 text-warning">
                          Active
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8 text-base-content/40 text-base">No votes yet. Start swiping!</div>
            )}
          </div>
        </label>
      </label>
    </div>
  );
};
