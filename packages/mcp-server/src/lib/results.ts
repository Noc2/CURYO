import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export interface DataEnvelope extends Record<string, unknown> {
  data: Record<string, unknown>;
  provenance: {
    source: "ponder";
    endpoint: string;
    baseUrl: string;
    retrievedAt: string;
  };
  freshness: {
    kind: "indexed";
  };
  warnings?: string[];
}

export function createDataEnvelope(
  baseUrl: string,
  endpoint: string,
  data: Record<string, unknown>,
  warnings?: string[],
): DataEnvelope {
  return {
    data,
    provenance: {
      source: "ponder",
      endpoint,
      baseUrl,
      retrievedAt: new Date().toISOString(),
    },
    freshness: {
      kind: "indexed",
    },
    ...(warnings && warnings.length > 0 ? { warnings } : {}),
  };
}

export function jsonToolResult(envelope: DataEnvelope): CallToolResult {
  return {
    structuredContent: envelope,
    content: [
      {
        type: "text",
        text: JSON.stringify(envelope, null, 2),
      },
    ],
  };
}

export function errorToolResult(message: string): CallToolResult {
  return {
    isError: true,
    content: [
      {
        type: "text",
        text: message,
      },
    ],
  };
}
