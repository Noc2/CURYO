import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export interface McpSessionSigningKey {
  keyId: string;
  secret: string;
  issuer: string;
  audience: string;
}

export interface McpSessionTokenClaims {
  iss: string;
  aud: string;
  sub: string;
  clientId: string;
  scopes: string[];
  identityId: string | null;
  jti: string;
  iat: number;
  nbf: number;
  exp: number;
  kind: "session";
}

export class McpSessionTokenError extends Error {
  readonly code:
    | "INVALID_TOKEN_FORMAT"
    | "INVALID_HEADER"
    | "INVALID_PAYLOAD"
    | "INVALID_SIGNATURE"
    | "UNKNOWN_KEY"
    | "TOKEN_EXPIRED"
    | "TOKEN_NOT_ACTIVE"
    | "INVALID_AUDIENCE"
    | "INVALID_ISSUER";

  constructor(
    code:
      | "INVALID_TOKEN_FORMAT"
      | "INVALID_HEADER"
      | "INVALID_PAYLOAD"
      | "INVALID_SIGNATURE"
      | "UNKNOWN_KEY"
      | "TOKEN_EXPIRED"
      | "TOKEN_NOT_ACTIVE"
      | "INVALID_AUDIENCE"
      | "INVALID_ISSUER",
    message: string,
  ) {
    super(message);
    this.name = "McpSessionTokenError";
    this.code = code;
  }
}

export function createMcpSessionToken(params: {
  key: McpSessionSigningKey;
  subject: string;
  scopes: readonly string[];
  clientId: string;
  identityId?: string | null;
  ttlMs: number;
  now?: Date;
  notBefore?: Date;
  sessionId?: string;
}): {
  token: string;
  claims: McpSessionTokenClaims;
} {
  const now = params.now ?? new Date();
  const issuedAt = Math.floor(now.getTime() / 1000);
  const notBefore = Math.floor((params.notBefore ?? now).getTime() / 1000);
  const expiresAt = Math.floor((now.getTime() + params.ttlMs) / 1000);

  const header = {
    alg: "HS256",
    typ: "JWT",
    kid: params.key.keyId,
  } as const;

  const claims: McpSessionTokenClaims = {
    iss: params.key.issuer,
    aud: params.key.audience,
    sub: params.subject,
    clientId: params.clientId,
    scopes: [...params.scopes],
    identityId: params.identityId ?? null,
    jti: params.sessionId ?? randomBytes(16).toString("hex"),
    iat: issuedAt,
    nbf: notBefore,
    exp: expiresAt,
    kind: "session",
  };

  const encodedHeader = base64UrlEncodeJson(header);
  const encodedPayload = base64UrlEncodeJson(claims);
  const signature = sign(`${encodedHeader}.${encodedPayload}`, params.key.secret);

  return {
    token: `${encodedHeader}.${encodedPayload}.${signature}`,
    claims,
  };
}

export function verifyMcpSessionToken(
  token: string,
  params: {
    keys: readonly McpSessionSigningKey[];
    now?: Date;
  },
): {
  claims: McpSessionTokenClaims;
  key: McpSessionSigningKey;
} {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new McpSessionTokenError("INVALID_TOKEN_FORMAT", "Expected a three-part bearer token");
  }

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const header = decodeJson<Record<string, unknown>>(encodedHeader, "INVALID_HEADER");
  const payload = decodeJson<Record<string, unknown>>(encodedPayload, "INVALID_PAYLOAD");

  if (header.alg !== "HS256" || typeof header.kid !== "string" || header.kid.length === 0) {
    throw new McpSessionTokenError("INVALID_HEADER", "Expected an HS256 header with a key id");
  }

  const key = params.keys.find((candidate) => candidate.keyId === header.kid);
  if (!key) {
    throw new McpSessionTokenError("UNKNOWN_KEY", `Unknown MCP session signing key "${String(header.kid)}"`);
  }

  const expectedSignature = sign(`${encodedHeader}.${encodedPayload}`, key.secret);
  if (!safeEqual(expectedSignature, encodedSignature)) {
    throw new McpSessionTokenError("INVALID_SIGNATURE", "Invalid MCP session token signature");
  }

  const claims = parseClaims(payload);
  const nowSeconds = Math.floor((params.now ?? new Date()).getTime() / 1000);

  if (claims.iss !== key.issuer) {
    throw new McpSessionTokenError("INVALID_ISSUER", "Unexpected MCP session token issuer");
  }
  if (claims.aud !== key.audience) {
    throw new McpSessionTokenError("INVALID_AUDIENCE", "Unexpected MCP session token audience");
  }
  if (nowSeconds < claims.nbf) {
    throw new McpSessionTokenError("TOKEN_NOT_ACTIVE", "MCP session token is not active yet");
  }
  if (nowSeconds >= claims.exp) {
    throw new McpSessionTokenError("TOKEN_EXPIRED", "MCP session token has expired");
  }

  return {
    claims,
    key,
  };
}

function parseClaims(payload: Record<string, unknown>): McpSessionTokenClaims {
  if (
    typeof payload.iss !== "string" ||
    typeof payload.aud !== "string" ||
    typeof payload.sub !== "string" ||
    typeof payload.clientId !== "string" ||
    !Array.isArray(payload.scopes) ||
    typeof payload.jti !== "string" ||
    typeof payload.iat !== "number" ||
    typeof payload.nbf !== "number" ||
    typeof payload.exp !== "number" ||
    payload.kind !== "session"
  ) {
    throw new McpSessionTokenError("INVALID_PAYLOAD", "MCP session token payload is missing required claims");
  }

  return {
    iss: payload.iss,
    aud: payload.aud,
    sub: payload.sub,
    clientId: payload.clientId,
    scopes: payload.scopes.filter((scope): scope is string => typeof scope === "string"),
    identityId: typeof payload.identityId === "string" ? payload.identityId : null,
    jti: payload.jti,
    iat: payload.iat,
    nbf: payload.nbf,
    exp: payload.exp,
    kind: "session",
  };
}

function base64UrlEncodeJson(value: unknown): string {
  return base64UrlEncode(Buffer.from(JSON.stringify(value), "utf8"));
}

function decodeJson<T>(value: string, code: "INVALID_HEADER" | "INVALID_PAYLOAD"): T {
  try {
    return JSON.parse(base64UrlDecode(value).toString("utf8")) as T;
  } catch {
    throw new McpSessionTokenError(code, "Failed to decode MCP session token JSON");
  }
}

function sign(value: string, secret: string): string {
  return base64UrlEncode(createHmac("sha256", secret).update(value, "utf8").digest());
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function base64UrlEncode(buffer: Buffer): string {
  return buffer.toString("base64url");
}

function base64UrlDecode(value: string): Buffer {
  return Buffer.from(value, "base64url");
}
