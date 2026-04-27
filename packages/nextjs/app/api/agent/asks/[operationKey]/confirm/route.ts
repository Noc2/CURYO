import { NextRequest, NextResponse } from "next/server";
import { AGENT_WRITE_RATE_LIMIT, MCP_SCOPES, handleAgentRoute, parseJsonBody } from "~~/lib/agent/http";
import { callCuryoMcpTool } from "~~/lib/mcp/tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, context: { params: Promise<{ operationKey: string }> }) {
  const body = await parseJsonBody(request);
  if (body === null) {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const { operationKey } = await context.params;
  return handleAgentRoute({
    handler: ({ agent }) =>
      callCuryoMcpTool({
        agent,
        arguments: {
          ...body,
          operationKey,
        },
        name: "curyo_confirm_ask_transactions",
      }),
    rateLimit: AGENT_WRITE_RATE_LIMIT,
    request,
    requiredScope: MCP_SCOPES.ask,
  });
}
