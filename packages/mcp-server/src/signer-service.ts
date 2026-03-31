import { randomBytes } from "node:crypto";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import {
  ContentRegistryAbi,
  CuryoReputationAbi,
  FrontendRegistryAbi,
  ProtocolConfigAbi,
  RoundRewardDistributorAbi,
  RoundVotingEngineAbi,
  VoterIdNFTAbi,
} from "@curyo/contracts/abis";
import { createTlockVoteCommit } from "@curyo/contracts/voting";
import { getKeystoreAccountFromCredentials } from "@curyo/node-utils/keystore";
import {
  BaseError,
  createPublicClient,
  createWalletClient,
  defineChain,
  encodeAbiParameters,
  http,
  keccak256,
  type Address,
  type Chain,
} from "viem";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import type { WriteConfig, WriteIdentityConfig } from "./config.js";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;
const ZERO_HASH = "0x0000000000000000000000000000000000000000000000000000000000000000" as const;
const DEFAULT_SUBMISSION_REVEAL_WAIT_MS = 1_100;
const FRONTEND_FEE_DISPOSITIONS = ["direct", "credit_registry", "protocol"] as const;

type FrontendFeeDisposition = (typeof FRONTEND_FEE_DISPOSITIONS)[number];

interface ExecutionContext {
  account: PrivateKeyAccount;
  chain: Chain;
  publicClient: ReturnType<typeof createPublicClient>;
  walletClient: ReturnType<typeof createWalletClient>;
  identity: WriteIdentityConfig;
}

export class McpWriteServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "McpWriteServiceError";
  }
}

export class CuryoWriteService {
  private readonly config: WriteConfig;
  private readonly contextCache = new Map<string, ExecutionContext>();

  constructor(config: WriteConfig) {
    this.config = config;
  }

  resolveIdentityId(authInfo?: AuthInfo, allowDefaultIdentity = false): string {
    if (!this.config.enabled) {
      throw new McpWriteServiceError("Hosted write tools are disabled on this MCP server");
    }

    const identityId = typeof authInfo?.extra?.identityId === "string" ? authInfo.extra.identityId : null;
    if (identityId) {
      this.getIdentity(identityId);
      return identityId;
    }

    if (authInfo) {
      throw new McpWriteServiceError("This bearer token is read-only and is not bound to a write identity");
    }

    if (allowDefaultIdentity && this.config.defaultIdentityId) {
      this.getIdentity(this.config.defaultIdentityId);
      return this.config.defaultIdentityId;
    }

    throw new McpWriteServiceError("Write tools require an authenticated identity");
  }

