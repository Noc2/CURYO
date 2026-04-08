"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Abi, Address, Hex, decodeFunctionData, keccak256, parseAbi, stringToHex } from "viem";
import { useAccount, useBlockNumber, usePublicClient, useReadContract, useWriteContract } from "wagmi";
import { Proposal, ProposalState } from "~~/components/governance/types";
import {
  useDeployedContractInfo,
  useScaffoldReadContract,
  useTargetNetwork,
  useTransactor,
} from "~~/hooks/scaffold-eth";
import { usePageVisibility } from "~~/hooks/usePageVisibility";
import { notification } from "~~/utils/scaffold-eth";
import { ZERO_ADDRESS } from "~~/utils/scaffold-eth/common";
import { TransactorFuncOptions } from "~~/utils/scaffold-eth/contract";

export const governorAbi = parseAbi([
  "function categoryProposalThreshold() view returns (uint256)",
  "event ProposalCreated(uint256 proposalId, address proposer, address[] targets, uint256[] values, string[] signatures, bytes[] calldatas, uint256 voteStart, uint256 voteEnd, string description)",
  "function castVote(uint256 proposalId, uint8 support) returns (uint256)",
  "function execute(address[] targets, uint256[] values, bytes[] calldatas, bytes32 descriptionHash) payable returns (uint256)",
  "function MINIMUM_QUORUM() view returns (uint256)",
  "function proposalDeadline(uint256 proposalId) view returns (uint256)",
  "function proposalEta(uint256 proposalId) view returns (uint256)",
  "function proposalNeedsQueuing(uint256 proposalId) view returns (bool)",
  "function proposalProposer(uint256 proposalId) view returns (address)",
  "function proposalSnapshot(uint256 proposalId) view returns (uint256)",
  "function proposalThreshold() view returns (uint256)",
  "function proposalVotes(uint256 proposalId) view returns (uint256 againstVotes, uint256 forVotes, uint256 abstainVotes)",
  "function proposeCategoryApproval(uint256 categoryId) returns (uint256)",
  "function propose(address[] targets, uint256[] values, bytes[] calldatas, string description) returns (uint256)",
  "function queue(address[] targets, uint256[] values, bytes[] calldatas, bytes32 descriptionHash) returns (uint256)",
  "function quorum(uint256 blockNumber) view returns (uint256)",
  "function quorumNumerator() view returns (uint256)",
  "function setProposalThreshold(uint256 newProposalThreshold)",
  "function setVotingDelay(uint48 newVotingDelay)",
  "function setVotingPeriod(uint32 newVotingPeriod)",
  "function state(uint256 proposalId) view returns (uint8)",
  "function timelock() view returns (address)",
  "function updateQuorumNumerator(uint256 newQuorumNumerator)",
  "function votingDelay() view returns (uint256)",
  "function votingPeriod() view returns (uint256)",
  "function hasVoted(uint256 proposalId, address account) view returns (bool)",
]);

const timelockAbi = parseAbi(["function getMinDelay() view returns (uint256)"]);

type GovernanceManagedContractName = "CuryoGovernor" | "CategoryRegistry" | "FrontendRegistry" | "ContentRegistry";

type GovernanceTargetContract = {
  name: GovernanceManagedContractName;
  address: Address;
  abi: Abi;
};

type ProposalCreatedArgs = {
  proposalId: bigint;
  proposer: Address;
  targets: Address[];
  values: bigint[];
  signatures: string[];
  calldatas: Hex[];
  voteStart: bigint;
  voteEnd: bigint;
  description: string;
};

type ProposalCreatedLog = {
  args: ProposalCreatedArgs;
  blockNumber?: bigint;
  logIndex?: number;
};

type GovernanceWriteRequest = {
  address: Address;
  abi: Abi;
  functionName: string;
  args?: readonly unknown[];
  value?: bigint;
};

