import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

interface DataEnvelope extends Record<string, unknown> {
  data: Record<string, unknown>;
  provenance: {
    source: "ponder" | "chain";
    endpoint: string;
    baseUrl: string;
    retrievedAt: string;
    action?: string;
    chainId?: number;
    account?: string;
  };
  freshness: {
    kind: "indexed" | "onchain";
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

export function createChainEnvelope(
  source: {
    action: string;
    rpcUrl: string;
    chainId: number;
    account: string;
    mode: "simulation" | "transaction";
  },
  data: Record<string, unknown>,
  warnings?: string[],
): DataEnvelope {
  return {
    data,
    provenance: {
      source: "chain",
      endpoint: source.mode,
      baseUrl: source.rpcUrl,
      retrievedAt: new Date().toISOString(),
      action: source.action,
      chainId: source.chainId,
      account: source.account,
    },
    freshness: {
      kind: "onchain",
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
