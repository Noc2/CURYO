import { NextRequest, NextResponse } from "next/server";
import { AGENT_WRITE_RATE_LIMIT, MCP_SCOPES, handleAgentRoute, parseJsonBody } from "~~/lib/agent/http";
import { callCuryoMcpTool } from "~~/lib/mcp/tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const body = await parseJsonBody(request);
  if (body === null) {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
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
