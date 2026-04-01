import { type McpSessionSigningKey, createMcpSessionToken } from "@curyo/node-utils/mcpSessionToken";
import "server-only";
import {
  buildSignedActionMessage,
  hashSignedActionPayload,
  issueSignedActionChallenge,
} from "~~/lib/auth/signedActions";
import { isValidWalletAddress, normalizeWalletAddress } from "~~/lib/watchlist/contentWatch";

export const MCP_SESSION_CHALLENGE_TITLE = "Curyo MCP session authorization";
export const MCP_SESSION_ACTION = "mcp:session";
export const DEFAULT_MCP_SESSION_TTL_MS = 60 * 60 * 1000;
export const DEFAULT_MCP_SESSION_SCOPES = ["mcp:read"] as const;
export const SUPPORTED_MCP_SESSION_SCOPES = [
  "mcp:read",
  "metrics:read",
  "mcp:write",
  "mcp:write:vote",
  "mcp:write:submit_content",
  "mcp:write:claim_reward",
  "mcp:write:claim_frontend_fee",
] as const;

const DEFAULT_MCP_SESSION_KEY_ID = "nextjs-default";
const DEFAULT_MCP_SESSION_ISSUER = "curyo-nextjs";
const DEFAULT_MCP_SESSION_AUDIENCE = "curyo-mcp";
const CLIENT_NAME_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9 .:_-]{0,47}$/;
const SUPPORTED_SCOPE_SET = new Set<string>(SUPPORTED_MCP_SESSION_SCOPES);
const WRITE_SCOPE_PREFIX = "mcp:write";

type McpSessionScope = (typeof SUPPORTED_MCP_SESSION_SCOPES)[number];
type McpSessionEnv = Record<string, string | undefined>;
type McpSessionAuthErrorCode = "NOT_CONFIGURED" | "INVALID_CONFIG" | "UNBOUND_WALLET" | "DISALLOWED_SCOPE";

type RawMcpSessionWalletBinding = {
  walletAddress?: string;
  identityId?: string | null;
  scopes?: string[];
  label?: string | null;
};

export interface McpSessionWalletBinding {
  walletAddress: `0x${string}`;
  identityId: string | null;
  scopes: McpSessionScope[];
  label: string | null;
}

export interface NormalizedMcpSessionRequest {
  normalizedAddress: `0x${string}`;
  scopes: McpSessionScope[];
  clientName: string | null;
}

export interface IssuedMcpSessionToken {
  accessToken: string;
  tokenType: "Bearer";
  expiresAt: string;
  expiresInSeconds: number;
  issuedAt: string;
  clientId: string;
  subject: `0x${string}`;
  scopes: McpSessionScope[];
  identityId: string | null;
  label: string | null;
  sessionId: string;
}

export class McpSessionAuthError extends Error {
  readonly code: McpSessionAuthErrorCode;

  constructor(code: McpSessionAuthErrorCode, message: string) {
    super(message);
    this.name = "McpSessionAuthError";
    this.code = code;
  }
}

export function normalizeMcpSessionRequest(
  body: Record<string, unknown>,
): { ok: true; payload: NormalizedMcpSessionRequest } | { ok: false; error: string } {
  if (!body.address || typeof body.address !== "string" || !isValidWalletAddress(body.address)) {
    return { ok: false, error: "Invalid wallet address" };
  }

  const normalizedScopes = normalizeRequestedScopes(body.scopes);
  if (!normalizedScopes.ok) {
    return normalizedScopes;
  }

  const clientName = normalizeClientName(body.clientName);
  if (!clientName.ok) {
    return clientName;
  }

  return {
    ok: true,
    payload: {
      normalizedAddress: normalizeWalletAddress(body.address),
      scopes: normalizedScopes.scopes,
      clientName: clientName.clientName,
    },
  };
}

export function hashMcpSessionPayload(payload: NormalizedMcpSessionRequest): string {
  return hashSignedActionPayload([
    payload.normalizedAddress,
    `scopes:${payload.scopes.join(",")}`,
    `client:${payload.clientName ?? ""}`,
  ]);
}