  async vote(
    identityId: string,
    params: {
      contentId: string;
      direction: "up" | "down";
      stakeAmount: string;
      frontendAddress?: Address;
      dryRun?: boolean;
      reason?: string;
    },
  ): Promise<Record<string, unknown>> {
    const contentId = BigInt(params.contentId);
    const stakeAmount = BigInt(params.stakeAmount);
    if (contentId <= 0n) {
      throw new McpWriteServiceError("contentId must be greater than zero");
    }
    if (stakeAmount <= 0n) {
      throw new McpWriteServiceError("stakeAmount must be greater than zero");
    }
    if (this.config.policy.maxVoteStake !== null && stakeAmount > this.config.policy.maxVoteStake) {
      throw new McpWriteServiceError(
        `vote stake exceeds the configured MCP limit (${this.config.policy.maxVoteStake.toString()} max)`,
      );
    }

    const context = this.getContext(identityId);
    const frontendAddress = params.frontendAddress ?? context.identity.frontendAddress ?? ZERO_ADDRESS;

    const hasVoterId = await this.readContract<boolean>(context, {
      address: this.requireContracts().voterIdNFT,
      abi: VoterIdNFTAbi,
      functionName: "hasVoterId",
      args: [context.account.address],
    });
    if (!hasVoterId) {
      throw new McpWriteServiceError("The bound wallet does not hold a Voter ID");
    }

    const balance = await this.readContract<bigint>(context, {
      address: this.requireContracts().crepToken,
      abi: CuryoReputationAbi,
      functionName: "balanceOf",
      args: [context.account.address],
    });
    if (balance < stakeAmount) {
      throw new McpWriteServiceError(
        `Insufficient cREP balance for vote stake (${stakeAmount.toString()} required, ${balance.toString()} available)`,
      );
    }

    const allowance = await this.readContract<bigint>(context, {
      address: this.requireContracts().crepToken,
      abi: CuryoReputationAbi,
      functionName: "allowance",
      args: [context.account.address, this.requireContracts().votingEngine],
    });

    const currentRoundId = await this.readContract<bigint>(context, {
      address: this.requireContracts().votingEngine,
      abi: RoundVotingEngineAbi,
      functionName: "currentRoundId",
      args: [contentId],
    });

    if (currentRoundId > 0n) {
      const existingCommitHash = await this.readContract<`0x${string}`>(context, {
        address: this.requireContracts().votingEngine,
        abi: RoundVotingEngineAbi,
        functionName: "voterCommitHash",
        args: [contentId, currentRoundId, context.account.address],
      });

      if (existingCommitHash !== ZERO_HASH) {
        throw new McpWriteServiceError("The bound wallet already has an active vote commit for this content");
      }
    }

    const protocolConfigAddress = await this.readContract<Address>(context, {
      address: this.requireContracts().votingEngine,
      abi: RoundVotingEngineAbi,
      functionName: "protocolConfig",
      args: [],
    });
    const [epochDurationSeconds] = await this.readContract<readonly [bigint, bigint, bigint, bigint]>(context, {
      address: protocolConfigAddress,
      abi: ProtocolConfigAbi,
      functionName: "config",
      args: [],
    });

    const salt = `0x${randomBytes(32).toString("hex")}` as `0x${string}`;
    const { ciphertext, commitHash, targetRound, drandChainHash } = await createTlockVoteCommit({
      isUp: params.direction === "up",
      salt,
      contentId,
      epochDurationSeconds: Number(epochDurationSeconds),
    });

    const approvalRequired = allowance < stakeAmount;
    const result: Record<string, unknown> = {
      action: "vote",
      mode: params.dryRun ? "dry-run" : "live",
      account: context.account.address,
      contentId: params.contentId,
      direction: params.direction,
      stakeAmount: params.stakeAmount,
      frontendAddress,
      approvalRequired,
      allowanceBefore: allowance.toString(),
      commitHash,
      targetRound: targetRound.toString(),
      drandChainHash,
      ...(params.reason ? { reason: params.reason } : {}),
    };

    if (params.dryRun) {
      if (!approvalRequired) {
        await this.simulateContract(context, {
          address: this.requireContracts().votingEngine,
          abi: RoundVotingEngineAbi as any,
          functionName: "commitVote",
          args: [contentId, commitHash, ciphertext, targetRound, drandChainHash, stakeAmount, frontendAddress],
        });
        result.simulation = "commitVote";
      } else {
        result.simulation = "preflight-only";
        result.simulationNote = "Allowance approval is required before commitVote can be simulated accurately";
      }

      return result;
    }

    let approvalTxHash: `0x${string}` | undefined;
    if (approvalRequired) {
      approvalTxHash = await this.writeContract(context, {
        address: this.requireContracts().crepToken,
        abi: CuryoReputationAbi,
        functionName: "approve",
        args: [this.requireContracts().votingEngine, stakeAmount],
      });
      result.approvalTxHash = approvalTxHash;
    }

    const voteRequest = {
      address: this.requireContracts().votingEngine,
      abi: RoundVotingEngineAbi as any,
      functionName: "commitVote",
      args: [contentId, commitHash, ciphertext, targetRound, drandChainHash, stakeAmount, frontendAddress],
    } as const;
    await this.simulateContract(context, voteRequest);
    const voteTxHash = await this.writeContract(context, voteRequest);

    result.voteTxHash = voteTxHash;
    return result;
  }

