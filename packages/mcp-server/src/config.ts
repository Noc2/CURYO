import { createHash } from "node:crypto";
import { getSharedDeploymentAddress as getSharedArtifactAddress } from "@curyo/contracts/deployments";
import { isAddress, type Address } from "viem";
import { normalizeOrigin } from "./lib/origin.js";

export interface ServerConfig {
  ponderBaseUrl: string;
  ponderTimeoutMs: number;
  serverName: string;
  serverVersion: string;
  transport: ServerTransport;
  httpHost: string;
  httpPort: number;
  httpPath: string;
  httpPublicBaseUrl: string | null;
  httpCorsOrigin: string;
  httpAllowedOrigins: string[];
  httpAuthorizationServers: string[];
  httpResourceDocumentationUrl: string | null;
  httpAuth: HttpAuthConfig;
  httpRateLimit: HttpRateLimitConfig;
  write: WriteConfig;
}

export interface HttpAuthConfig {
  mode: HttpAuthMode;
  realm: string;
  tokenHashes: string[];
  scopes: string[];
  tokens: HttpAuthTokenConfig[];
  sessionKeys: HttpAuthSessionKeyConfig[];
}

export interface HttpAuthTokenConfig {
  tokenHash: string;
  clientId: string;
  scopes: string[];
  identityId: string | null;
  notBefore: string | null;
  expiresAt: string | null;
  subject: string | null;
  kind: "static" | "session";
}

export interface HttpAuthSessionKeyConfig {
  keyId: string;
  secret: string;
  issuer: string;
  audience: string;
}

export interface HttpRateLimitConfig {
  enabled: boolean;
  windowMs: number;
  readRequestsPerWindow: number;
  writeRequestsPerWindow: number;
  trustedProxyHeaders: string[];
}

export interface WriteIdentityConfig {
  id: string;
  label: string | null;
  privateKey?: `0x${string}`;
  keystoreAccount?: string;
  keystorePassword?: string;
  frontendAddress: Address | null;
}

export interface WriteContractsConfig {
  crepToken: Address;
  contentRegistry: Address;
  votingEngine: Address;
  voterIdNFT: Address;
  roundRewardDistributor: Address;
  frontendRegistry: Address;
}

export interface WritePolicyConfig {
  maxVoteStake: bigint | null;
  allowedSubmissionHosts: string[];
  submissionRevealPollIntervalMs: number;
  submissionRevealTimeoutMs: number;
}

export interface WriteConfig {
  enabled: boolean;
  rpcUrl: string | null;
  chainId: number | null;
  chainName: string | null;
  maxGasPerTx: number;
  defaultIdentityId: string | null;
  identities: WriteIdentityConfig[];
  contracts: WriteContractsConfig | null;
  policy: WritePolicyConfig;
}

interface RawHttpTokenConfig {
  token: string;
  clientId?: string;
  scopes?: string[];
  identityId?: string | null;
  notBefore?: string | null;
  expiresAt?: string | null;
  subject?: string | null;
  kind?: "static" | "session";
}

interface RawHttpSessionKeyConfig {
  keyId?: string;
  secret?: string;
  issuer?: string | null;
  audience?: string | null;
}

interface RawWriteIdentityConfig {
  id: string;
  label?: string | null;
  privateKey?: string;
  keystoreAccount?: string;
  keystorePassword?: string;
  frontendAddress?: string | null;
}

const DEFAULT_PONDER_URL = "http://127.0.0.1:42069";
const DEFAULT_PONDER_TIMEOUT_MS = 10_000;
const DEFAULT_HTTP_HOST = "127.0.0.1";
const DEFAULT_HTTP_PORT = 3334;
const DEFAULT_HTTP_PATH = "/mcp";
const DEFAULT_HTTP_CORS_ORIGIN = "http://localhost:3000";
const DEFAULT_HTTP_AUTH_REALM = "curyo-mcp";
const DEFAULT_HTTP_AUTH_SCOPES = ["mcp:read"] as const;
const DEFAULT_HTTP_SESSION_KEY_ID = "nextjs-default";
const DEFAULT_HTTP_SESSION_ISSUER = "curyo-nextjs";
const DEFAULT_HTTP_SESSION_AUDIENCE = "curyo-mcp";
const DEFAULT_HTTP_RATE_LIMIT_WINDOW_MS = 60_000;
const DEFAULT_HTTP_READ_REQUESTS_PER_WINDOW = 120;
const DEFAULT_HTTP_WRITE_REQUESTS_PER_WINDOW = 20;
const DEFAULT_MAX_GAS_PER_TX = 2_000_000;
const DEFAULT_SUBMISSION_REVEAL_POLL_INTERVAL_MS = 500;
const DEFAULT_SUBMISSION_REVEAL_TIMEOUT_MS = 30_000;
const LOCALHOST_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1"]);

