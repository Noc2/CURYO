import { NextRequest } from "next/server";
import { AGENT_READ_RATE_LIMIT, MCP_SCOPES, handleAgentRoute } from "~~/lib/agent/http";
import { callCuryoMcpTool } from "~~/lib/mcp/tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: { params: Promise<{ operationKey: string }> }) {
  const { operationKey } = await context.params;
  const contentId = request.nextUrl.searchParams.get("contentId")?.trim() ?? "";

  return handleAgentRoute({
    allowOnStoreUnavailable: true,
    handler: ({ agent }) =>
      callCuryoMcpTool({
        agent,
        arguments: {
          operationKey,
          ...(contentId ? { contentId } : {}),
        },
        name: "curyo_get_result",
      }),
    rateLimit: AGENT_READ_RATE_LIMIT,
    request,
    requiredScope: MCP_SCOPES.read,
  });
}
