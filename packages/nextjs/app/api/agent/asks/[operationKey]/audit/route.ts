import { NextRequest } from "next/server";
import { AGENT_READ_RATE_LIMIT, MCP_SCOPES, handleAgentRoute } from "~~/lib/agent/http";
import { getMcpAskAuditDetailsByOperation } from "~~/lib/mcp/audits";
import { McpToolError } from "~~/lib/mcp/tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ operationKey: string }> },
) {
  const { operationKey } = await context.params;

  return handleAgentRoute({
    allowOnStoreUnavailable: true,
    handler: async ({ agent }) => {
      if (!/^0x[a-fA-F0-9]{64}$/.test(operationKey)) {
        throw new McpToolError("operationKey must be a 32-byte hex string.");
      }

      return (
        (await getMcpAskAuditDetailsByOperation({
          agentId: agent.id,
          operationKey: operationKey as `0x${string}`,
        })) ?? {
          operationKey,
          status: "not_found",
        }
      );
    },
    rateLimit: AGENT_READ_RATE_LIMIT,
    request,
    requiredScope: MCP_SCOPES.read,
  });
}