const KNOWN_CHAIN_NAMES: Record<number, string> = {
  31337: "Foundry",
  42220: "Celo",
  11142220: "Celo Sepolia",
};

const SERVER_TRANSPORT_VALUES = ["stdio", "streamable-http"] as const;
export type ServerTransport = (typeof SERVER_TRANSPORT_VALUES)[number];
const HTTP_AUTH_MODE_VALUES = ["none", "bearer"] as const;
export type HttpAuthMode = (typeof HTTP_AUTH_MODE_VALUES)[number];

export function normalizeBaseUrl(value: string): string {
  const parsed = new URL(value);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Ponder URL must use http or https");
  }

  const trimmedPath = parsed.pathname === "/" ? "" : parsed.pathname.replace(/\/+$/, "");
  return `${parsed.origin}${trimmedPath}`;
}

export function normalizeHttpPath(value: string): string {
  const withLeadingSlash = value.startsWith("/") ? value : `/${value}`;
  return withLeadingSlash === "/" ? withLeadingSlash : withLeadingSlash.replace(/\/+$/, "");
}

export function normalizeOptionalBaseUrl(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? normalizeBaseUrl(trimmed) : null;
}

function dedupeStrings(values: string[]): string[] {
  return [...new Set(values)];
}

function isLocalhostUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return LOCALHOST_HOSTNAMES.has(parsed.hostname);
  } catch {
    return false;
  }
}

function readEnv(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const value = env[name]?.trim();
  return value ? value : undefined;
}

function parseIntegerEnv(value: string | undefined, fallback: number, label: string, minimum: number): number {
  if (value === undefined) return fallback;

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < minimum) {
    throw new Error(`${label} must be an integer greater than or equal to ${minimum}`);
  }

  return parsed;
}

function parseRequiredInteger(value: string | undefined, label: string, minimum: number, errors: string[]): number | null {
  if (value === undefined) {
    errors.push(`${label} is required`);
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < minimum) {
    errors.push(`${label} must be an integer greater than or equal to ${minimum}`);
    return null;
  }

  return parsed;
}

function parseBooleanEnv(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  throw new Error(`Expected a boolean-like environment value, received ${value}`);
}

function parseTransportEnv(value: string | undefined): ServerTransport {
  const normalized = value ?? "stdio";
  if ((SERVER_TRANSPORT_VALUES as readonly string[]).includes(normalized)) {
    return normalized as ServerTransport;
  }

  throw new Error(`CURYO_MCP_TRANSPORT must be one of: ${SERVER_TRANSPORT_VALUES.join(", ")}`);
}

function parseHttpAuthMode(value: string | undefined): HttpAuthMode {
  const normalized = value ?? "none";
  if ((HTTP_AUTH_MODE_VALUES as readonly string[]).includes(normalized)) {
    return normalized as HttpAuthMode;
  }

  throw new Error(`CURYO_MCP_HTTP_AUTH_MODE must be one of: ${HTTP_AUTH_MODE_VALUES.join(", ")}`);
}

function parseCsvEnv(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function normalizeHeaderNames(headers: string[]): string[] {
  return headers.map((header) => header.trim().toLowerCase()).filter(Boolean);
}

function parseJsonEnv<T>(value: string | undefined, label: string): T | null {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as T;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown parse error";
    throw new Error(`${label} must be valid JSON: ${message}`);
  }
}

function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function parseOptionalTimestamp(value: string | null | undefined, label: string, errors: string[]): string | null {
  if (value === null || value === undefined || value.trim().length === 0) {
    return null;
  }

  const timestamp = Date.parse(value.trim());
  if (Number.isNaN(timestamp)) {
    errors.push(`${label} must be a valid ISO 8601 date-time string`);
    return null;
  }

  return new Date(timestamp).toISOString();
}