  async submitContent(
    identityId: string,
    params: {
      url: string;
      title: string;
      description: string;
      tags: string | string[];
      categoryId: string;
      dryRun?: boolean;
    },
  ): Promise<Record<string, unknown>> {
    const requestedCategoryId = BigInt(params.categoryId);
    const url = params.url.trim();
    const title = params.title.trim();
    const description = params.description.trim();
    const tags = normalizeTags(params.tags);

    if (!url) {
      throw new McpWriteServiceError("url is required");
    }
    if (!title) {
      throw new McpWriteServiceError("title is required");
    }
    if (!description) {
      throw new McpWriteServiceError("description is required");
    }
    if (!tags) {
      throw new McpWriteServiceError("tags are required");
    }
    if (requestedCategoryId <= 0n) {
      throw new McpWriteServiceError("categoryId must be greater than zero");
    }

    const submissionHost = getNormalizedUrlHost(url);
    if (!isAllowedSubmissionHost(submissionHost, this.config.policy.allowedSubmissionHosts)) {
      throw new McpWriteServiceError(`Submission host "${submissionHost}" is not allowed by MCP policy`);
    }

    const context = this.getContext(identityId);

    const hasVoterId = await this.readContract<boolean>(context, {
      address: this.requireContracts().voterIdNFT,
      abi: VoterIdNFTAbi,
      functionName: "hasVoterId",
      args: [context.account.address],
    });
    if (!hasVoterId) {
      throw new McpWriteServiceError("The bound wallet does not hold a Voter ID");
    }

    const [
      balance,
      allowance,
      minSubmitterStake,
      maxTitleLength,
      maxDescriptionLength,
      maxTagsLength,
      reservedSubmissionMinAge,
      isUrlSubmitted,
      preview,
    ] = await Promise.all([
      this.readContract<bigint>(context, {
        address: this.requireContracts().crepToken,
        abi: CuryoReputationAbi,
        functionName: "balanceOf",
        args: [context.account.address],
      }),
      this.readContract<bigint>(context, {
        address: this.requireContracts().crepToken,
        abi: CuryoReputationAbi,
        functionName: "allowance",
        args: [context.account.address, this.requireContracts().contentRegistry],
      }),
      this.readContract<bigint>(context, {
        address: this.requireContracts().contentRegistry,
        abi: ContentRegistryAbi,
        functionName: "MIN_SUBMITTER_STAKE",
        args: [],
      }),
      this.readContract<bigint>(context, {
        address: this.requireContracts().contentRegistry,
        abi: ContentRegistryAbi,
        functionName: "MAX_TITLE_LENGTH",
        args: [],
      }),
      this.readContract<bigint>(context, {
        address: this.requireContracts().contentRegistry,
        abi: ContentRegistryAbi,
        functionName: "MAX_DESCRIPTION_LENGTH",
        args: [],
      }),
      this.readContract<bigint>(context, {
        address: this.requireContracts().contentRegistry,
        abi: ContentRegistryAbi,
        functionName: "MAX_TAGS_LENGTH",
        args: [],
      }),
      this.readContract<bigint>(context, {
        address: this.requireContracts().contentRegistry,
        abi: ContentRegistryAbi,
        functionName: "RESERVED_SUBMISSION_MIN_AGE",
        args: [],
      }),
      this.readContract<boolean>(context, {
        address: this.requireContracts().contentRegistry,
        abi: ContentRegistryAbi,
        functionName: "isUrlSubmitted",
        args: [url],
      }),
      this.readContract<readonly [bigint, `0x${string}`]>(context, {
        address: this.requireContracts().contentRegistry,
        abi: ContentRegistryAbi,
        functionName: "previewSubmissionKey",
        args: [url, requestedCategoryId],
      }),
    ]);

    if (balance < minSubmitterStake) {
      throw new McpWriteServiceError(
        `Insufficient cREP balance for submission stake (${minSubmitterStake.toString()} required, ${balance.toString()} available)`,
      );
    }
    if (isUrlSubmitted) {
      throw new McpWriteServiceError("This URL is already submitted");
    }
    if (title.length > Number(maxTitleLength)) {
      throw new McpWriteServiceError(`title exceeds the on-chain maximum length of ${maxTitleLength.toString()} characters`);
    }
    if (description.length > Number(maxDescriptionLength)) {
      throw new McpWriteServiceError(
        `description exceeds the on-chain maximum length of ${maxDescriptionLength.toString()} characters`,
      );
    }
    if (tags.length > Number(maxTagsLength)) {
      throw new McpWriteServiceError(`tags exceed the on-chain maximum length of ${maxTagsLength.toString()} characters`);
    }

    const [, submissionKey] = preview;
    const salt = `0x${randomBytes(32).toString("hex")}` as `0x${string}`;
    const revealCommitment = keccak256(
      encodeAbiParameters(
        [
          { type: "bytes32" },
          { type: "string" },
          { type: "string" },
          { type: "string" },
          { type: "uint256" },
          { type: "bytes32" },
          { type: "address" },
        ],
        [submissionKey, title, description, tags, requestedCategoryId, salt, context.account.address],
      ),
    );

    const approvalRequired = allowance < minSubmitterStake;
    const waitMs = Math.max(DEFAULT_SUBMISSION_REVEAL_WAIT_MS, Number(reservedSubmissionMinAge) * 1_000 + 100);
    const result: Record<string, unknown> = {
      action: "submit_content",
      mode: params.dryRun ? "dry-run" : "live",
      account: context.account.address,
      url,
      title,
      description,
      tags,
      categoryId: params.categoryId,
      approvalRequired,
      allowanceBefore: allowance.toString(),
      submitterStake: minSubmitterStake.toString(),
      revealCommitment,
      reservationWaitMs: waitMs,
      revealPollIntervalMs: this.config.policy.submissionRevealPollIntervalMs,
      revealTimeoutMs: this.config.policy.submissionRevealTimeoutMs,
    };

    if (params.dryRun) {
      result.simulation = "preflight-only";
      result.simulationNote = "Submission requires a reserveSubmission step before submitContent";
      return result;
    }

    let approvalTxHash: `0x${string}` | undefined;
    if (approvalRequired) {
      approvalTxHash = await this.writeContract(context, {
        address: this.requireContracts().crepToken,
        abi: CuryoReputationAbi,
        functionName: "approve",
        args: [this.requireContracts().contentRegistry, minSubmitterStake],
      });
      result.approvalTxHash = approvalTxHash;
    }

    let reserveTxHash: `0x${string}` | undefined;
    try {
      reserveTxHash = await this.writeContract(context, {
        address: this.requireContracts().contentRegistry,
        abi: ContentRegistryAbi,
        functionName: "reserveSubmission",
        args: [revealCommitment],
      });
      result.reserveTxHash = reserveTxHash;
    } catch (error) {
      if (!isReservationExistsError(error)) {
        throw error;
      }
      result.reserveTxHash = "reservation-already-exists";
    }

    const submitRequest = {
      address: this.requireContracts().contentRegistry,
      abi: ContentRegistryAbi,
      functionName: "submitContent",
      args: [url, title, description, tags, requestedCategoryId, salt],
    } as const;
    const revealReadiness = await this.waitForSubmissionRevealReady(context, submitRequest, waitMs);
    result.submitSimulationAttempts = revealReadiness.attempts;
    result.revealReadyAfterMs = revealReadiness.waitedMs;

    const submitTxHash = await this.writeContract(context, submitRequest);

    result.submitTxHash = submitTxHash;
    return result;
  }

