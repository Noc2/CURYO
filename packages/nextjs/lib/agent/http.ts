import { NextRequest, NextResponse, after } from "next/server";
import {
  MCP_SCOPES,
  McpAuthError,
  type McpScope,
  authenticateMcpRequest,
  buildMcpAuthChallenge,
} from "~~/lib/mcp/auth";
import { normalizeToolError } from "~~/lib/mcp/tools";
import { checkRateLimit } from "~~/utils/rateLimit";

type AgentRouteRateLimit = {
  limit: number;
  windowMs: number;
};

type AgentRouteContext = {
  agent: ReturnType<typeof authenticateMcpRequest>;
  scheduleBackgroundTask: (task: () => Promise<void> | void) => void;
};

type AgentRouteOptions = {
  allowOnStoreUnavailable?: boolean;
  handler: (context: AgentRouteContext) => Promise<unknown>;
  rateLimit: AgentRouteRateLimit;
  request: NextRequest;
  requiredScope: McpScope;
};

function metadataUrl(request: Request) {
  return new URL("/.well-known/oauth-protected-resource", request.url).toString();
}

function authErrorBody(error: McpAuthError) {
  if (error.status === 503) {
    return {
      code: "service_unavailable",
      message: error.message,
      recoverWith: "configure_agent_auth",
      retryable: true,
      status: error.status,
    };
  }

  return {
    code: "transport_auth_required",
    message: error.message,
    recoverWith: error.status === 403 ? "grant_required_scope" : "provide_bearer_token",
    retryable: false,
    status: error.status,
  };
}

export async function handleAgentRoute(params: AgentRouteOptions) {
  const limited = await checkRateLimit(params.request, params.rateLimit, {
    allowOnStoreUnavailable: params.allowOnStoreUnavailable ?? false,
  });
  if (limited) return limited;

  let agent: ReturnType<typeof authenticateMcpRequest>;
  try {
    agent = authenticateMcpRequest(params.request, params.requiredScope);
  } catch (error) {
    if (error instanceof McpAuthError) {
      return NextResponse.json(authErrorBody(error), {
        headers: {
          "WWW-Authenticate": buildMcpAuthChallenge({
            metadataUrl: metadataUrl(params.request),
            scope: error.requiredScope,
          }),
        },
        status: error.status,
      });
    }
    throw error;
  }

  try {
    return NextResponse.json(
      await params.handler({
        agent,
        scheduleBackgroundTask: task => {
          after(task);
        },
      }),
    );
  } catch (error) {
    const normalized = normalizeToolError(error);
    return NextResponse.json(normalized, { status: normalized.status });
  }
}

export async function parseJsonBody(request: NextRequest) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export const AGENT_READ_RATE_LIMIT = { limit: 120, windowMs: 60_000 } satisfies AgentRouteRateLimit;
export const AGENT_WRITE_RATE_LIMIT = { limit: 30, windowMs: 60_000 } satisfies AgentRouteRateLimit;
export { MCP_SCOPES };