function parseOptionalBigInt(value: string | undefined, label: string, errors: string[]): bigint | null {
  if (value === undefined) {
    return null;
  }

  if (!/^\d+$/.test(value)) {
    errors.push(`${label} must be an unsigned integer string`);
    return null;
  }

  return BigInt(value);
}

function parseAddressValue(value: string, label: string, errors: string[]): Address | null {
  if (!isAddress(value)) {
    errors.push(`${label} must be a valid address`);
    return null;
  }

  return value as Address;
}

function parsePrivateKeyValue(value: string, label: string, errors: string[]): `0x${string}` | null {
  if (!/^0x[0-9a-fA-F]{64}$/.test(value)) {
    errors.push(`${label} must be a 32-byte 0x-prefixed hex private key`);
    return null;
  }

  return value as `0x${string}`;
}

function resolveContractAddress(params: {
  env: NodeJS.ProcessEnv;
  chainId: number;
  envNames: string[];
  contractName: string;
  errors: string[];
  warnings: string[];
}): Address | null {
  const { env, chainId, envNames, contractName, errors, warnings } = params;
  const sharedAddress = getSharedArtifactAddress(chainId, contractName);
  const envName = envNames.find((name) => readEnv(env, name));
  const envValue = envName ? readEnv(env, envName) : undefined;

  if (sharedAddress) {
    if (envValue && envName) {
      if (isAddress(envValue)) {
        if (envValue.toLowerCase() !== sharedAddress.toLowerCase()) {
          warnings.push(
            `Ignoring ${envName}=${envValue} for chain ${chainId}; using ${contractName} from shared deployment artifacts (${sharedAddress}).`,
          );
        }
      } else {
        warnings.push(
          `Ignoring invalid ${envName} value for chain ${chainId}; using ${contractName} from shared deployment artifacts (${sharedAddress}).`,
        );
      }
    }

    return sharedAddress;
  }

  if (!envValue || !envName) {
    errors.push(`${envNames[0]} is required`);
    return null;
  }

  return parseAddressValue(envValue, envName, errors);
}

