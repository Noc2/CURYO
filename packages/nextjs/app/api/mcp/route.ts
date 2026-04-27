import { NextRequest, NextResponse, after } from "next/server";
import { McpAuthError, authenticateMcpRequest, buildMcpAuthChallenge } from "~~/lib/mcp/auth";
import { MCP_TOOLS, callCuryoMcpTool, getMcpToolRequiredScope, normalizeToolError } from "~~/lib/mcp/tools";
import { checkRateLimit } from "~~/utils/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const DEFAULT_MCP_PROTOCOL_VERSION = "2025-11-25";
const SUPPORTED_MCP_PROTOCOL_VERSIONS = new Set(["2025-06-18", DEFAULT_MCP_PROTOCOL_VERSION]);
const RATE_LIMIT = { limit: 120, windowMs: 60_000 };

type JsonRpcRequest = {
  id?: string | number | null;
  jsonrpc?: string;
  method?: string;
  params?: Record<string, unknown>;
};

function metadataUrl(request: Request) {
  return new URL("/.well-known/oauth-protected-resource", request.url).toString();
}

function corsHeaders(request: Request) {
  const origin = request.headers.get("origin");
  const allowedOrigins = (process.env.CURYO_MCP_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map(value => value.trim())
    .filter(Boolean);
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, content-type, mcp-protocol-version",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Expose-Headers": "mcp-session-id, www-authenticate",
    Vary: "Origin",
  };

  if (origin && (allowedOrigins.includes("*") || allowedOrigins.includes(origin))) {
    headers["Access-Control-Allow-Origin"] = origin;
  }

  return headers;
}