  async claimReward(
    identityId: string,
    params: {
      contentId: string;
      roundId: string;
      kind: "voter" | "submitter" | "participation" | "cancelled_refund";
      dryRun?: boolean;
    },
  ): Promise<Record<string, unknown>> {
    const context = this.getContext(identityId);
    const contentId = BigInt(params.contentId);
    const roundId = BigInt(params.roundId);
    if (contentId <= 0n || roundId <= 0n) {
      throw new McpWriteServiceError("contentId and roundId must be greater than zero");
    }
    const request = this.getRewardClaimRequest(contentId, roundId, params.kind);

    if (params.dryRun) {
      await this.simulateContract(context, request);
      return {
        action: "claim_reward",
        mode: "dry-run",
        account: context.account.address,
        contentId: params.contentId,
        roundId: params.roundId,
        kind: params.kind,
        simulation: request.functionName,
      };
    }

    await this.simulateContract(context, request);
    const txHash = await this.writeContract(context, request);
    return {
      action: "claim_reward",
      mode: "live",
      account: context.account.address,
      contentId: params.contentId,
      roundId: params.roundId,
      kind: params.kind,
      txHash,
    };
  }

  async claimFrontendFee(
    identityId: string,
    params: {
      contentId: string;
      roundId: string;
      frontendAddress?: Address;
      withdrawAccumulated?: boolean;
      dryRun?: boolean;
    },
  ): Promise<Record<string, unknown>> {
    const context = this.getContext(identityId);
    const contentId = BigInt(params.contentId);
    const roundId = BigInt(params.roundId);
    if (contentId <= 0n || roundId <= 0n) {
      throw new McpWriteServiceError("contentId and roundId must be greater than zero");
    }
    const frontendAddress = params.frontendAddress ?? context.identity.frontendAddress ?? context.account.address;

    if (context.account.address.toLowerCase() !== frontendAddress.toLowerCase()) {
      throw new McpWriteServiceError(
        "claim_frontend_fee requires the bound signer to be the frontend operator wallet for the selected frontend address",
      );
    }

    const preview = await this.readContract<readonly [bigint, number, Address, boolean]>(context, {
      address: this.requireContracts().roundRewardDistributor,
      abi: RoundRewardDistributorAbi,
      functionName: "previewFrontendFee",
      args: [contentId, roundId, frontendAddress],
    });
    const accruedBefore = await this.readContract<bigint>(context, {
      address: this.requireContracts().frontendRegistry,
      abi: FrontendRegistryAbi,
      functionName: "getAccumulatedFees",
      args: [frontendAddress],
    });

    const [fee, dispositionIndex, operator, alreadyClaimed] = preview;
    const disposition = formatFrontendFeeDisposition(dispositionIndex);
    if (fee <= 0n) {
      throw new McpWriteServiceError("No frontend fee is available for the requested round");
    }
    if (alreadyClaimed) {
      throw new McpWriteServiceError("The frontend fee for this round has already been claimed");
    }
    if (disposition === "protocol") {
      throw new McpWriteServiceError("This frontend fee is no longer claimable by the frontend");
    }
    if (operator.toLowerCase() !== context.account.address.toLowerCase()) {
      throw new McpWriteServiceError(
        "claim_frontend_fee preview resolved a different frontend operator wallet than the bound signer",
      );
    }

    const result: Record<string, unknown> = {
      action: "claim_frontend_fee",
      mode: params.dryRun ? "dry-run" : "live",
      account: context.account.address,
      contentId: params.contentId,
      roundId: params.roundId,
      frontendAddress,
      preview: {
        fee: fee.toString(),
        disposition,
        operator,
        alreadyClaimed,
        accruedBefore: accruedBefore.toString(),
      },
    };

    if (params.dryRun) {
      await this.simulateContract(context, {
        address: this.requireContracts().roundRewardDistributor,
        abi: RoundRewardDistributorAbi,
        functionName: "claimFrontendFee",
        args: [contentId, roundId, frontendAddress],
      });

      result.simulation = "claimFrontendFee";
      if (params.withdrawAccumulated) {
        if (accruedBefore > 0n) {
          await this.simulateContract(context, {
            address: this.requireContracts().frontendRegistry,
            abi: FrontendRegistryAbi,
            functionName: "claimFees",
            args: [],
          });
          result.withdrawSimulation = "claimFees";
        } else {
          result.withdrawSimulation = "post-claim-only";
          result.withdrawSimulationNote = "claimFees can only be simulated after frontend credits exist";
        }
      }

      return result;
    }

    const claimRequest = {
      address: this.requireContracts().roundRewardDistributor,
      abi: RoundRewardDistributorAbi,
      functionName: "claimFrontendFee",
      args: [contentId, roundId, frontendAddress],
    } as const;
    await this.simulateContract(context, claimRequest);
    const claimTxHash = await this.writeContract(context, claimRequest);
    result.claimTxHash = claimTxHash;

    if (params.withdrawAccumulated) {
      const accruedAfter = await this.readContract<bigint>(context, {
        address: this.requireContracts().frontendRegistry,
        abi: FrontendRegistryAbi,
        functionName: "getAccumulatedFees",
        args: [frontendAddress],
      });
      if (accruedAfter > 0n) {
        const withdrawRequest = {
          address: this.requireContracts().frontendRegistry,
          abi: FrontendRegistryAbi,
          functionName: "claimFees",
          args: [],
        } as const;
        await this.simulateContract(context, withdrawRequest);
        const withdrawTxHash = await this.writeContract(context, withdrawRequest);
        result.withdrawTxHash = withdrawTxHash;
        result.accruedAfter = accruedAfter.toString();
      }
    }

    return result;
  }