function loadWriteConfig(env: NodeJS.ProcessEnv): WriteConfig {
  const enabled = parseBooleanEnv(readEnv(env, "CURYO_MCP_WRITE_ENABLED"), false);
  const policy: WritePolicyConfig = {
    maxVoteStake: null,
    allowedSubmissionHosts: normalizeHeaderNames(parseCsvEnv(readEnv(env, "CURYO_MCP_WRITE_SUBMISSION_HOST_ALLOWLIST"))),
    submissionRevealPollIntervalMs: parseIntegerEnv(
      readEnv(env, "CURYO_MCP_WRITE_SUBMISSION_REVEAL_POLL_MS"),
      DEFAULT_SUBMISSION_REVEAL_POLL_INTERVAL_MS,
      "CURYO_MCP_WRITE_SUBMISSION_REVEAL_POLL_MS",
      1,
    ),
    submissionRevealTimeoutMs: parseIntegerEnv(
      readEnv(env, "CURYO_MCP_WRITE_SUBMISSION_REVEAL_TIMEOUT_MS"),
      DEFAULT_SUBMISSION_REVEAL_TIMEOUT_MS,
      "CURYO_MCP_WRITE_SUBMISSION_REVEAL_TIMEOUT_MS",
      1,
    ),
  };

  if (!enabled) {
    return {
      enabled: false,
      rpcUrl: null,
      chainId: null,
      chainName: null,
      maxGasPerTx: DEFAULT_MAX_GAS_PER_TX,
      defaultIdentityId: null,
      identities: [],
      contracts: null,
      policy,
    };
  }

  const errors: string[] = [];
  const warnings: string[] = [];
  policy.maxVoteStake = parseOptionalBigInt(readEnv(env, "CURYO_MCP_WRITE_MAX_VOTE_STAKE"), "CURYO_MCP_WRITE_MAX_VOTE_STAKE", errors);

  const rpcUrlValue = readEnv(env, "CURYO_MCP_RPC_URL") ?? readEnv(env, "RPC_URL");
  let rpcUrl: string | null = null;
  if (!rpcUrlValue) {
    errors.push("CURYO_MCP_RPC_URL or RPC_URL is required when CURYO_MCP_WRITE_ENABLED=true");
  } else {
    try {
      rpcUrl = normalizeBaseUrl(rpcUrlValue);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid RPC URL";
      errors.push(`CURYO_MCP_RPC_URL must be a valid http(s) URL: ${message}`);
    }
  }

  const chainId = parseRequiredInteger(
    readEnv(env, "CURYO_MCP_CHAIN_ID") ?? readEnv(env, "CHAIN_ID"),
    "CURYO_MCP_CHAIN_ID or CHAIN_ID",
    1,
    errors,
  );

  const rawIdentities = parseJsonEnv<RawWriteIdentityConfig[]>(
    readEnv(env, "CURYO_MCP_WRITE_IDENTITIES"),
    "CURYO_MCP_WRITE_IDENTITIES",
  ) ?? [];

  if (!Array.isArray(rawIdentities) || rawIdentities.length === 0) {
    errors.push("CURYO_MCP_WRITE_IDENTITIES must be a non-empty JSON array when CURYO_MCP_WRITE_ENABLED=true");
  }

  const identities: WriteIdentityConfig[] = [];
  const seenIdentityIds = new Set<string>();

  for (const [index, rawIdentity] of rawIdentities.entries()) {
    if (!rawIdentity || typeof rawIdentity !== "object") {
      errors.push(`CURYO_MCP_WRITE_IDENTITIES[${index}] must be an object`);
      continue;
    }

    const id = rawIdentity.id?.trim();
    if (!id) {
      errors.push(`CURYO_MCP_WRITE_IDENTITIES[${index}].id is required`);
      continue;
    }

    if (seenIdentityIds.has(id)) {
      errors.push(`CURYO_MCP_WRITE_IDENTITIES contains duplicate identity id "${id}"`);
      continue;
    }
    seenIdentityIds.add(id);

    const privateKey = rawIdentity.privateKey?.trim();
    const keystoreAccount = rawIdentity.keystoreAccount?.trim();
    const keystorePassword = rawIdentity.keystorePassword;

    if (!privateKey && !keystoreAccount) {
      errors.push(`CURYO_MCP_WRITE_IDENTITIES[${index}] must define either privateKey or keystoreAccount`);
      continue;
    }

    if (privateKey && keystoreAccount) {
      errors.push(`CURYO_MCP_WRITE_IDENTITIES[${index}] must not define both privateKey and keystoreAccount`);
      continue;
    }

    let normalizedPrivateKey: `0x${string}` | undefined;
    if (privateKey) {
      const parsedPrivateKey = parsePrivateKeyValue(privateKey, `CURYO_MCP_WRITE_IDENTITIES[${index}].privateKey`, errors);
      if (!parsedPrivateKey) {
        continue;
      }
      normalizedPrivateKey = parsedPrivateKey;
    }

    if (keystoreAccount && !keystorePassword) {
      errors.push(`CURYO_MCP_WRITE_IDENTITIES[${index}].keystorePassword is required with keystoreAccount`);
      continue;
    }

    let frontendAddress: Address | null = null;
    if (typeof rawIdentity.frontendAddress === "string" && rawIdentity.frontendAddress.trim().length > 0) {
      frontendAddress = parseAddressValue(
        rawIdentity.frontendAddress.trim(),
        `CURYO_MCP_WRITE_IDENTITIES[${index}].frontendAddress`,
        errors,
      );
      if (!frontendAddress) {
        continue;
      }
    }

    identities.push({
      id,
      label: rawIdentity.label?.trim() || null,
      privateKey: normalizedPrivateKey,
      keystoreAccount: keystoreAccount || undefined,
      keystorePassword,
      frontendAddress,
    });
  }

  const defaultIdentityId = readEnv(env, "CURYO_MCP_WRITE_DEFAULT_IDENTITY") ?? null;
  if (defaultIdentityId && !seenIdentityIds.has(defaultIdentityId)) {
    errors.push(`CURYO_MCP_WRITE_DEFAULT_IDENTITY references unknown identity "${defaultIdentityId}"`);
  }

  let contracts: WriteContractsConfig | null = null;
  if (chainId !== null) {
    const crepToken = resolveContractAddress({
      env,
      chainId,
      envNames: ["CURYO_MCP_CREP_TOKEN_ADDRESS", "CREP_TOKEN_ADDRESS"],
      contractName: "CuryoReputation",
      errors,
      warnings,
    });
    const contentRegistry = resolveContractAddress({
      env,
      chainId,
      envNames: ["CURYO_MCP_CONTENT_REGISTRY_ADDRESS", "CONTENT_REGISTRY_ADDRESS"],
      contractName: "ContentRegistry",
      errors,
      warnings,
    });
    const votingEngine = resolveContractAddress({
      env,
      chainId,
      envNames: ["CURYO_MCP_VOTING_ENGINE_ADDRESS", "VOTING_ENGINE_ADDRESS"],
      contractName: "RoundVotingEngine",
      errors,
      warnings,
    });
    const voterIdNFT = resolveContractAddress({
      env,
      chainId,
      envNames: ["CURYO_MCP_VOTER_ID_NFT_ADDRESS", "VOTER_ID_NFT_ADDRESS"],
      contractName: "VoterIdNFT",
      errors,
      warnings,
    });
    const roundRewardDistributor = resolveContractAddress({
      env,
      chainId,
      envNames: ["CURYO_MCP_ROUND_REWARD_DISTRIBUTOR_ADDRESS"],
      contractName: "RoundRewardDistributor",
      errors,
      warnings,
    });
    const frontendRegistry = resolveContractAddress({
      env,
      chainId,
      envNames: ["CURYO_MCP_FRONTEND_REGISTRY_ADDRESS"],
      contractName: "FrontendRegistry",
      errors,
      warnings,
    });

    if (crepToken && contentRegistry && votingEngine && voterIdNFT && roundRewardDistributor && frontendRegistry) {
      contracts = {
        crepToken,
        contentRegistry,
        votingEngine,
        voterIdNFT,
        roundRewardDistributor,
        frontendRegistry,
      };
    }
  }

  if (errors.length > 0) {
    throw new Error(`Invalid MCP write configuration:\n- ${errors.join("\n- ")}`);
  }

  for (const warning of warnings) {
    console.warn(`[mcp config] ${warning}`);
  }

  return {
    enabled: true,
    rpcUrl,
    chainId,
    chainName: readEnv(env, "CURYO_MCP_CHAIN_NAME") ?? KNOWN_CHAIN_NAMES[chainId!] ?? `Chain ${chainId}`,
    maxGasPerTx: parseIntegerEnv(readEnv(env, "CURYO_MCP_MAX_GAS_PER_TX"), DEFAULT_MAX_GAS_PER_TX, "CURYO_MCP_MAX_GAS_PER_TX", 0),
    defaultIdentityId,
    identities,
    contracts,
    policy,
  };
}