function compareBigIntsDesc(a: bigint, b: bigint) {
  if (a === b) return 0;
  return a > b ? -1 : 1;
}

function truncateHex(value: string, start = 6, end = 4) {
  if (value.length <= start + end) return value;
  return `${value.slice(0, start)}...${value.slice(-end)}`;
}

function formatArg(value: unknown): string {
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "string") {
    if (value.startsWith("0x") && value.length > 18) return truncateHex(value);
    return value;
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  if (Array.isArray(value)) {
    const rendered = value
      .slice(0, 3)
      .map(item => formatArg(item))
      .join(", ");
    return value.length > 3 ? `[${rendered}, +${value.length - 3} more]` : `[${rendered}]`;
  }
  return String(value);
}

function formatDecodedActionSummary(
  targetName: string,
  functionName: string,
  args: readonly unknown[] | undefined,
  value: bigint,
) {
  const renderedArgs = args && args.length > 0 ? args.map(arg => formatArg(arg)).join(", ") : "";
  const renderedValue = value > 0n ? ` value=${value.toString()}` : "";
  return `${targetName}.${functionName}(${renderedArgs})${renderedValue}`;
}

export function getProposalDescriptionHash(description: string): Hex {
  return keccak256(stringToHex(description));
}

export function useGovernanceContracts() {
  const { targetNetwork } = useTargetNetwork();
  const publicClient = usePublicClient({ chainId: targetNetwork.id });
  const token = useDeployedContractInfo({ contractName: "CuryoReputation" });
  const categoryRegistry = useDeployedContractInfo({ contractName: "CategoryRegistry" });
  const frontendRegistry = useDeployedContractInfo({ contractName: "FrontendRegistry" });
  const contentRegistry = useDeployedContractInfo({ contractName: "ContentRegistry" });

  const {
    data: governorRaw,
    isLoading: governorReadLoading,
    isFetching: governorReadFetching,
    isFetched: governorReadFetched,
    isError: governorReadError,
  } = useScaffoldReadContract({
    contractName: "CuryoReputation",
    functionName: "governor" as any,
  });

  const governorAddress =
    typeof governorRaw === "string" && governorRaw !== ZERO_ADDRESS ? (governorRaw as Address) : undefined;

  const {
    data: governorBytecode,
    isLoading: governorBytecodeLoading,
    isFetching: governorBytecodeFetching,
  } = useQuery({
    queryKey: ["governor-bytecode", targetNetwork.id, governorAddress],
    enabled: !!publicClient && !!governorAddress,
    staleTime: 60_000,
    queryFn: async () => {
      return (await publicClient!.getBytecode({ address: governorAddress! })) ?? null;
    },
  });

  const governorAddressLookupPending =
    !!token.data && !governorReadError && !governorReadFetched && (governorReadLoading || governorReadFetching);
  const isGovernorContractLoading =
    token.isLoading ||
    governorAddressLookupPending ||
    (!!governorAddress && (governorBytecodeLoading || governorBytecodeFetching));
  const hasGovernorContract = !!governorAddress && !!governorBytecode && governorBytecode !== "0x";

  const { data: timelockRaw } = useReadContract({
    address: governorAddress,
    abi: governorAbi,
    functionName: "timelock",
    chainId: targetNetwork.id,
    query: {
      enabled: hasGovernorContract,
    },
  } as any);

  const timelockAddress = typeof timelockRaw === "string" ? (timelockRaw as Address) : undefined;

  const knownContracts = useMemo(() => {
    const items: GovernanceTargetContract[] = [];
    if (hasGovernorContract && governorAddress) {
      items.push({
        name: "CuryoGovernor",
        address: governorAddress,
        abi: governorAbi,
      });
    }
    if (categoryRegistry.data) {
      items.push({
        name: "CategoryRegistry",
        address: categoryRegistry.data.address,
        abi: categoryRegistry.data.abi as Abi,
      });
    }
    if (frontendRegistry.data) {
      items.push({
        name: "FrontendRegistry",
        address: frontendRegistry.data.address,
        abi: frontendRegistry.data.abi as Abi,
      });
    }
    if (contentRegistry.data) {
      items.push({
        name: "ContentRegistry",
        address: contentRegistry.data.address,
        abi: contentRegistry.data.abi as Abi,
      });
    }
    return items;
  }, [categoryRegistry.data, contentRegistry.data, frontendRegistry.data, governorAddress, hasGovernorContract]);

  const knownContractsByAddress = useMemo(
    () =>
      Object.fromEntries(knownContracts.map(contract => [contract.address.toLowerCase(), contract])) as Record<
        string,
        GovernanceTargetContract
      >,
    [knownContracts],
  );

  const knownContractsByName = useMemo(
    () =>
      Object.fromEntries(knownContracts.map(contract => [contract.name, contract])) as Partial<
        Record<GovernanceManagedContractName, GovernanceTargetContract>
      >,
    [knownContracts],
  );

  return {
    targetNetwork,
    token,
    categoryRegistry,
    frontendRegistry,
    contentRegistry,
    governorAddress,
    isGovernorContractLoading,
    hasGovernorContract,
    timelockAddress,
    knownContracts,
    knownContractsByAddress,
    knownContractsByName,
  };
}

