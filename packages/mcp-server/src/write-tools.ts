import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import type { ServerNotification, ServerRequest } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { ServerConfig } from "./config.js";
import { createChainEnvelope, errorToolResult, jsonToolResult } from "./lib/results.js";
import { logEvent, serializeError } from "./lib/logging.js";
import { recordWriteToolFailure, recordWriteToolInvocation } from "./metrics.js";
import { CuryoWriteService, McpWriteServiceError } from "./signer-service.js";

const addressSchema = z.string().regex(/^0x[0-9a-fA-F]{40}$/i, "Expected a 0x-prefixed address");
const bigintStringSchema = z.string().regex(/^\d+$/, "Expected an unsigned integer string");
const rewardKinds = ["voter", "submitter", "participation", "cancelled_refund"] as const;
const MAX_SUBMISSION_QUESTION_LENGTH = 120;

const writeToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
} as const;

const writeToolScopes = {
  vote: ["mcp:write", "mcp:write:vote"],
  submit_content: ["mcp:write", "mcp:write:submit_content"],
  claim_reward: ["mcp:write", "mcp:write:claim_reward"],
  claim_frontend_fee: ["mcp:write", "mcp:write:claim_frontend_fee"],
} as const;

export const WRITE_TOOL_CATALOG = [
  {
    name: "vote",
    title: "Commit A Curyo Vote",
    description: "Commit an authenticated tlock vote with an optional frontend attribution address.",
    upstream: "RoundVotingEngine.commitVote",
    input: {
      contentId: { type: "string", pattern: "^\\d+$" },
      direction: { type: "enum", values: ["up", "down"] },
      stakeAmount: { type: "string", pattern: "^\\d+$" },
      frontendAddress: { type: "string", pattern: "^0x[0-9a-fA-F]{40}$", optional: true },
      reason: { type: "string", optional: true },
      dryRun: { type: "boolean", default: false },
    },
  },
  {
    name: "submit_content",
    title: "Submit A Curyo Question",
    description: "Reserve and reveal a new Curyo question submission using the on-chain question flow.",
    upstream: "ContentRegistry.reserveSubmission + submitQuestion",
    input: {
      url: { type: "string", format: "url", optional: true },
      title: { type: "string", maxLength: MAX_SUBMISSION_QUESTION_LENGTH },
      description: { type: "string" },
      tags: { type: "string|string[]" },
      categoryId: { type: "string", pattern: "^\\d+$" },
      dryRun: { type: "boolean", default: false },
    },
  },
  {
    name: "claim_reward",
    title: "Claim A Curyo Reward",
    description: "Claim a voter, submitter, participation, or cancelled-round refund reward.",
    upstream: "RoundRewardDistributor.* / RoundVotingEngine.claimCancelledRoundRefund",
    input: {
      contentId: { type: "string", pattern: "^\\d+$" },
      roundId: { type: "string", pattern: "^\\d+$" },
      kind: { type: "enum", values: rewardKinds },
      dryRun: { type: "boolean", default: false },
    },
  },
  {
    name: "claim_frontend_fee",
    title: "Claim A Frontend Fee",
    description: "Claim the frontend fee for a settled round and optionally withdraw accumulated registry fees.",
    upstream: "RoundRewardDistributor.claimFrontendFee + FrontendRegistry.claimFees",
    input: {
      contentId: { type: "string", pattern: "^\\d+$" },
      roundId: { type: "string", pattern: "^\\d+$" },
      frontendAddress: { type: "string", pattern: "^0x[0-9a-fA-F]{40}$", optional: true },
      withdrawAccumulated: { type: "boolean", default: false },
      dryRun: { type: "boolean", default: false },
    },
  },
] as const;

type ToolHandlerExtra = RequestHandlerExtra<ServerRequest, ServerNotification>;