function loadHttpAuthConfig(env: NodeJS.ProcessEnv, identityIds: ReadonlySet<string>): HttpAuthConfig {
  const mode = parseHttpAuthMode(env.CURYO_MCP_HTTP_AUTH_MODE);
  const realm = env.CURYO_MCP_HTTP_AUTH_REALM ?? DEFAULT_HTTP_AUTH_REALM;
  const scopes = parseCsvEnv(env.CURYO_MCP_HTTP_AUTH_SCOPES);
  const defaultScopes = scopes.length > 0 ? scopes : [...DEFAULT_HTTP_AUTH_SCOPES];

  const tokenValues = [
    ...parseCsvEnv(env.CURYO_MCP_HTTP_BEARER_TOKENS),
    ...(env.CURYO_MCP_HTTP_BEARER_TOKEN ? [env.CURYO_MCP_HTTP_BEARER_TOKEN.trim()] : []),
  ].filter((token) => token.length > 0);

  const legacyTokens: HttpAuthTokenConfig[] = tokenValues.map((token) => {
    const tokenHash = hashToken(token);
    return {
      tokenHash,
      clientId: `static-bearer:${tokenHash.slice(0, 12)}`,
      scopes: [...defaultScopes],
      identityId: null,
      notBefore: null,
      expiresAt: null,
      subject: null,
      kind: "static",
    };
  });

  const rawTokenConfigs = parseJsonEnv<RawHttpTokenConfig[]>(
    readEnv(env, "CURYO_MCP_HTTP_TOKENS_JSON"),
    "CURYO_MCP_HTTP_TOKENS_JSON",
  ) ?? [];

  if (!Array.isArray(rawTokenConfigs) && rawTokenConfigs !== null) {
    throw new Error("CURYO_MCP_HTTP_TOKENS_JSON must be a JSON array");
  }

  const configuredTokens: HttpAuthTokenConfig[] = [];
  const tokenErrors: string[] = [];
  const sessionKeyErrors: string[] = [];

  for (const [index, rawToken] of rawTokenConfigs.entries()) {
    if (!rawToken || typeof rawToken !== "object") {
      tokenErrors.push(`CURYO_MCP_HTTP_TOKENS_JSON[${index}] must be an object`);
      continue;
    }

    const token = rawToken.token?.trim();
    if (!token) {
      tokenErrors.push(`CURYO_MCP_HTTP_TOKENS_JSON[${index}].token is required`);
      continue;
    }

    const identityId = rawToken.identityId?.trim() || null;
    if (identityId && !identityIds.has(identityId)) {
      tokenErrors.push(`CURYO_MCP_HTTP_TOKENS_JSON[${index}] references unknown identity "${identityId}"`);
      continue;
    }

    const notBefore = parseOptionalTimestamp(rawToken.notBefore, `CURYO_MCP_HTTP_TOKENS_JSON[${index}].notBefore`, tokenErrors);
    const expiresAt = parseOptionalTimestamp(rawToken.expiresAt, `CURYO_MCP_HTTP_TOKENS_JSON[${index}].expiresAt`, tokenErrors);
    if (notBefore && expiresAt && Date.parse(notBefore) >= Date.parse(expiresAt)) {
      tokenErrors.push(`CURYO_MCP_HTTP_TOKENS_JSON[${index}] must have expiresAt after notBefore`);
      continue;
    }

    const kind = rawToken.kind === "session" ? "session" : "static";

    const tokenHash = hashToken(token);
    configuredTokens.push({
      tokenHash,
      clientId: rawToken.clientId?.trim() || `static-bearer:${tokenHash.slice(0, 12)}`,
      scopes: rawToken.scopes && rawToken.scopes.length > 0 ? rawToken.scopes.map((scope) => scope.trim()).filter(Boolean) : [...defaultScopes],
      identityId,
      notBefore,
      expiresAt,
      subject: rawToken.subject?.trim() || null,
      kind,
    });
  }

  if (tokenErrors.length > 0) {
    throw new Error(`Invalid MCP HTTP token configuration:\n- ${tokenErrors.join("\n- ")}`);
  }

  const tokens = [...legacyTokens, ...configuredTokens];

  const sessionKeys: HttpAuthSessionKeyConfig[] = [];
  const singleSessionSecret = readEnv(env, "CURYO_MCP_HTTP_SESSION_SECRET");
  if (singleSessionSecret) {
    sessionKeys.push({
      keyId: readEnv(env, "CURYO_MCP_HTTP_SESSION_KEY_ID") ?? DEFAULT_HTTP_SESSION_KEY_ID,
      secret: singleSessionSecret,
      issuer: readEnv(env, "CURYO_MCP_HTTP_SESSION_ISSUER") ?? DEFAULT_HTTP_SESSION_ISSUER,
      audience: readEnv(env, "CURYO_MCP_HTTP_SESSION_AUDIENCE") ?? DEFAULT_HTTP_SESSION_AUDIENCE,
    });
  }

  const rawSessionKeyConfigs = parseJsonEnv<RawHttpSessionKeyConfig[]>(
    readEnv(env, "CURYO_MCP_HTTP_SESSION_SECRETS_JSON"),
    "CURYO_MCP_HTTP_SESSION_SECRETS_JSON",
  ) ?? [];
  if (!Array.isArray(rawSessionKeyConfigs) && rawSessionKeyConfigs !== null) {
    throw new Error("CURYO_MCP_HTTP_SESSION_SECRETS_JSON must be a JSON array");
  }

  const seenSessionKeyIds = new Set(sessionKeys.map((key) => key.keyId));
  for (const [index, rawSessionKey] of rawSessionKeyConfigs.entries()) {
    if (!rawSessionKey || typeof rawSessionKey !== "object") {
      sessionKeyErrors.push(`CURYO_MCP_HTTP_SESSION_SECRETS_JSON[${index}] must be an object`);
      continue;
    }

    const keyId = rawSessionKey.keyId?.trim();
    const secret = rawSessionKey.secret?.trim();
    if (!keyId) {
      sessionKeyErrors.push(`CURYO_MCP_HTTP_SESSION_SECRETS_JSON[${index}].keyId is required`);
      continue;
    }
    if (!secret) {
      sessionKeyErrors.push(`CURYO_MCP_HTTP_SESSION_SECRETS_JSON[${index}].secret is required`);
      continue;
    }
    if (seenSessionKeyIds.has(keyId)) {
      sessionKeyErrors.push(`CURYO_MCP_HTTP_SESSION_SECRETS_JSON contains duplicate keyId "${keyId}"`);
      continue;
    }

    seenSessionKeyIds.add(keyId);
    sessionKeys.push({
      keyId,
      secret,
      issuer: rawSessionKey.issuer?.trim() || DEFAULT_HTTP_SESSION_ISSUER,
      audience: rawSessionKey.audience?.trim() || DEFAULT_HTTP_SESSION_AUDIENCE,
    });
  }

  if (sessionKeyErrors.length > 0) {
    throw new Error(`Invalid MCP HTTP session key configuration:\n- ${sessionKeyErrors.join("\n- ")}`);
  }

  if (mode === "bearer" && tokens.length === 0 && sessionKeys.length === 0) {
    throw new Error(
      "CURYO_MCP_HTTP_BEARER_TOKEN, CURYO_MCP_HTTP_BEARER_TOKENS, CURYO_MCP_HTTP_TOKENS_JSON, or CURYO_MCP_HTTP_SESSION_SECRET(S)_JSON is required when CURYO_MCP_HTTP_AUTH_MODE=bearer",
    );
  }

  return {
    mode,
    realm,
    tokenHashes: tokens.map((token) => token.tokenHash),
    scopes: defaultScopes,
    tokens,
    sessionKeys,
  };
}