export function useGovernanceStats() {
  const { targetNetwork, governorAddress, hasGovernorContract, timelockAddress } = useGovernanceContracts();
  const isPageVisible = usePageVisibility();
  const { data: latestBlock } = useBlockNumber({
    chainId: targetNetwork.id,
    watch: false,
    query: {
      enabled: hasGovernorContract,
      staleTime: 30_000,
      refetchInterval: isPageVisible ? 30_000 : false,
    },
  });

  const staticGovernanceQuery = {
    enabled: hasGovernorContract,
    staleTime: 300_000,
  };
  const governorReadConfig = {
    address: governorAddress,
    abi: governorAbi,
    chainId: targetNetwork.id,
    query: staticGovernanceQuery,
  };

  const { data: votingDelay } = useReadContract({
    ...governorReadConfig,
    functionName: "votingDelay",
  } as any);

  const { data: votingPeriod } = useReadContract({
    ...governorReadConfig,
    functionName: "votingPeriod",
  } as any);

  const { data: proposalThreshold } = useReadContract({
    ...governorReadConfig,
    functionName: "proposalThreshold",
  } as any);

  const { data: categoryProposalThreshold } = useReadContract({
    ...governorReadConfig,
    functionName: "categoryProposalThreshold",
  } as any);

  const { data: quorumNumerator } = useReadContract({
    ...governorReadConfig,
    functionName: "quorumNumerator",
  } as any);

  const { data: minimumQuorum } = useReadContract({
    ...governorReadConfig,
    functionName: "MINIMUM_QUORUM",
  } as any);

  const { data: currentQuorum } = useReadContract({
    ...governorReadConfig,
    functionName: "quorum",
    args: [latestBlock ?? 0n],
    query: {
      enabled: hasGovernorContract && latestBlock !== undefined,
      staleTime: 30_000,
    },
  } as any);

  const { data: timelockDelay } = useReadContract({
    address: timelockAddress,
    abi: timelockAbi,
    functionName: "getMinDelay",
    chainId: targetNetwork.id,
    query: {
      enabled: !!timelockAddress,
      staleTime: 300_000,
    },
  } as any);

  return {
    hasGovernorContract,
    governorAddress,
    votingDelay: (votingDelay as bigint | undefined) ?? undefined,
    votingPeriod: (votingPeriod as bigint | undefined) ?? undefined,
    proposalThreshold: (proposalThreshold as bigint | undefined) ?? undefined,
    categoryProposalThreshold: (categoryProposalThreshold as bigint | undefined) ?? undefined,
    quorumNumerator: (quorumNumerator as bigint | undefined) ?? undefined,
    minimumQuorum: (minimumQuorum as bigint | undefined) ?? undefined,
    currentQuorum: (currentQuorum as bigint | undefined) ?? undefined,
    timelockDelay: (timelockDelay as bigint | undefined) ?? undefined,
  };
}

