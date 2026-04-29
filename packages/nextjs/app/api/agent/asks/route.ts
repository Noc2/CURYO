import { NextRequest, NextResponse } from "next/server";
import {
  AGENT_WRITE_RATE_LIMIT,
  MCP_SCOPES,
  handleAgentRoute,
  handlePublicAgentRoute,
  hasAgentBearerToken,
  parseJsonBody,
} from "~~/lib/agent/http";
import { callCuryoMcpTool, callPublicCuryoMcpTool } from "~~/lib/mcp/tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const body = await parseJsonBody(request);
  if (body === null) {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  if (!hasAgentBearerToken(request)) {
    return handlePublicAgentRoute({
      handler: () =>
        callPublicCuryoMcpTool({
          arguments: body,
          name: "curyo_ask_humans",
        }),
      rateLimit: AGENT_WRITE_RATE_LIMIT,
      request,
    });
  }

  return handleAgentRoute({
    handler: ({ agent, scheduleBackgroundTask }) =>
      callCuryoMcpTool({
        agent,
        arguments: body,
        name: "curyo_ask_humans",
        scheduleBackgroundTask,
      }),
    rateLimit: AGENT_WRITE_RATE_LIMIT,
    request,
    requiredScope: MCP_SCOPES.ask,
  });
}