function loadHttpRateLimitConfig(env: NodeJS.ProcessEnv): HttpRateLimitConfig {
  return {
    enabled: parseBooleanEnv(readEnv(env, "CURYO_MCP_HTTP_RATE_LIMIT_ENABLED"), true),
    windowMs: parseIntegerEnv(
      readEnv(env, "CURYO_MCP_HTTP_RATE_LIMIT_WINDOW_MS"),
      DEFAULT_HTTP_RATE_LIMIT_WINDOW_MS,
      "CURYO_MCP_HTTP_RATE_LIMIT_WINDOW_MS",
      1,
    ),
    readRequestsPerWindow: parseIntegerEnv(
      readEnv(env, "CURYO_MCP_HTTP_RATE_LIMIT_READ_LIMIT"),
      DEFAULT_HTTP_READ_REQUESTS_PER_WINDOW,
      "CURYO_MCP_HTTP_RATE_LIMIT_READ_LIMIT",
      0,
    ),
    writeRequestsPerWindow: parseIntegerEnv(
      readEnv(env, "CURYO_MCP_HTTP_RATE_LIMIT_WRITE_LIMIT"),
      DEFAULT_HTTP_WRITE_REQUESTS_PER_WINDOW,
      "CURYO_MCP_HTTP_RATE_LIMIT_WRITE_LIMIT",
      0,
    ),
    trustedProxyHeaders: normalizeHeaderNames(parseCsvEnv(readEnv(env, "CURYO_MCP_HTTP_TRUSTED_PROXY_HEADERS"))),
  };
}