  private requireContracts() {
    if (!this.config.contracts) {
      throw new McpWriteServiceError("Hosted write contracts are not configured");
    }

    return this.config.contracts;
  }

  private getIdentity(identityId: string): WriteIdentityConfig {
    const identity = this.config.identities.find((candidate) => candidate.id === identityId);
    if (!identity) {
      throw new McpWriteServiceError(`Unknown write identity "${identityId}"`);
    }

    return identity;
  }

  private getContext(identityId: string): ExecutionContext {
    const cached = this.contextCache.get(identityId);
    if (cached) {
      return cached;
    }

    if (!this.config.enabled || !this.config.rpcUrl || !this.config.chainId || !this.config.chainName) {
      throw new McpWriteServiceError("Hosted write execution is not configured");
    }

    const identity = this.getIdentity(identityId);
    const account = resolveAccount(identity);
    const chain = defineChain({
      id: this.config.chainId,
      name: this.config.chainName,
      nativeCurrency: { name: "CELO", symbol: "CELO", decimals: 18 },
      rpcUrls: {
        default: { http: [this.config.rpcUrl] },
      },
    });

    const publicClient = createPublicClient({
      chain,
      transport: http(this.config.rpcUrl),
    });
    const walletClient = createWalletClient({
      account,
      chain,
      transport: http(this.config.rpcUrl),
    });

    const context: ExecutionContext = {
      account,
      chain,
      publicClient,
      walletClient,
      identity,
    };
    this.contextCache.set(identityId, context);
    return context;
  }

