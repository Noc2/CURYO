import { NextRequest, NextResponse } from "next/server";
import { MCP_SCOPES } from "~~/lib/mcp/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MCP_RESOURCE_PATH = "/api/mcp";

function normalizeUrl(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
      return null;
    }
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

function resolveResourcePath(resource: string[] | undefined): string | null {
  if (!resource || resource.length === 0) return MCP_RESOURCE_PATH;

  const path = `/${resource.join("/")}`;
  return path === MCP_RESOURCE_PATH ? path : null;
}

export async function GET(request: NextRequest, context: { params: Promise<{ resource?: string[] | undefined }> }) {
  const params = await context.params;
  const resourcePath = resolveResourcePath(params.resource);
  if (!resourcePath) {
    return NextResponse.json({ error: "Unknown protected resource." }, { status: 404 });
  }

  const resource = new URL(resourcePath, request.url);
  resource.hash = "";
  resource.search = "";
  const authorizationServer = normalizeUrl(process.env.CURYO_MCP_AUTHORIZATION_SERVER_URL);

  return NextResponse.json(
    {
      ...(authorizationServer ? { authorization_servers: [authorizationServer] } : {}),
      bearer_methods_supported: ["header"],
      resource: resource.toString(),
      resource_documentation: new URL("/docs/ai#mcp-adapter-shape", request.url).toString(),
      resource_name: "Curyo MCP",
      scopes_supported: [MCP_SCOPES.quote, MCP_SCOPES.ask, MCP_SCOPES.read, MCP_SCOPES.balance],
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
