"use client";

import { useCallback, useMemo, useState } from "react";
import { RoundVotingEngineAbi } from "@curyo/contracts/abis";
import { buildCommitKey, decryptTlockCiphertext, parseTlockCiphertextMetadata } from "@curyo/contracts/voting";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Address, zeroHash } from "viem";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import { useDeployedContractInfo } from "~~/hooks/scaffold-eth";
import { useTargetNetwork } from "~~/hooks/scaffold-eth/useTargetNetwork";
import { usePageVisibility } from "~~/hooks/usePageVisibility";
import { invalidateRecentUserVotes, useRecentUserVotes } from "~~/hooks/useRecentUserVotes";
import { useUnixTime } from "~~/hooks/useUnixTime";
import { getSubmittingTransactionMessage } from "~~/lib/ui/transactionStatusCopy";
import { CommitData } from "~~/types/votingTypes";
import { getParsedErrorWithAllAbis } from "~~/utils/scaffold-eth/contract";
import { notification } from "~~/utils/scaffold-eth/notification";

export interface ManualRevealVote {
  contentId: bigint;
  roundId: bigint;
  voter: Address;
  stake: bigint;
  epochIndex: number;
  committedAt: string;
  revealableAfter: bigint;
  revealAvailableAt: bigint;
  commitHash: `0x${string}`;
  commitKey: `0x${string}`;
  ciphertext: `0x${string}`;
  targetRound: bigint;
  drandChainHash: `0x${string}`;
  secondsUntilReveal: number;
  isReady: boolean;
}

const BENIGN_REVEAL_ERRORS = ["AlreadyRevealed", "RoundNotOpen", "EpochNotEnded", "Transaction reverted"];

function isBenignRevealError(message: string): boolean {
  const lower = message.toLowerCase();
  return BENIGN_REVEAL_ERRORS.some(error => lower.includes(error.toLowerCase()));
}

function deriveDrandRoundRevealableAtSeconds(
  targetRound: bigint,
  drandGenesisTimeSeconds: bigint,
  drandPeriodSeconds: bigint,
) {
  if (targetRound <= 0n || drandPeriodSeconds <= 0n) {
    return 0n;
  }

  return drandGenesisTimeSeconds + (targetRound - 1n) * drandPeriodSeconds;
}

function deriveRevealAvailableAtSeconds(
  revealableAfterSeconds: bigint,
  targetRound: bigint,
  drandGenesisTimeSeconds: bigint,
  drandPeriodSeconds: bigint,
) {
  const drandRoundRevealableAt = deriveDrandRoundRevealableAtSeconds(
    targetRound,
    drandGenesisTimeSeconds,
    drandPeriodSeconds,
  );

  return revealableAfterSeconds > drandRoundRevealableAt ? revealableAfterSeconds : drandRoundRevealableAt;
}