  private async readContract<T>(
    context: ExecutionContext,
    request: {
      address: Address;
      abi: unknown;
      functionName: string;
      args?: readonly unknown[];
    },
  ): Promise<T> {
    try {
      return (await context.publicClient.readContract(request as never)) as T;
    } catch (error) {
      throw new McpWriteServiceError(formatWriteError(error));
    }
  }

  private async simulateContract(
    context: ExecutionContext,
    request: {
      address: Address;
      abi: unknown;
      functionName: string;
      args?: readonly unknown[];
    },
  ): Promise<void> {
    try {
      await context.publicClient.simulateContract({
        ...request,
        account: context.account.address,
      } as never);
    } catch (error) {
      throw new McpWriteServiceError(formatWriteError(error));
    }
  }

  private async writeContract(
    context: ExecutionContext,
    request: {
      address: Address;
      abi: unknown;
      functionName: string;
      args?: readonly unknown[];
    },
  ): Promise<`0x${string}`> {
    try {
      const hash = await context.walletClient.writeContract({
        ...request,
        chain: context.chain,
        account: context.account,
        gas: this.config.maxGasPerTx > 0 ? BigInt(this.config.maxGasPerTx) : undefined,
      } as never);

      const receipt = await context.publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status === "reverted") {
        throw new McpWriteServiceError(`Transaction ${hash} reverted on-chain`);
      }

      return hash;
    } catch (error) {
      if (error instanceof McpWriteServiceError) {
        throw error;
      }

      throw new McpWriteServiceError(formatWriteError(error));
    }
  }

  private getRewardClaimRequest(contentId: bigint, roundId: bigint, kind: "voter" | "submitter" | "participation" | "cancelled_refund") {
    if (kind === "cancelled_refund") {
      return {
        address: this.requireContracts().votingEngine,
        abi: RoundVotingEngineAbi,
        functionName: "claimCancelledRoundRefund",
        args: [contentId, roundId],
      };
    }

    const functionName =
      kind === "submitter"
        ? "claimSubmitterReward"
        : kind === "participation"
          ? "claimParticipationReward"
          : "claimReward";

    return {
      address: this.requireContracts().roundRewardDistributor,
      abi: RoundRewardDistributorAbi,
      functionName,
      args: [contentId, roundId],
    };
  }

  private async waitForSubmissionRevealReady(
    context: ExecutionContext,
    request: {
      address: Address;
      abi: unknown;
      functionName: string;
      args?: readonly unknown[];
    },
    minimumWaitMs: number,
  ): Promise<{ attempts: number; waitedMs: number }> {
    if (this.config.policy.submissionRevealTimeoutMs < minimumWaitMs) {
      throw new McpWriteServiceError(
        `submit_content reveal timeout (${this.config.policy.submissionRevealTimeoutMs}ms) is shorter than the minimum reveal wait (${minimumWaitMs}ms)`,
      );
    }

    const startedAt = Date.now();
    await delay(minimumWaitMs);

    let attempts = 0;
    while (true) {
      attempts += 1;
      try {
        await this.simulateContract(context, request);
        return {
          attempts,
          waitedMs: Date.now() - startedAt,
        };
      } catch (error) {
        if (Date.now() - startedAt >= this.config.policy.submissionRevealTimeoutMs) {
          throw new McpWriteServiceError(`Timed out waiting for submit_content reveal readiness: ${formatWriteError(error)}`);
        }

        await delay(this.config.policy.submissionRevealPollIntervalMs);
      }
    }
  }
}