export function getMcpSessionChallengeRateLimitKeyParts(payload: NormalizedMcpSessionRequest) {
  return [payload.normalizedAddress, payload.scopes.join(","), payload.clientName ?? undefined];
}

export function buildMcpSessionChallengeMessage(params: {
  address: `0x${string}`;
  payloadHash: string;
  nonce: string;
  expiresAt: Date;
}): string {
  return buildSignedActionMessage({
    title: MCP_SESSION_CHALLENGE_TITLE,
    action: MCP_SESSION_ACTION,
    address: params.address,
    payloadHash: params.payloadHash,
    nonce: params.nonce,
    expiresAt: params.expiresAt,
  });
}

export async function issueMcpSessionChallenge(
  payload: NormalizedMcpSessionRequest,
  env: McpSessionEnv = process.env,
): Promise<{
  challenge: {
    challengeId: string;
    message: string;
    expiresAt: string;
  };
  binding: McpSessionWalletBinding;
}> {
  ensureMcpSessionIssuanceConfigured(env);
  const binding = resolveMcpSessionBindingForRequest(payload, env);
  const challenge = await issueSignedActionChallenge({
    title: MCP_SESSION_CHALLENGE_TITLE,
    action: MCP_SESSION_ACTION,
    walletAddress: payload.normalizedAddress,
    payloadHash: hashMcpSessionPayload(payload),
  });

  return { challenge, binding };
}

export function issueMcpSessionToken(
  payload: NormalizedMcpSessionRequest,
  env: McpSessionEnv = process.env,
): IssuedMcpSessionToken {
  const key = loadMcpSessionSigningKey(env);
  const binding = resolveMcpSessionBindingForRequest(payload, env);
  const ttlMs = loadMcpSessionTtlMs(env);
  const { token, claims } = createMcpSessionToken({
    key,
    subject: payload.normalizedAddress,
    clientId: buildMcpSessionClientId(payload.normalizedAddress, payload.clientName),
    scopes: payload.scopes,
    identityId: binding.identityId,
    ttlMs,
  });

  return {
    accessToken: token,
    tokenType: "Bearer",
    expiresAt: new Date(claims.exp * 1000).toISOString(),
    expiresInSeconds: claims.exp - claims.iat,
    issuedAt: new Date(claims.iat * 1000).toISOString(),
    clientId: claims.clientId,
    subject: claims.sub as `0x${string}`,
    scopes: claims.scopes as McpSessionScope[],
    identityId: claims.identityId,
    label: binding.label,
    sessionId: claims.jti,
  };
}

export function mapMcpSessionAuthError(error: unknown): { status: number; error: string } | null {
  if (!(error instanceof McpSessionAuthError)) {
    return null;
  }

  switch (error.code) {
    case "NOT_CONFIGURED":
      return { status: 503, error: "MCP session auth is not configured" };
    case "INVALID_CONFIG":
      return { status: 500, error: "MCP session auth is misconfigured" };
    case "UNBOUND_WALLET":
      return { status: 403, error: "This wallet is not configured for MCP sessions" };
    case "DISALLOWED_SCOPE":
      return { status: 403, error: error.message };
    default:
      return null;
  }
}

export function getMcpSessionRoutes() {
  return {
    challengePath: "/api/mcp/session/challenge",
    tokenPath: "/api/mcp/session/token",
  };
}

export function getSupportedMcpSessionScopes(): readonly McpSessionScope[] {
  return SUPPORTED_MCP_SESSION_SCOPES;
}

export function getDefaultMcpSessionTtlMs(env: McpSessionEnv = process.env): number {
  return loadMcpSessionTtlMs(env);
}

function ensureMcpSessionIssuanceConfigured(env: McpSessionEnv): void {
  loadMcpSessionSigningKey(env);
  loadMcpSessionBindings(env);
}

