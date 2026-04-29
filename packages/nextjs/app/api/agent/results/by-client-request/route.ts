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

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const chainId = Number.parseInt(searchParams.get("chainId") ?? "", 10);
  const clientRequestId = searchParams.get("clientRequestId")?.trim() ?? "";
  const contentId = searchParams.get("contentId")?.trim() ?? "";
  const walletAddress = searchParams.get("walletAddress")?.trim() ?? "";

  if (!hasAgentBearerToken(request)) {
    return handlePublicAgentRoute({
      allowOnStoreUnavailable: true,
      handler: () =>
        callPublicCuryoMcpTool({
          arguments: {
            chainId,
            clientRequestId,
            ...(contentId ? { contentId } : {}),
            walletAddress,
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
          chainId,
          clientRequestId,
          ...(contentId ? { contentId } : {}),
        },
        name: "curyo_get_result",
      }),
    rateLimit: AGENT_READ_RATE_LIMIT,
    request,
    requiredScope: MCP_SCOPES.read,
  });
}
