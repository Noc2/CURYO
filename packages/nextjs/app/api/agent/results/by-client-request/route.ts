import { NextRequest } from "next/server";
import { AGENT_READ_RATE_LIMIT, MCP_SCOPES, handleAgentRoute } from "~~/lib/agent/http";
import { callCuryoMcpTool } from "~~/lib/mcp/tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const chainId = Number.parseInt(searchParams.get("chainId") ?? "", 10);
  const clientRequestId = searchParams.get("clientRequestId")?.trim() ?? "";

  return handleAgentRoute({
    allowOnStoreUnavailable: true,
    handler: ({ agent }) =>
      callCuryoMcpTool({
        agent,
        arguments: { chainId, clientRequestId },
        name: "curyo_get_result",
      }),
    rateLimit: AGENT_READ_RATE_LIMIT,
    request,
    requiredScope: MCP_SCOPES.read,
  });
}
