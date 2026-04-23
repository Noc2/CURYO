import { NextRequest } from "next/server";
import { AGENT_READ_RATE_LIMIT, MCP_SCOPES, handleAgentRoute } from "~~/lib/agent/http";
import { listMcpAskAuditExportRows } from "~~/lib/mcp/audits";
import { McpToolError } from "~~/lib/mcp/tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseOptionalDate(value: string | null, name: string) {
  if (!value) return undefined;
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    throw new McpToolError(`${name} must be an ISO-8601 timestamp.`);
  }
  return parsed;
}

function parseOptionalChainId(value: string | null) {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new McpToolError("chainId must be a positive integer.");
  }
  return parsed;
}

function parseOptionalLimit(value: string | null) {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new McpToolError("limit must be a positive integer.");
  }
  return parsed;
}

function toCsv(rows: Array<Record<string, unknown>>) {
  const headers = [
    "id",
    "operationKey",
    "clientRequestId",
    "chainId",
    "categoryId",
    "paymentAmount",
    "eventType",
    "status",
    "contentId",
    "error",
    "publicUrl",
    "createdAt",
    "payloadHash",
  ];
  const escape = (value: unknown) => {
    const text = value == null ? "" : String(value);
    return `"${text.replaceAll("\"", "\"\"")}"`;
  };

  return [
    headers.join(","),
    ...rows.map(row => headers.map(header => escape(row[header])).join(",")),
  ].join("\n");
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const format = (searchParams.get("format") ?? "json").trim().toLowerCase();

  return handleAgentRoute({
    allowOnStoreUnavailable: true,
    handler: async ({ agent }) => {
      if (format !== "json" && format !== "csv") {
        throw new McpToolError("format must be json or csv.");
      }

      const rows = await listMcpAskAuditExportRows({
        agentId: agent.id,
        chainId: parseOptionalChainId(searchParams.get("chainId")),
        eventType: searchParams.get("eventType")?.trim() || undefined,
        from: parseOptionalDate(searchParams.get("from"), "from"),
        limit: parseOptionalLimit(searchParams.get("limit")),
        status: searchParams.get("status")?.trim() || undefined,
        to: parseOptionalDate(searchParams.get("to"), "to"),
      });

      if (format === "csv") {
        return new Response(toCsv(rows), {
          headers: {
            "content-disposition": 'attachment; filename="curyo-agent-audits.csv"',
            "content-type": "text/csv; charset=utf-8",
          },
          status: 200,
        });
      }

      return {
        count: rows.length,
        items: rows,
      };
    },
    rateLimit: AGENT_READ_RATE_LIMIT,
    request,
    requiredScope: MCP_SCOPES.read,
  });
}