function originAllowed(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const allowedOrigins = (process.env.CURYO_MCP_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map(value => value.trim())
    .filter(Boolean);
  return allowedOrigins.includes("*") || allowedOrigins.includes(origin);
}

function jsonRpcResult(id: JsonRpcRequest["id"], result: unknown, request: Request) {
  return NextResponse.json(
    {
      id,
      jsonrpc: "2.0",
      result,
    },
    { headers: corsHeaders(request) },
  );
}

function jsonRpcError(id: JsonRpcRequest["id"], code: number, message: string, request: Request, data?: unknown) {
  return NextResponse.json(
    {
      error: {
        code,
        data,
        message,
      },
      id: id ?? null,
      jsonrpc: "2.0",
    },
    { headers: corsHeaders(request), status: code === -32603 ? 500 : 200 },
  );
}

function jsonRpcHttpError(
  id: JsonRpcRequest["id"],
  code: number,
  message: string,
  request: Request,
  status: number,
  data?: unknown,
) {
  return NextResponse.json(
    {
      error: {
        code,
        data,
        message,
      },
      id: id ?? null,
      jsonrpc: "2.0",
    },
    { headers: corsHeaders(request), status },
  );
}

function negotiateProtocolVersion(body: JsonRpcRequest) {
  const requestedVersion =
    body.params && typeof body.params.protocolVersion === "string" ? body.params.protocolVersion : "";
  return SUPPORTED_MCP_PROTOCOL_VERSIONS.has(requestedVersion) ? requestedVersion : DEFAULT_MCP_PROTOCOL_VERSION;
}

function validateProtocolVersion(request: Request, body: JsonRpcRequest) {
  if (body.method === "initialize") return null;

  const protocolVersion = request.headers.get("mcp-protocol-version")?.trim() ?? "";
  if (!protocolVersion) {
    return "Missing MCP-Protocol-Version header.";
  }
  if (!SUPPORTED_MCP_PROTOCOL_VERSIONS.has(protocolVersion)) {
    return `Unsupported MCP-Protocol-Version: ${protocolVersion}.`;
  }

  return null;
}

function toolResult(structuredContent: unknown) {
  return {
    content: [
      {
        text: JSON.stringify(structuredContent),
        type: "text",
      },
    ],
    isError: false,
    structuredContent,
  };
}

function toolErrorResult(error: unknown) {
  const normalized = normalizeToolError(error);
  return {
    content: [
      {
        text: JSON.stringify(normalized),
        type: "text",
      },
    ],
    isError: true,
    structuredContent: normalized,
  };
}

function authErrorResponse(error: McpAuthError, request: Request) {
  return NextResponse.json(
    { error: error.message },
    {
      headers: {
        ...corsHeaders(request),
        "WWW-Authenticate": buildMcpAuthChallenge({
          metadataUrl: metadataUrl(request),
          scope: error.requiredScope,
        }),
      },
      status: error.status,
    },
  );
}

export async function OPTIONS(request: NextRequest) {
  return new Response(null, {
    headers: corsHeaders(request),
    status: 204,
  });
}

export async function GET(request: NextRequest) {
  return NextResponse.json(
    {
      allowedMethods: ["POST", "OPTIONS"],
      error: "SSE streams are not enabled for this Curyo MCP release. Use POST JSON-RPC calls over streamable HTTP.",
      supportedTransports: ["streamable-http"],
    },
    { headers: { ...corsHeaders(request), Allow: "POST, OPTIONS" }, status: 405 },
  );
}

export async function DELETE(request: NextRequest) {
  return new Response(null, {
    headers: corsHeaders(request),
    status: 405,
  });
}

export async function POST(request: NextRequest) {
  if (!originAllowed(request)) {
    return NextResponse.json({ error: "Origin is not allowed for this MCP server." }, { status: 403 });
  }

  const limited = await checkRateLimit(request, RATE_LIMIT, { allowOnStoreUnavailable: false });
  if (limited) return limited;

  let body: JsonRpcRequest;
  try {
    body = (await request.json()) as JsonRpcRequest;
  } catch {
    return jsonRpcError(null, -32700, "Parse error", request);
  }

  if (body.jsonrpc !== "2.0" || typeof body.method !== "string") {
    return jsonRpcError(body.id, -32600, "Invalid Request", request);
  }

  const protocolVersionError = validateProtocolVersion(request, body);
  if (protocolVersionError) {
    return jsonRpcHttpError(body.id, -32000, protocolVersionError, request, 400, {
      supportedProtocolVersions: Array.from(SUPPORTED_MCP_PROTOCOL_VERSIONS),
    });
  }

  if (body.id === undefined || body.id === null) {
    return new Response(null, { headers: corsHeaders(request), status: 202 });
  }

  try {
    const agent = await authenticateMcpRequest(request);

    if (body.method === "initialize") {
      return jsonRpcResult(
        body.id,
        {
          capabilities: {
            tools: {
              listChanged: false,
            },
          },
          protocolVersion: negotiateProtocolVersion(body),
          serverInfo: {
            name: "curyo",
            version: "0.1.0",
          },
        },
        request,
      );
    }

    if (body.method === "ping") {
      return jsonRpcResult(body.id, {}, request);
    }

    if (body.method === "tools/list") {
      return jsonRpcResult(
        body.id,
        {
          tools: MCP_TOOLS.map(tool => ({
            ...(tool.annotations ? { annotations: tool.annotations } : {}),
            description: tool.description,
            inputSchema: tool.inputSchema,
            name: tool.name,
            ...(tool.outputSchema ? { outputSchema: tool.outputSchema } : {}),
            title: tool.title,
          })),
        },
        request,
      );
    }

    if (body.method === "tools/call") {
      const name = typeof body.params?.name === "string" ? body.params.name : "";
      const requiredScope = getMcpToolRequiredScope(name);
      if (!requiredScope) {
        return jsonRpcError(body.id, -32602, `Unknown tool: ${name || "missing"}`, request);
      }
      await authenticateMcpRequest(request, requiredScope);

      const result = await callCuryoMcpTool({
        agent,
        arguments: body.params?.arguments,
        name,
        scheduleBackgroundTask: after,
      }).then(toolResult, toolErrorResult);

      return jsonRpcResult(body.id, result, request);
    }

    return jsonRpcError(body.id, -32601, `Method not found: ${body.method}`, request);
  } catch (error) {
    if (error instanceof McpAuthError) {
      return authErrorResponse(error, request);
    }

    return jsonRpcError(body.id, -32603, "Internal error", request, {
      message: error instanceof Error ? error.message : String(error),
    });
  }
}