function resolveAccount(identity: WriteIdentityConfig): PrivateKeyAccount {
  if (identity.privateKey) {
    return privateKeyToAccount(identity.privateKey);
  }

  if (identity.keystoreAccount && identity.keystorePassword) {
    return getKeystoreAccountFromCredentials(identity.keystoreAccount, identity.keystorePassword);
  }

  throw new McpWriteServiceError(`Identity "${identity.id}" has no usable signer configuration`);
}

function normalizeTags(tags: string | string[]): string {
  if (Array.isArray(tags)) {
    return tags.map((tag) => tag.trim()).filter(Boolean).join(", ");
  }

  return tags.trim();
}

function formatFrontendFeeDisposition(index: number): FrontendFeeDisposition {
  return FRONTEND_FEE_DISPOSITIONS[index] ?? "protocol";
}

function formatWriteError(error: unknown): string {
  if (error instanceof McpWriteServiceError) {
    return error.message;
  }

  if (error instanceof BaseError) {
    const maybeShortMessage = (error as { shortMessage?: string }).shortMessage;
    return maybeShortMessage || error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Unexpected write execution error";
}

function isReservationExistsError(error: unknown): boolean {
  const message = formatWriteError(error);
  return message.includes("Reservation exists");
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function getNormalizedUrlHost(url: string): string {
  return new URL(url).hostname.trim().toLowerCase();
}

function isAllowedSubmissionHost(host: string, allowedHosts: readonly string[]): boolean {
  if (allowedHosts.length === 0) {
    return true;
  }

  return allowedHosts.some((allowedHost) => host === allowedHost || host.endsWith(`.${allowedHost}`));
}
