import { NextRequest, NextResponse } from "next/server";
import { MCP_SCOPES } from "~~/lib/mcp/auth";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const origin = new URL(request.url).origin;
  const authorizationServer = process.env.CURYO_MCP_AUTHORIZATION_SERVER_URL?.trim();
  const metadata: Record<string, unknown> = {
    bearer_token_authentication: {
      mode: "pre_registered",
    },
    resource: new URL("/api/mcp", origin).toString(),
    scopes_supported: [MCP_SCOPES.ask, MCP_SCOPES.balance, MCP_SCOPES.quote, MCP_SCOPES.read],
  };

  if (authorizationServer) {
    metadata.authorization_servers = [authorizationServer];
  }

  return NextResponse.json(metadata);
}