function resolveMcpSessionBindingForRequest(
  payload: NormalizedMcpSessionRequest,
  env: McpSessionEnv,
): McpSessionWalletBinding {
  const bindings = loadMcpSessionBindings(env);
  const binding = bindings.find(candidate => candidate.walletAddress === payload.normalizedAddress);
  if (!binding) {
    throw new McpSessionAuthError("UNBOUND_WALLET", "This wallet is not configured for MCP sessions");
  }

  const bindingScopes = new Set(binding.scopes);
  const disallowedScopes = payload.scopes.filter(scope => !bindingScopes.has(scope));
  if (disallowedScopes.length > 0) {
    throw new McpSessionAuthError(
      "DISALLOWED_SCOPE",
      `Requested MCP scopes are not allowed for this wallet: ${disallowedScopes.join(", ")}`,
    );
  }

  const requiresWriteIdentity = payload.scopes.some(
    scope => scope === WRITE_SCOPE_PREFIX || scope.startsWith(`${WRITE_SCOPE_PREFIX}:`),
  );
  if (requiresWriteIdentity && !binding.identityId) {
    throw new McpSessionAuthError(
      "DISALLOWED_SCOPE",
      "Requested write scopes require a wallet binding with a write identity",
    );
  }

  return binding;
}

function loadMcpSessionSigningKey(env: McpSessionEnv): McpSessionSigningKey {
  const secret = env.CURYO_MCP_HTTP_SESSION_SECRET?.trim();
  if (!secret) {
    throw new McpSessionAuthError(
      "NOT_CONFIGURED",
      "CURYO_MCP_HTTP_SESSION_SECRET is required to issue MCP session tokens",
    );
  }

  return {
    keyId: env.CURYO_MCP_HTTP_SESSION_KEY_ID?.trim() || DEFAULT_MCP_SESSION_KEY_ID,
    secret,
    issuer: env.CURYO_MCP_HTTP_SESSION_ISSUER?.trim() || DEFAULT_MCP_SESSION_ISSUER,
    audience: env.CURYO_MCP_HTTP_SESSION_AUDIENCE?.trim() || DEFAULT_MCP_SESSION_AUDIENCE,
  };
}

function loadMcpSessionBindings(env: McpSessionEnv): McpSessionWalletBinding[] {
  const rawBindings = env.CURYO_MCP_SESSION_WALLET_BINDINGS?.trim();
  if (!rawBindings) {
    throw new McpSessionAuthError(
      "NOT_CONFIGURED",
      "CURYO_MCP_SESSION_WALLET_BINDINGS is required to issue wallet-bound MCP sessions",
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBindings);
  } catch {
    throw new McpSessionAuthError("INVALID_CONFIG", "CURYO_MCP_SESSION_WALLET_BINDINGS must be valid JSON");
  }

  if (!Array.isArray(parsed)) {
    throw new McpSessionAuthError("INVALID_CONFIG", "CURYO_MCP_SESSION_WALLET_BINDINGS must be a JSON array");
  }

  const seenWallets = new Set<string>();
  const bindings: McpSessionWalletBinding[] = [];

  for (const [index, rawBinding] of parsed.entries()) {
    if (!rawBinding || typeof rawBinding !== "object") {
      throw new McpSessionAuthError("INVALID_CONFIG", `CURYO_MCP_SESSION_WALLET_BINDINGS[${index}] must be an object`);
    }

    const candidate = rawBinding as RawMcpSessionWalletBinding;
    const walletAddress = candidate.walletAddress?.trim();
    if (!walletAddress || !isValidWalletAddress(walletAddress)) {
      throw new McpSessionAuthError(
        "INVALID_CONFIG",
        `CURYO_MCP_SESSION_WALLET_BINDINGS[${index}].walletAddress must be a valid wallet address`,
      );
    }

    const normalizedWalletAddress = normalizeWalletAddress(walletAddress);
    if (seenWallets.has(normalizedWalletAddress)) {
      throw new McpSessionAuthError(
        "INVALID_CONFIG",
        `CURYO_MCP_SESSION_WALLET_BINDINGS contains duplicate wallet address "${normalizedWalletAddress}"`,
      );
    }

    const configuredScopes = normalizeConfiguredScopes(
      candidate.scopes,
      `CURYO_MCP_SESSION_WALLET_BINDINGS[${index}].scopes`,
    );
    const identityId = candidate.identityId?.trim() || null;

    if (
      configuredScopes.some(scope => scope === WRITE_SCOPE_PREFIX || scope.startsWith(`${WRITE_SCOPE_PREFIX}:`)) &&
      !identityId
    ) {
      throw new McpSessionAuthError(
        "INVALID_CONFIG",
        `CURYO_MCP_SESSION_WALLET_BINDINGS[${index}] must include identityId when write scopes are configured`,
      );
    }

    bindings.push({
      walletAddress: normalizedWalletAddress,
      identityId,
      scopes: configuredScopes,
      label: candidate.label?.trim() || null,
    });
    seenWallets.add(normalizedWalletAddress);
  }

  if (bindings.length === 0) {
    throw new McpSessionAuthError(
      "NOT_CONFIGURED",
      "CURYO_MCP_SESSION_WALLET_BINDINGS must contain at least one configured wallet binding",
    );
  }

  return bindings;
}