export function registerWriteTools(server: McpServer, config: ServerConfig, writeService: CuryoWriteService): void {
  if (!config.write.enabled) {
    return;
  }

  server.registerTool(
    "vote",
    {
      title: "Commit A Curyo Vote",
      description: "Commit an authenticated tlock vote with an optional frontend attribution address.",
      inputSchema: {
        contentId: bigintStringSchema,
        direction: z.enum(["up", "down"]),
        stakeAmount: bigintStringSchema,
        frontendAddress: addressSchema.optional(),
        reason: z.string().min(1).max(280).optional(),
        dryRun: z.boolean().optional(),
      },
      annotations: writeToolAnnotations,
    },
    async (args, extra) =>
      runWriteTool(config, writeService, extra, writeToolScopes.vote, "vote", (identityId) =>
        writeService.vote(identityId, {
          ...args,
          frontendAddress: args.frontendAddress as `0x${string}` | undefined,
        }),
      ),
  );

  server.registerTool(
    "submit_content",
    {
      title: "Submit A Curyo Question",
      description: "Reserve and reveal a new Curyo question submission using the on-chain question flow.",
      inputSchema: {
        url: z.string().url().optional(),
        title: z.string().min(1).max(MAX_SUBMISSION_QUESTION_LENGTH),
        description: z.string().min(1),
        tags: z.union([z.string().min(1), z.array(z.string().min(1)).min(1).max(12)]),
        categoryId: bigintStringSchema,
        dryRun: z.boolean().optional(),
      },
      annotations: writeToolAnnotations,
    },
    async (args, extra) =>
      runWriteTool(config, writeService, extra, writeToolScopes.submit_content, "submit_content", (identityId) =>
        writeService.submitContent(identityId, args),
      ),
  );

  server.registerTool(
    "claim_reward",
    {
      title: "Claim A Curyo Reward",
      description: "Claim a voter, submitter, participation, or cancelled-round refund reward.",
      inputSchema: {
        contentId: bigintStringSchema,
        roundId: bigintStringSchema,
        kind: z.enum(rewardKinds),
        dryRun: z.boolean().optional(),
      },
      annotations: writeToolAnnotations,
    },
    async (args, extra) =>
      runWriteTool(config, writeService, extra, writeToolScopes.claim_reward, "claim_reward", (identityId) =>
        writeService.claimReward(identityId, args),
      ),
  );

  server.registerTool(
    "claim_frontend_fee",
    {
      title: "Claim A Frontend Fee",
      description: "Claim a frontend fee for a settled round and optionally withdraw accumulated registry fees.",
      inputSchema: {
        contentId: bigintStringSchema,
        roundId: bigintStringSchema,
        frontendAddress: addressSchema.optional(),
        withdrawAccumulated: z.boolean().optional(),
        dryRun: z.boolean().optional(),
      },
      annotations: writeToolAnnotations,
    },
    async (args, extra) =>
      runWriteTool(config, writeService, extra, writeToolScopes.claim_frontend_fee, "claim_frontend_fee", (identityId) =>
        writeService.claimFrontendFee(identityId, {
          ...args,
          frontendAddress: args.frontendAddress as `0x${string}` | undefined,
        }),
      ),
  );
}

async function runWriteTool(
  config: ServerConfig,
  writeService: CuryoWriteService,
  extra: ToolHandlerExtra,
  requiredScopes: readonly string[],
  action: string,
  handler: (identityId: string) => Promise<Record<string, unknown>>,
): Promise<CallToolResult> {
  const startedAt = Date.now();
  const authClientId = extra.authInfo?.clientId;
  const requestId = typeof extra.authInfo?.extra?.requestId === "string" ? extra.authInfo.extra.requestId : undefined;
  try {
    const warnings: string[] = [];
    const allowDefaultIdentity = !extra.authInfo && config.transport === "stdio" && !!config.write.defaultIdentityId;

    if (extra.authInfo) {
      ensureScopes(extra.authInfo, requiredScopes);
    } else if (!allowDefaultIdentity) {
      throw new McpWriteServiceError("Write tools require authenticated bearer tokens with write scopes");
    } else {
      warnings.push(`Using default stdio write identity "${config.write.defaultIdentityId}"`);
    }

    const identityId = writeService.resolveIdentityId(extra.authInfo, allowDefaultIdentity);
    const data = await handler(identityId);
    const account = typeof data.account === "string" ? data.account : "unknown";
    const mode = data.mode === "dry-run" ? "simulation" : "transaction";
    recordWriteToolInvocation(mode);
    logEvent("info", "mcp_write_tool_succeeded", {
      action,
      account,
      authClientId,
      identityId,
      mode,
      chainId: config.write.chainId,
      durationMs: Date.now() - startedAt,
      requestId,
    });

    return jsonToolResult(
      createChainEnvelope(
        {
          action,
          rpcUrl: config.write.rpcUrl ?? "unknown",
          chainId: config.write.chainId ?? 0,
          account,
          mode,
        },
        data,
        warnings,
      ),
    );
  } catch (error) {
    recordWriteToolFailure();
    const message = error instanceof Error ? error.message : "Unexpected write tool error";
    logEvent("warn", "mcp_write_tool_failed", {
      action,
      authClientId,
      chainId: config.write.chainId,
      durationMs: Date.now() - startedAt,
      requestId,
      ...serializeError(error),
    });
    return errorToolResult(message);
  }
}

function ensureScopes(authInfo: AuthInfo, requiredScopes: readonly string[]): void {
  const scopes = new Set(authInfo.scopes ?? []);
  if (requiredScopes.some((scope) => scopes.has(scope))) {
    return;
  }

  throw new McpWriteServiceError(`This bearer token lacks the required scope. Expected one of: ${requiredScopes.join(", ")}`);
}