export function useManualRevealVotes(voter?: Address) {
  const { address, chain } = useAccount();
  const { data: walletClient } = useWalletClient();
  const { targetNetwork } = useTargetNetwork();
  const publicClient = usePublicClient({ chainId: targetNetwork.id });
  const queryClient = useQueryClient();
  const now = useUnixTime();
  const isPageVisible = usePageVisibility();
  const [pendingCommitKey, setPendingCommitKey] = useState<`0x${string}` | null>(null);

  const { data: engineInfo } = useDeployedContractInfo({ contractName: "RoundVotingEngine" as any });
  const { openVotes, isLoading: isLoadingVotes } = useRecentUserVotes(voter);

  const pendingVotes = useMemo(() => {
    return openVotes.filter(vote => !vote.revealed);
  }, [openVotes]);

  const pendingVoteKey = useMemo(() => {
    return pendingVotes.map(vote => `${vote.contentId}-${vote.roundId}-${vote.committedAt}`).join("|");
  }, [pendingVotes]);

  const { data: rawVotes, isLoading: isLoadingCommits } = useQuery({
    queryKey: ["manualRevealVotesOnchain", voter, pendingVoteKey],
    enabled: Boolean(voter && publicClient && engineInfo?.address && pendingVotes.length > 0),
    staleTime: 30_000,
    refetchInterval: isPageVisible ? 60_000 : false,
    queryFn: async (): Promise<ManualRevealVote[]> => {
      if (!voter || !publicClient || !engineInfo?.address || pendingVotes.length === 0) return [];

      const commitHashResults = await publicClient.multicall({
        allowFailure: true,
        contracts: pendingVotes.map(vote => ({
          address: engineInfo.address,
          abi: RoundVotingEngineAbi,
          functionName: "voterCommitHash",
          args: [BigInt(vote.contentId), BigInt(vote.roundId), voter],
        })) as any,
      });

      const withCommitHashes = pendingVotes.flatMap((vote, index) => {
        const result = commitHashResults[index];
        if (result?.status !== "success") return [];
        if (!result.result || result.result === zeroHash) return [];
        const commitHash = result.result as `0x${string}`;
        return [{ vote, commitHash, commitKey: buildCommitKey(voter, commitHash) }];
      });

      if (withCommitHashes.length === 0) return [];

      const protocolConfigAddress = (await publicClient.readContract({
        address: engineInfo.address,
        abi: RoundVotingEngineAbi,
        functionName: "protocolConfig",
      })) as Address;

      const [drandGenesisTime, drandPeriod] = await Promise.all([
        publicClient.readContract({
          address: protocolConfigAddress,
          abi: [
            {
              type: "function",
              name: "drandGenesisTime",
              stateMutability: "view",
              inputs: [],
              outputs: [{ name: "", type: "uint64" }],
            },
          ],
          functionName: "drandGenesisTime",
        }),
        publicClient.readContract({
          address: protocolConfigAddress,
          abi: [
            {
              type: "function",
              name: "drandPeriod",
              stateMutability: "view",
              inputs: [],
              outputs: [{ name: "", type: "uint64" }],
            },
          ],
          functionName: "drandPeriod",
        }),
      ]);

      const commitResults = await publicClient.multicall({
        allowFailure: true,
        contracts: withCommitHashes.map(({ vote, commitKey }) => ({
          address: engineInfo.address,
          abi: RoundVotingEngineAbi,
          functionName: "commits",
          args: [BigInt(vote.contentId), BigInt(vote.roundId), commitKey],
        })) as any,
      });

      return withCommitHashes.flatMap(({ vote, commitHash, commitKey }, index) => {
        const commitResult = commitResults[index];
        if (commitResult?.status !== "success") return [];

        const commit = commitResult.result as CommitData;
        if (!commit.voter || commit.voter === "0x0000000000000000000000000000000000000000" || commit.revealed) {
          return [];
        }

        const revealAvailableAt = deriveRevealAvailableAtSeconds(
          commit.revealableAfter,
          commit.targetRound ?? 0n,
          drandGenesisTime as bigint,
          drandPeriod as bigint,
        );

        return [
          {
            contentId: BigInt(vote.contentId),
            roundId: BigInt(vote.roundId),
            voter: commit.voter as Address,
            stake: commit.stakeAmount,
            epochIndex: commit.epochIndex,
            committedAt: vote.committedAt,
            revealableAfter: commit.revealableAfter,
            revealAvailableAt,
            commitHash,
            commitKey,
            ciphertext: commit.ciphertext as `0x${string}`,
            targetRound: commit.targetRound ?? 0n,
            drandChainHash: commit.drandChainHash ?? zeroHash,
            secondsUntilReveal: 0,
            isReady: false,
          },
        ];
      });
    },
  });

  const votes = useMemo(() => {
    return (rawVotes ?? [])
      .map(vote => {
        const secondsUntilReveal = Math.max(0, Number(vote.revealAvailableAt) - now);
        return {
          ...vote,
          secondsUntilReveal,
          isReady: secondsUntilReveal === 0,
        };
      })
      .sort((a, b) => {
        if (a.isReady !== b.isReady) return a.isReady ? -1 : 1;
        return Number(a.revealAvailableAt - b.revealAvailableAt);
      });
  }, [now, rawVotes]);

  const readyVotes = useMemo(() => votes.filter(vote => vote.isReady), [votes]);
  const waitingVotes = useMemo(() => votes.filter(vote => !vote.isReady), [votes]);

  const refresh = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["manualRevealVotesOnchain", voter] }),
      invalidateRecentUserVotes(queryClient, voter),
      queryClient.invalidateQueries({ queryKey: ["ponder-fallback", "votingStakes", voter] }),
      queryClient.invalidateQueries({ queryKey: ["ponder-fallback", "voteHistory", voter] }),
    ]);
  }, [queryClient, voter]);

  const revealVote = useCallback(
    async (vote: ManualRevealVote) => {
      if (!walletClient || !publicClient || !engineInfo?.address || !address) {
        notification.error("Connect your wallet to reveal a vote.");
        return false;
      }
      if (chain?.id !== targetNetwork.id) {
        notification.error(`Switch to ${targetNetwork.name} to reveal votes.`);
        return false;
      }

      setPendingCommitKey(vote.commitKey);
      let toastId: string | undefined;

      try {
        const latestCommit = (await publicClient.readContract({
          address: engineInfo.address,
          abi: RoundVotingEngineAbi,
          functionName: "commits",
          args: [vote.contentId, vote.roundId, vote.commitKey],
        })) as unknown as CommitData;

        if (latestCommit.revealed) {
          notification.info("That vote has already been revealed.");
          await refresh();
          return true;
        }

        const protocolConfigAddress = (await publicClient.readContract({
          address: engineInfo.address,
          abi: RoundVotingEngineAbi,
          functionName: "protocolConfig",
        })) as Address;
        const [drandGenesisTime, drandPeriod] = await Promise.all([
          publicClient.readContract({
            address: protocolConfigAddress,
            abi: [
              {
                type: "function",
                name: "drandGenesisTime",
                stateMutability: "view",
                inputs: [],
                outputs: [{ name: "", type: "uint64" }],
              },
            ],
            functionName: "drandGenesisTime",
          }),
          publicClient.readContract({
            address: protocolConfigAddress,
            abi: [
              {
                type: "function",
                name: "drandPeriod",
                stateMutability: "view",
                inputs: [],
                outputs: [{ name: "", type: "uint64" }],
              },
            ],
            functionName: "drandPeriod",
          }),
        ]);

        const revealAvailableAt = deriveRevealAvailableAtSeconds(
          latestCommit.revealableAfter,
          latestCommit.targetRound ?? 0n,
          drandGenesisTime as bigint,
          drandPeriod as bigint,
        );
        if (BigInt(now) < revealAvailableAt) {
          notification.info("That vote is not revealable yet.");
          await refresh();
          return false;
        }

        if (latestCommit.targetRound == null || latestCommit.drandChainHash == null) {
          notification.error("The stored vote is missing tlock metadata and cannot be manually revealed.");
          return false;
        }

        const parsedMetadata = parseTlockCiphertextMetadata(latestCommit.ciphertext as `0x${string}`);
        if (!parsedMetadata) {
          notification.error("The stored vote ciphertext is malformed and cannot be manually revealed.");
          return false;
        }

        if (
          parsedMetadata.targetRound !== latestCommit.targetRound ||
          parsedMetadata.drandChainHash !== latestCommit.drandChainHash
        ) {
          notification.error("The stored vote ciphertext does not match the committed drand metadata.");
          return false;
        }

        const decrypted = await decryptTlockCiphertext(latestCommit.ciphertext as `0x${string}`);
        if (!decrypted) {
          notification.error("The stored ciphertext could not be decoded.");
          return false;
        }

        toastId = notification.loading(getSubmittingTransactionMessage("reveal"));

        const hash = await walletClient.writeContract({
          address: engineInfo.address,
          abi: RoundVotingEngineAbi,
          functionName: "revealVoteByCommitKey",
          args: [vote.contentId, vote.roundId, vote.commitKey, decrypted.isUp, decrypted.salt],
          account: address,
          chain: targetNetwork,
        } as any);

        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        if (receipt.status === "reverted") {
          throw new Error("Transaction reverted");
        }
        notification.remove(toastId);
        notification.success("Vote revealed.");
        await refresh();
        return true;
      } catch (error) {
        if (toastId) notification.remove(toastId);
        const message = getParsedErrorWithAllAbis(error, targetNetwork.id as any);
        if (isBenignRevealError(message)) {
          notification.info("That vote was already revealed or the round already closed.");
          await refresh();
          return true;
        }
        notification.error(message);
        return false;
      } finally {
        setPendingCommitKey(null);
      }
    },
    [address, chain?.id, engineInfo?.address, now, publicClient, refresh, targetNetwork, walletClient],
  );

  return {
    votes,
    readyVotes,
    waitingVotes,
    readyCount: readyVotes.length,
    isLoading: isLoadingVotes || isLoadingCommits,
    revealingCommitKey: pendingCommitKey,
    revealVote,
    refresh,
  };
}
