"use client";

import Link from "next/link";
import { useAccount } from "wagmi";
import { ArrowLeftIcon } from "@heroicons/react/24/outline";
import { CuryoConnectButton } from "~~/components/scaffold-eth";
import { InfoTooltip } from "~~/components/ui/InfoTooltip";
import { RATE_ROUTE, buildRateContentHref } from "~~/constants/routes";
import { formatTimeRemaining } from "~~/hooks/useActiveVotesWithDeadlines";
import { ManualRevealVote, useManualRevealVotes } from "~~/hooks/useManualRevealVotes";

function RevealVoteCard({
  vote,
  isPending,
  onReveal,
}: {
  vote: ManualRevealVote;
  isPending: boolean;
  onReveal: (vote: ManualRevealVote) => Promise<boolean>;
}) {
  const stake = (Number(vote.stake) / 1e6).toLocaleString(undefined, { maximumFractionDigits: 0 });

  return (
    <div className="surface-card rounded-lg p-5 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
      <div className="space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            href={buildRateContentHref(vote.contentId)}
            className="text-lg font-semibold hover:text-primary transition-colors"
          >
            Content #{vote.contentId.toString()}
          </Link>
          <span className="text-sm text-base-content/60">Round #{vote.roundId.toString()}</span>
        </div>
        <div className="text-sm text-base-content/75">
          {stake} HREP
          <span className="mx-2 text-base-content/60">·</span>
          Epoch {vote.epochIndex + 1}
        </div>
      </div>
      {vote.isReady ? (
        <button className="btn btn-primary min-w-36" disabled={isPending} onClick={() => onReveal(vote)}>
          {isPending ? "Revealing..." : "Reveal"}
        </button>
      ) : (
        <div className="text-sm text-base-content/70 font-mono tabular-nums">
          opens in {formatTimeRemaining(vote.secondsUntilReveal)}
        </div>
      )}
    </div>
  );
}

export function ManualRevealPage() {
  const { address, isConnected } = useAccount();
  const { votes, readyVotes, waitingVotes, isLoading, revealVote, revealingCommitKey } = useManualRevealVotes(address);

  if (!isConnected || !address) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
        <div className="surface-card rounded-lg p-8 max-w-md text-center space-y-4">
          <h1 className="text-3xl font-semibold">Reveal My Vote</h1>
          <p className="text-base-content/75">
            Hidden fallback for manual reveals. Auto-reveal stays the default path.
          </p>
          <CuryoConnectButton />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center grow px-4 pt-8 pb-12">
      <div className="w-full max-w-3xl space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="space-y-2">
            <Link
              href={RATE_ROUTE}
              className="inline-flex items-center gap-2 text-sm text-base-content/70 hover:text-base-content transition-colors"
            >
              <ArrowLeftIcon className="w-4 h-4" />
              Back to rate
            </Link>
            <div className="flex items-center gap-2">
              <h1 className="text-3xl font-semibold">Reveal My Vote</h1>
              <InfoTooltip
                text="Use this only if an automatic keeper reveal looks delayed. Reveals still use the normal on-chain function."
                position="right"
              />
            </div>
            <p className="max-w-2xl text-base-content/75">
              This fallback keeps the keeper-assisted/self-reveal path available if automatic reveal looks delayed. The
              redeployed contracts still validate commit metadata on-chain, but honest decryptability remains an
              off-chain check.
            </p>
          </div>
          <div className="surface-card rounded-lg px-4 py-3 min-w-44">
            <div className="text-xs uppercase tracking-[0.2em] text-base-content/60">Ready now</div>
            <div className="text-3xl font-semibold tabular-nums">{readyVotes.length}</div>
          </div>
        </div>

        {isLoading ? (
          <div className="surface-card rounded-lg p-12 flex justify-center">
            <span className="loading loading-spinner loading-lg text-primary"></span>
          </div>
        ) : votes.length === 0 ? (
          <div className="surface-card rounded-lg p-8 space-y-2">
            <h2 className="text-xl font-semibold">No unrevealed votes</h2>
            <p className="text-base-content/75">Nothing needs manual help right now.</p>
          </div>
        ) : (
          <>
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-semibold">Ready</h2>
                <InfoTooltip
                  text="Only the first reveal transaction for a vote succeeds. If a keeper reveals it first, your manual attempt just becomes a harmless no-op."
                  position="right"
                />
              </div>
              {readyVotes.length > 0 ? (
                <div className="space-y-3">
                  {readyVotes.map(vote => (
                    <RevealVoteCard
                      key={vote.commitKey}
                      vote={vote}
                      isPending={revealingCommitKey === vote.commitKey}
                      onReveal={revealVote}
                    />
                  ))}
                </div>
              ) : (
                <div className="surface-card rounded-lg p-5 text-base-content/75">Nothing is revealable yet.</div>
              )}
            </section>

            {waitingVotes.length > 0 && (
              <section className="space-y-3">
                <h2 className="text-xl font-semibold">Waiting</h2>
                <div className="space-y-3">
                  {waitingVotes.map(vote => (
                    <RevealVoteCard key={vote.commitKey} vote={vote} isPending={false} onReveal={revealVote} />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
