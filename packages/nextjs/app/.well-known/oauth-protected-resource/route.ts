import { NextRequest, NextResponse } from "next/server";
import { MCP_SCOPES } from "~~/lib/mcp/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function requestOrigin(request: NextRequest) {
  return new URL(request.url).origin;
}

export async function GET(request: NextRequest) {
  const origin = requestOrigin(request);
  const authorizationServer = process.env.CURYO_MCP_AUTHORIZATION_SERVER_URL?.trim();

  return NextResponse.json({
    bearer_methods_supported: ["header"],
    resource: `${origin}/api/mcp`,
    resource_name: "Curyo MCP",
    scopes_supported: Object.values(MCP_SCOPES),
    ...(authorizationServer ? { authorization_servers: [authorizationServer] } : {}),
  });
}
