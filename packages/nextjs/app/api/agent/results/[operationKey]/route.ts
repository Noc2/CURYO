import { NextRequest } from "next/server";
import {
  AGENT_READ_RATE_LIMIT,
  MCP_SCOPES,
  handleAgentRoute,
  handlePublicAgentRoute,
  hasAgentBearerToken,
} from "~~/lib/agent/http";
import { callCuryoMcpTool, callPublicCuryoMcpTool } from "~~/lib/mcp/tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: { params: Promise<{ operationKey: string }> }) {
  const { operationKey } = await context.params;
  const contentId = request.nextUrl.searchParams.get("contentId")?.trim() ?? "";

  if (!hasAgentBearerToken(request)) {
    return handlePublicAgentRoute({
      allowOnStoreUnavailable: true,
      handler: () =>
        callPublicCuryoMcpTool({
          arguments: {
            operationKey,
            ...(contentId ? { contentId } : {}),
          },
          name: "curyo_get_result",
        }),
      rateLimit: AGENT_READ_RATE_LIMIT,
      request,
    });
  }

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