export function useGovernorProposals() {
  const { address } = useAccount();
  const isPageVisible = usePageVisibility();
  const { targetNetwork, governorAddress, hasGovernorContract, knownContractsByAddress, token } =
    useGovernanceContracts();
  const publicClient = usePublicClient({ chainId: targetNetwork.id });

  const proposalCreatedEvent = useMemo(
    () => governorAbi.find(item => item.type === "event" && item.name === "ProposalCreated"),
    [],
  );
  const governorFromBlock = useMemo(() => {
    const deployedOnBlock = token.data?.deployedOnBlock;
    if (deployedOnBlock === undefined || deployedOnBlock === null) return 0n;
    return BigInt(Number(deployedOnBlock) || 0);
  }, [token.data?.deployedOnBlock]);

  return useQuery({
    queryKey: ["governor-proposals", targetNetwork.id, governorAddress, address, governorFromBlock.toString()],
    enabled: !!publicClient && !!governorAddress && hasGovernorContract && !!proposalCreatedEvent,
    staleTime: 15_000,
    refetchInterval: isPageVisible ? 30_000 : false,
    queryFn: async (): Promise<Proposal[]> => {
      const rawLogs = await publicClient!.getLogs({
        address: governorAddress!,
        event: proposalCreatedEvent as any,
        fromBlock: governorFromBlock,
        toBlock: "latest",
      });

      const logs = rawLogs as unknown as ProposalCreatedLog[];

      if (logs.length === 0) return [];

      const sortedLogs = [...logs].sort((left, right) => {
        const blockComparison = compareBigIntsDesc(left.blockNumber ?? 0n, right.blockNumber ?? 0n);
        if (blockComparison !== 0) return blockComparison;
        return compareBigIntsDesc(BigInt(left.logIndex ?? 0), BigInt(right.logIndex ?? 0));
      });

      const governorCalls = sortedLogs.flatMap(log => {
        const proposalId = log.args.proposalId as bigint;
        const calls: {
          address: Address;
          abi: Abi;
          functionName: string;
          args: readonly unknown[];
        }[] = [
          { address: governorAddress!, abi: governorAbi, functionName: "state", args: [proposalId] },
          { address: governorAddress!, abi: governorAbi, functionName: "proposalVotes", args: [proposalId] },
          { address: governorAddress!, abi: governorAbi, functionName: "proposalSnapshot", args: [proposalId] },
          { address: governorAddress!, abi: governorAbi, functionName: "proposalDeadline", args: [proposalId] },
          { address: governorAddress!, abi: governorAbi, functionName: "proposalEta", args: [proposalId] },
          { address: governorAddress!, abi: governorAbi, functionName: "proposalNeedsQueuing", args: [proposalId] },
          { address: governorAddress!, abi: governorAbi, functionName: "proposalProposer", args: [proposalId] },
        ];

        if (address) {
          calls.push({
            address: governorAddress!,
            abi: governorAbi,
            functionName: "hasVoted",
            args: [proposalId, address],
          });
        }

        return calls;
      });

      const results = await publicClient!.multicall({
        allowFailure: true,
        contracts: governorCalls as any,
      });

      let cursor = 0;

      return sortedLogs.map(log => {
        const stateResult = results[cursor++];
        const votesResult = results[cursor++];
        const snapshotResult = results[cursor++];
        const deadlineResult = results[cursor++];
        const etaResult = results[cursor++];
        const needsQueuingResult = results[cursor++];
        const proposerResult = results[cursor++];
        const hasVotedResult = address ? results[cursor++] : undefined;

        const proposalId = log.args.proposalId as bigint;
        const description = (log.args.description as string) ?? "";
        const targets = (log.args.targets as Address[]) ?? [];
        const values = ((log.args.values as bigint[]) ?? []).map(value => BigInt(value));
        const calldatas = (log.args.calldatas as Hex[]) ?? [];

        const decodedActions = targets.map((target, index) => {
          const knownContract = knownContractsByAddress[target.toLowerCase()];
          const calldata = calldatas[index];
          const value = values[index] ?? 0n;

          if (!knownContract || !calldata) {
            return {
              target,
              targetName: truncateHex(target),
              functionName: "unknown",
              summary: `${truncateHex(target)} raw call`,
              value,
              calldata: calldata ?? "0x",
            };
          }

          try {
            const decoded = decodeFunctionData({
              abi: knownContract.abi,
              data: calldata,
            });
            const functionName = String(decoded.functionName);
            const args = Array.isArray(decoded.args) ? decoded.args : [];

            return {
              target,
              targetName: knownContract.name,
              functionName,
              summary: formatDecodedActionSummary(knownContract.name, functionName, args, value),
              value,
              calldata,
            };
          } catch {
            return {
              target,
              targetName: knownContract.name,
              functionName: "unknown",
              summary: `${knownContract.name} raw call`,
              value,
              calldata,
            };
          }
        });

        const voteTuple =
          votesResult?.status === "success" && Array.isArray(votesResult.result) ? votesResult.result : [0n, 0n, 0n];

        return {
          id: proposalId.toString(),
          proposalId,
          proposer:
            proposerResult?.status === "success"
              ? (proposerResult.result as Address)
              : ((log.args.proposer as Address | undefined) ?? "0x0000000000000000000000000000000000000000"),
          description,
          descriptionHash: getProposalDescriptionHash(description),
          state:
            stateResult?.status === "success" ? (Number(stateResult.result) as ProposalState) : ProposalState.Pending,
          forVotes: BigInt(voteTuple[1] ?? 0n),
          againstVotes: BigInt(voteTuple[0] ?? 0n),
          abstainVotes: BigInt(voteTuple[2] ?? 0n),
          startBlock:
            snapshotResult?.status === "success"
              ? BigInt(snapshotResult.result as bigint)
              : BigInt((log.args.voteStart as bigint | undefined) ?? 0n),
          endBlock:
            deadlineResult?.status === "success"
              ? BigInt(deadlineResult.result as bigint)
              : BigInt((log.args.voteEnd as bigint | undefined) ?? 0n),
          eta: etaResult?.status === "success" ? BigInt(etaResult.result as bigint) : 0n,
          needsQueuing: needsQueuingResult?.status === "success" ? Boolean(needsQueuingResult.result) : true,
          hasVoted: hasVotedResult?.status === "success" ? Boolean(hasVotedResult.result) : false,
          targets,
          values,
          calldatas,
          actions: decodedActions,
        } satisfies Proposal;
      });
    },
  });
}

export function useGovernanceWrite() {
  const { chain } = useAccount();
  const { targetNetwork } = useTargetNetwork();
  const writeTx = useTransactor();
  const { writeContractAsync, isPending, reset } = useWriteContract();

  const writeDynamicContract = async (request: GovernanceWriteRequest, options?: TransactorFuncOptions) => {
    if (!chain?.id) {
      notification.error("Please connect your wallet");
      return;
    }

    if (chain.id !== targetNetwork.id) {
      notification.error(`Wallet is connected to the wrong network. Please switch to ${targetNetwork.name}`);
      return;
    }

    reset();
    return writeTx(
      () =>
        writeContractAsync({
          address: request.address,
          abi: request.abi,
          functionName: request.functionName,
          args: request.args,
          value: request.value,
        } as any),
      options,
    );
  };

  return {
    writeContractAsync: writeDynamicContract,
    isPending,
  };
}
