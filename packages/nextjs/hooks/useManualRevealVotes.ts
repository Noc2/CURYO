"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Address, encodePacked, keccak256, zeroHash } from "viem";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import { useDeployedContractInfo } from "~~/hooks/scaffold-eth";
import { useTargetNetwork } from "~~/hooks/scaffold-eth/useTargetNetwork";
import { usePonderQuery } from "~~/hooks/usePonderQuery";
import { ponderApi } from "~~/services/ponder/client";
import { CommitData } from "~~/types/votingTypes";
import { getParsedErrorWithAllAbis } from "~~/utils/scaffold-eth/contract";
import { notification } from "~~/utils/scaffold-eth/notification";
import { decryptTlockCiphertext } from "~~/utils/tlock";

export interface ManualRevealVote {
  contentId: bigint;
  roundId: bigint;
  voter: Address;
  stake: bigint;
  epochIndex: number;
  committedAt: string;
  revealableAfter: bigint;
  commitHash: `0x${string}`;
  commitKey: `0x${string}`;
  ciphertext: `0x${string}`;
  secondsUntilReveal: number;
  isReady: boolean;
}

const BENIGN_REVEAL_ERRORS = ["AlreadyRevealed", "RoundNotOpen", "EpochNotEnded", "Transaction reverted"];

function buildCommitKey(voter: Address, commitHash: `0x${string}`): `0x${string}` {
  return keccak256(encodePacked(["address", "bytes32"], [voter, commitHash]));
}

function isBenignRevealError(message: string): boolean {
  const lower = message.toLowerCase();
  return BENIGN_REVEAL_ERRORS.some(error => lower.includes(error.toLowerCase()));
}

export function useManualRevealVotes(voter?: Address) {
  const { address, chain } = useAccount();
  const { data: walletClient } = useWalletClient();
  const { targetNetwork } = useTargetNetwork();
  const publicClient = usePublicClient({ chainId: targetNetwork.id });
  const queryClient = useQueryClient();
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const [pendingCommitKey, setPendingCommitKey] = useState<`0x${string}` | null>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Math.floor(Date.now() / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const { data: engineInfo } = useDeployedContractInfo({ contractName: "RoundVotingEngine" as any });

  const { data: ponderResult, isLoading: isLoadingVotes } = usePonderQuery({
    queryKey: ["manualRevealVotes", voter],
    ponderFn: async () => {
      if (!voter) return { items: [] };
      return ponderApi.getVotes({ voter, state: "0", limit: "200" });
    },
    rpcFn: async () => ({ items: [] }),
    enabled: !!voter,
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  const pendingVotes = useMemo(() => {
    return (ponderResult?.data?.items ?? []).filter(vote => !vote.revealed);
  }, [ponderResult?.data?.items]);

  const pendingVoteKey = useMemo(() => {
    return pendingVotes.map(vote => `${vote.contentId}-${vote.roundId}-${vote.committedAt}`).join("|");
  }, [pendingVotes]);

  const { data: rawVotes, isLoading: isLoadingCommits } = useQuery({
    queryKey: ["manualRevealVotesOnchain", voter, pendingVoteKey],
    enabled: Boolean(voter && publicClient && engineInfo?.address && pendingVotes.length > 0),
    staleTime: 15_000,
    refetchInterval: 30_000,
    queryFn: async (): Promise<ManualRevealVote[]> => {
      if (!voter || !publicClient || !engineInfo?.address || pendingVotes.length === 0) return [];

      const commitHashResults = await publicClient.multicall({
        allowFailure: true,
        contracts: pendingVotes.map(vote => ({
          address: engineInfo.address,
          abi: engineInfo.abi,
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

      const commitResults = await publicClient.multicall({
        allowFailure: true,
        contracts: withCommitHashes.map(({ vote, commitKey }) => ({
          address: engineInfo.address,
          abi: engineInfo.abi,
          functionName: "getCommit",
          args: [BigInt(vote.contentId), BigInt(vote.roundId), commitKey],
        })) as any,
      });

      return withCommitHashes.flatMap(({ vote, commitHash, commitKey }, index) => {
        const result = commitResults[index];
        if (result?.status !== "success") return [];

        const commit = result.result as CommitData;
        if (!commit.voter || commit.voter === "0x0000000000000000000000000000000000000000" || commit.revealed) {
          return [];
        }

        return [
          {
            contentId: BigInt(vote.contentId),
            roundId: BigInt(vote.roundId),
            voter: commit.voter as Address,
            stake: commit.stakeAmount,
            epochIndex: commit.epochIndex,
            committedAt: vote.committedAt,
            revealableAfter: commit.revealableAfter,
            commitHash,
            commitKey,
            ciphertext: commit.ciphertext as `0x${string}`,
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
        const secondsUntilReveal = Math.max(0, Number(vote.revealableAfter) - now);
        return {
          ...vote,
          secondsUntilReveal,
          isReady: secondsUntilReveal === 0,
        };
      })
      .sort((a, b) => {
        if (a.isReady !== b.isReady) return a.isReady ? -1 : 1;
        return Number(a.revealableAfter - b.revealableAfter);
      });
  }, [now, rawVotes]);

  const readyVotes = useMemo(() => votes.filter(vote => vote.isReady), [votes]);
  const waitingVotes = useMemo(() => votes.filter(vote => !vote.isReady), [votes]);

  const refresh = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["manualRevealVotesOnchain", voter] }),
      queryClient.invalidateQueries({ queryKey: ["ponder-fallback", "manualRevealVotes", voter] }),
      queryClient.invalidateQueries({ queryKey: ["ponder-fallback", "activeVotesWithDeadlines", voter] }),
      queryClient.invalidateQueries({ queryKey: ["ponder-fallback", "votingStakes", voter] }),
      queryClient.invalidateQueries({ queryKey: ["ponder-fallback", "voteHistory", voter] }),
      queryClient.invalidateQueries({ queryKey: ["ponder-fallback", "allClaimableVotes", voter] }),
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
          abi: engineInfo.abi,
          functionName: "getCommit",
          args: [vote.contentId, vote.roundId, vote.commitKey],
        })) as CommitData;

        if (latestCommit.revealed) {
          notification.info("That vote has already been revealed.");
          await refresh();
          return true;
        }

        if (BigInt(Math.floor(Date.now() / 1000)) < latestCommit.revealableAfter) {
          notification.info("That vote is not revealable yet.");
          await refresh();
          return false;
        }

        const decrypted = await decryptTlockCiphertext(latestCommit.ciphertext as `0x${string}`);
        if (!decrypted) {
          notification.error("The stored ciphertext could not be decoded.");
          return false;
        }

        toastId = notification.loading("Submitting reveal...");

        const hash = await walletClient.writeContract({
          address: engineInfo.address,
          abi: engineInfo.abi,
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
    [address, chain?.id, engineInfo?.abi, engineInfo?.address, publicClient, refresh, targetNetwork, walletClient],
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
