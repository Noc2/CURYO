import { NextRequest } from "next/server";
import { AGENT_READ_RATE_LIMIT, MCP_SCOPES, handleAgentRoute } from "~~/lib/agent/http";
import { getMcpAskAuditDetailsByClientRequest } from "~~/lib/mcp/audits";
import { McpToolError } from "~~/lib/mcp/tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const clientRequestId = searchParams.get("clientRequestId")?.trim() ?? "";
  const chainId = Number.parseInt(searchParams.get("chainId") ?? "", 10);

  return handleAgentRoute({
    allowOnStoreUnavailable: true,
    handler: async ({ agent }) => {
      if (!clientRequestId) {
        throw new McpToolError("clientRequestId is required.");
      }
      if (!Number.isSafeInteger(chainId) || chainId <= 0) {
        throw new McpToolError("chainId must be a positive integer.");
      }

      return (
        (await getMcpAskAuditDetailsByClientRequest({
          agentId: agent.id,
          chainId,
          clientRequestId,
        })) ?? {
          chainId,
          clientRequestId,
          status: "not_found",
        }
      );
    },
    rateLimit: AGENT_READ_RATE_LIMIT,
    request,
    requiredScope: MCP_SCOPES.read,
  });
}
