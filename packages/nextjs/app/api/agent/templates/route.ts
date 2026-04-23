import { NextRequest } from "next/server";
import { AGENT_READ_RATE_LIMIT, MCP_SCOPES, handleAgentRoute } from "~~/lib/agent/http";
import { callCuryoMcpTool } from "~~/lib/mcp/tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return handleAgentRoute({
    allowOnStoreUnavailable: true,
    handler: ({ agent }) =>
      callCuryoMcpTool({
        agent,
        arguments: {},
        name: "curyo_list_result_templates",
      }),
    rateLimit: AGENT_READ_RATE_LIMIT,
    request,
    requiredScope: MCP_SCOPES.read,
  });
}
