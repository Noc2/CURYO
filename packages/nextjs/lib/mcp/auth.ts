import { createHash } from "crypto";
import { getMcpAgentFromPolicyTokenHash, hashMcpBearerToken } from "~~/lib/agent/policies";

export const MCP_SCOPES = {
  ask: "curyo:ask",
  balance: "curyo:balance",
  quote: "curyo:quote",
  read: "curyo:read",
} as const;

export type McpScope = (typeof MCP_SCOPES)[keyof typeof MCP_SCOPES];

export type McpAgentAuth = {
  allowedCategoryIds: Set<string> | null;
  dailyBudgetAtomic: bigint;
  id: string;
  perAskLimitAtomic: bigint;
  scopes: Set<string>;
  tokenHash: string;
  walletAddress: string | null;
};

export class McpAuthError extends Error {
  readonly status: number;
  readonly requiredScope?: string;

  constructor(message: string, status = 401, requiredScope?: string) {
    super(message);
    this.name = "McpAuthError";
    this.status = status;
    this.requiredScope = requiredScope;
  }
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function parseAtomicAmount(value: unknown, fieldName: string): bigint {
  const rawValue =
    typeof value === "number" || typeof value === "string" || typeof value === "bigint" ? String(value) : "";
  if (!/^\d+$/.test(rawValue.trim())) {
    throw new Error(`${fieldName} must be a non-negative integer string.`);
  }
  return BigInt(rawValue);
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function normalizeConfiguredAgent(value: unknown): McpAgentAuth | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const entry = value as Record<string, unknown>;
  const id = typeof entry.id === "string" ? entry.id.trim() : "";
  const tokenHash = typeof entry.tokenHash === "string" ? entry.tokenHash.trim().toLowerCase() : "";
  const token = typeof entry.token === "string" ? entry.token : "";
  const hash = tokenHash || (token ? sha256(token) : "");
  if (!id || !/^[a-f0-9]{64}$/.test(hash)) return null;

  const scopes = new Set(asStringArray(entry.scopes));
  const categories = asStringArray(entry.categories)
    .map(category => category.trim())
    .filter(Boolean);

  return {
    allowedCategoryIds: categories.length > 0 ? new Set(categories) : null,
    dailyBudgetAtomic: parseAtomicAmount(entry.dailyBudgetAtomic ?? entry.dailyBudget ?? "0", "dailyBudgetAtomic"),
    id,
    perAskLimitAtomic: parseAtomicAmount(entry.perAskLimitAtomic ?? entry.perAskLimit ?? "0", "perAskLimitAtomic"),
    scopes,
    tokenHash: hash,
    walletAddress: typeof entry.walletAddress === "string" ? entry.walletAddress.trim() || null : null,
  };
}

export function getConfiguredMcpAgents(): McpAgentAuth[] {
  const rawConfig = process.env.CURYO_MCP_AGENTS?.trim();
  if (rawConfig) {
    try {
      const parsed = JSON.parse(rawConfig);
      return Array.isArray(parsed)
        ? parsed.map(normalizeConfiguredAgent).filter((agent): agent is McpAgentAuth => agent !== null)
        : [];
    } catch {
      return [];
    }
  }

  const token = process.env.CURYO_MCP_BEARER_TOKEN?.trim();
  if (!token) return [];

  const scopes = process.env.CURYO_MCP_BEARER_SCOPES?.split(",")
    .map(scope => scope.trim())
    .filter(Boolean) ?? [MCP_SCOPES.ask, MCP_SCOPES.balance, MCP_SCOPES.quote, MCP_SCOPES.read];

  return [
    {
      allowedCategoryIds: null,
      dailyBudgetAtomic: parseAtomicAmount(
        process.env.CURYO_MCP_DAILY_BUDGET_USDC ?? "0",
        "CURYO_MCP_DAILY_BUDGET_USDC",
      ),
      id: process.env.CURYO_MCP_AGENT_ID?.trim() || "default",
      perAskLimitAtomic: parseAtomicAmount(
        process.env.CURYO_MCP_PER_ASK_LIMIT_USDC ?? "0",
        "CURYO_MCP_PER_ASK_LIMIT_USDC",
      ),
      scopes: new Set(scopes),
      tokenHash: sha256(token),
      walletAddress: process.env.CURYO_MCP_WALLET_ADDRESS?.trim() || null,
    },
  ];
}

function readBearerToken(request: Request): string | null {
  const authorization = request.headers.get("authorization") ?? "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

export function buildMcpAuthChallenge(params: { metadataUrl: string; scope?: string }) {
  const scope = params.scope ? `, scope="${params.scope}"` : "";
  return `Bearer realm="curyo-mcp", resource_metadata="${params.metadataUrl}"${scope}`;
}

function assertRequiredScope(agent: McpAgentAuth, requiredScope?: string) {
  if (requiredScope && !agent.scopes.has(requiredScope)) {
    throw new McpAuthError(`Missing required scope: ${requiredScope}.`, 403, requiredScope);
  }
}

export async function authenticateMcpRequest(request: Request, requiredScope?: string): Promise<McpAgentAuth> {
  const token = readBearerToken(request);
  if (!token) {
    throw new McpAuthError("Missing bearer token.", 401, requiredScope);
  }

  const agents = getConfiguredMcpAgents();
  const tokenHash = hashMcpBearerToken(token);
  const agent = agents.find(candidate => candidate.tokenHash === tokenHash);
  if (agent) {
    assertRequiredScope(agent, requiredScope);
    return agent;
  }

  let policyAgent: McpAgentAuth | null = null;
  if (process.env.DATABASE_URL) {
    try {
      policyAgent = await getMcpAgentFromPolicyTokenHash(tokenHash);
    } catch (error) {
      if (agents.length === 0) {
        console.warn("[mcp-auth] DB-backed agent lookup failed", error);
        throw new McpAuthError("MCP agent authentication is unavailable.", 503, requiredScope);
      }
    }
  }
  if (policyAgent) {
    assertRequiredScope(policyAgent, requiredScope);
    return policyAgent;
  }

  if (agents.length === 0 && !process.env.DATABASE_URL) {
    throw new McpAuthError("MCP agent authentication is not configured.", 503, requiredScope);
  }

  throw new McpAuthError("Invalid bearer token.", 401, requiredScope);
}