function loadMcpSessionTtlMs(env: McpSessionEnv): number {
  const rawValue = env.CURYO_MCP_SESSION_TTL_MS?.trim();
  if (!rawValue) {
    return DEFAULT_MCP_SESSION_TTL_MS;
  }

  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new McpSessionAuthError("INVALID_CONFIG", "CURYO_MCP_SESSION_TTL_MS must be a positive integer");
  }

  return parsed;
}

function normalizeRequestedScopes(
  value: unknown,
): { ok: true; scopes: McpSessionScope[] } | { ok: false; error: string } {
  if (value === undefined) {
    return { ok: true, scopes: [...DEFAULT_MCP_SESSION_SCOPES] };
  }

  if (!Array.isArray(value)) {
    return { ok: false, error: "MCP scopes must be provided as an array of strings" };
  }

  return normalizeScopeList(value, "Requested MCP scopes");
}

function normalizeConfiguredScopes(value: unknown, label: string): McpSessionScope[] {
  const normalized = normalizeScopeList(value ?? DEFAULT_MCP_SESSION_SCOPES, label);
  if (!normalized.ok) {
    throw new McpSessionAuthError("INVALID_CONFIG", normalized.error);
  }

  return normalized.scopes;
}

function normalizeScopeList(
  value: unknown,
  label: string,
): { ok: true; scopes: McpSessionScope[] } | { ok: false; error: string } {
  if (!Array.isArray(value)) {
    return { ok: false, error: `${label} must be an array of strings` };
  }

  const scopes = Array.from(
    new Set(value.map(scope => (typeof scope === "string" ? scope.trim() : "")).filter(Boolean)),
  ).sort();

  if (scopes.length === 0) {
    return { ok: false, error: `${label} must include at least one scope` };
  }

  const unsupportedScopes = scopes.filter(scope => !SUPPORTED_SCOPE_SET.has(scope));
  if (unsupportedScopes.length > 0) {
    return {
      ok: false,
      error: `${label} contains unsupported scope values: ${unsupportedScopes.join(", ")}`,
    };
  }

  return { ok: true, scopes: scopes as McpSessionScope[] };
}

function normalizeClientName(value: unknown): { ok: true; clientName: string | null } | { ok: false; error: string } {
  if (value === undefined || value === null) {
    return { ok: true, clientName: null };
  }

  if (typeof value !== "string") {
    return { ok: false, error: "clientName must be a string when provided" };
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return { ok: true, clientName: null };
  }

  if (!CLIENT_NAME_REGEX.test(trimmed)) {
    return {
      ok: false,
      error: "clientName may only contain letters, numbers, spaces, dots, colons, underscores, and dashes",
    };
  }

  return { ok: true, clientName: trimmed };
}

function buildMcpSessionClientId(walletAddress: `0x${string}`, clientName: string | null): string {
  const base = `wallet:${walletAddress}`;
  if (!clientName) {
    return base;
  }

  return `${base}:${slugifyClientName(clientName)}`;
}

function slugifyClientName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}