function loadHttpAllowedOrigins(
  env: NodeJS.ProcessEnv,
  httpCorsOrigin: string,
  httpPublicBaseUrl: string | null,
): string[] {
  const configuredOrigins = parseCsvEnv(readEnv(env, "CURYO_MCP_HTTP_ALLOWED_ORIGINS"));
  if (configuredOrigins.length > 0) {
    return dedupeStrings(
      configuredOrigins.map((origin, index) =>
        normalizeOrigin(origin, `CURYO_MCP_HTTP_ALLOWED_ORIGINS[${index}]`),
      ),
    );
  }

  const derivedOrigins: string[] = [];
  if (httpCorsOrigin !== "*") {
    derivedOrigins.push(normalizeOrigin(httpCorsOrigin, "CURYO_MCP_HTTP_CORS_ORIGIN"));
  }
  if (httpPublicBaseUrl) {
    derivedOrigins.push(new URL(httpPublicBaseUrl).origin);
  }

  return dedupeStrings(derivedOrigins);
}

function validateProductionStreamableHttpConfig(params: {
  env: NodeJS.ProcessEnv;
  ponderBaseUrl: string;
  httpCorsOrigin: string;
  httpAllowedOrigins: string[];
  httpRateLimit: HttpRateLimitConfig;
}): void {
  if (params.env.NODE_ENV !== "production") {
    return;
  }

  if (isLocalhostUrl(params.ponderBaseUrl)) {
    throw new Error(
      "CURYO_PONDER_URL or PONDER_URL must not point to localhost in production streamable-http deployments",
    );
  }

  if (isLocalhostUrl(params.httpCorsOrigin)) {
    throw new Error(
      "CURYO_MCP_HTTP_CORS_ORIGIN must not point to localhost in production streamable-http deployments",
    );
  }

  if (params.httpAllowedOrigins.length === 0) {
    throw new Error(
      "CURYO_MCP_HTTP_ALLOWED_ORIGINS or a non-wildcard CURYO_MCP_HTTP_CORS_ORIGIN/CURYO_MCP_PUBLIC_BASE_URL is required in production streamable-http deployments",
    );
  }

  if (params.httpAllowedOrigins.some((origin) => isLocalhostUrl(origin))) {
    throw new Error(
      "CURYO_MCP_HTTP_ALLOWED_ORIGINS must not include localhost origins in production streamable-http deployments",
    );
  }

  if (params.httpRateLimit.enabled && params.httpRateLimit.trustedProxyHeaders.length === 0) {
    throw new Error(
      "CURYO_MCP_HTTP_TRUSTED_PROXY_HEADERS is required in production when CURYO_MCP_TRANSPORT=streamable-http and rate limiting is enabled",
    );
  }
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const ponderBaseUrl = normalizeBaseUrl(env.CURYO_PONDER_URL ?? env.PONDER_URL ?? DEFAULT_PONDER_URL);
  const transport = parseTransportEnv(env.CURYO_MCP_TRANSPORT);
  const write = loadWriteConfig(env);
  const httpAuth = loadHttpAuthConfig(env, new Set(write.identities.map((identity) => identity.id)));
  const httpRateLimit = loadHttpRateLimitConfig(env);
  const httpCorsOrigin = env.CURYO_MCP_HTTP_CORS_ORIGIN ?? DEFAULT_HTTP_CORS_ORIGIN;
  const httpPublicBaseUrl = normalizeOptionalBaseUrl(env.CURYO_MCP_PUBLIC_BASE_URL);
  const httpAllowedOrigins = loadHttpAllowedOrigins(env, httpCorsOrigin, httpPublicBaseUrl);
  const httpAuthorizationServers = dedupeStrings(
    parseCsvEnv(readEnv(env, "CURYO_MCP_HTTP_AUTHORIZATION_SERVERS")).map((value) => normalizeBaseUrl(value)),
  );
  const httpResourceDocumentationUrl = normalizeOptionalBaseUrl(readEnv(env, "CURYO_MCP_HTTP_RESOURCE_DOCUMENTATION_URL"));

  validateProductionStreamableHttpConfig({
    env,
    ponderBaseUrl,
    httpCorsOrigin,
    httpAllowedOrigins,
    httpRateLimit,
  });

  return {
    ponderBaseUrl,
    ponderTimeoutMs: parseIntegerEnv(env.CURYO_MCP_PONDER_TIMEOUT_MS, DEFAULT_PONDER_TIMEOUT_MS, "CURYO_MCP_PONDER_TIMEOUT_MS", 1),
    serverName: env.CURYO_MCP_SERVER_NAME ?? "curyo-readonly",
    serverVersion: env.CURYO_MCP_SERVER_VERSION ?? env.npm_package_version ?? "0.0.1",
    transport,
    httpHost: env.CURYO_MCP_HTTP_HOST ?? DEFAULT_HTTP_HOST,
    httpPort: parseIntegerEnv(env.CURYO_MCP_HTTP_PORT, DEFAULT_HTTP_PORT, "CURYO_MCP_HTTP_PORT", 0),
    httpPath: normalizeHttpPath(env.CURYO_MCP_HTTP_PATH ?? DEFAULT_HTTP_PATH),
    httpPublicBaseUrl,
    httpCorsOrigin,
    httpAllowedOrigins,
    httpAuthorizationServers,
    httpResourceDocumentationUrl,
    httpAuth,
    httpRateLimit,
    write,
  };
}
