import { createCipheriv, createDecipheriv, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  isAddress,
  isHex,
  keccak256,
  type Address,
  type Hex,
  type TransactionReceipt,
} from "viem";
import { generatePrivateKey, privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import type {
  AskHumansRequest,
  AskHumansResponse,
  ConfirmAskTransactionsRequest,
  CuryoAgentClient,
  CuryoAgentWalletTransactionCall,
  QuestionStatusResponse,
} from "@curyo/sdk/agent";

type CliOptions = Record<string, string | boolean | undefined>;
type JsonRecord = Record<string, unknown>;

const KEYSTORE_VERSION = 3;
const DEFAULT_SCRYPT_PARAMS = {
  dklen: 32,
  n: 1 << 15,
  p: 1,
  r: 8,
};

export type LocalSignerConfig = {
  chainId?: number;
  chainName: string;
  keystorePassword?: string;
  keystorePath?: string;
  pollingIntervalMs: number;
  privateKey?: Hex;
  receiptTimeoutMs: number;
  rpcUrl?: string;
};

export type LoadedLocalSignerWallet = {
  account: PrivateKeyAccount;
  source: "keystore" | "private-key";
};

export type GeneratedLocalSignerWallet = LoadedLocalSignerWallet & {
  keystorePath: string;
};

export type LocalTransactionReceiptSummary = {
  blockNumber: string;
  gasUsed: string;
  status: TransactionReceipt["status"];
  transactionHash: Hex;
};

export type LocalTransactionExecutionSummary = {
  calls: Array<{
    hash: Hex;
    index: number;
    phase?: string;
    receipt: LocalTransactionReceiptSummary;
    to: Address;
  }>;
  transactionHashes: Hex[];
};

export type LocalAskResult = {
  confirmed?: QuestionStatusResponse;
  finalAsk: AskHumansResponse;
  initialAsk: AskHumansResponse;
  signedX402Authorization: boolean;
  transactions?: LocalTransactionExecutionSummary;
  walletAddress: Address;
};

export type LocalAskProgress =
  | { type: "ask_submitted"; response: AskHumansResponse }
  | { type: "x402_signed" }
  | { type: "x402_resubmitted"; response: AskHumansResponse }
  | { type: "transaction_sent"; hash: Hex; index: number; phase?: string }
  | { type: "transaction_confirmed"; hash: Hex; index: number; receipt: LocalTransactionReceiptSummary }
  | { type: "transactions_confirmed"; response: QuestionStatusResponse };

type KeystoreV3 = {
  address?: string;
  crypto: {
    cipher: "aes-128-ctr";
    cipherparams: { iv: string };
    ciphertext: string;
    kdf: "scrypt";
    kdfparams: {
      dklen: number;
      n: number;
      p: number;
      r: number;
      salt: string;
    };
    mac: string;
  };
  id?: string;
  version: 3;
};

type TypedDataField = {
  name: string;
  type: string;
};

type X402TypedData = {
  domain: JsonRecord;
  message: JsonRecord;
  primaryType: string;
  types: Record<string, TypedDataField[]>;
};

type X402Authorization = {
  from?: Address;
  nonce?: Hex;
  signature?: Hex;
  to?: Address;
  validAfter?: string;
  validBefore?: string;
  value?: string;
};

function optionString(options: CliOptions, name: string): string | undefined {
  const value = options[name];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function envString(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const value = env[name]?.trim();
  return value ? value : undefined;
}

function parsePositiveInteger(value: string | undefined, name: string): number | undefined {
  if (!value) return undefined;
  if (!/^\d+$/.test(value)) {
    throw new Error(`${name} must be a positive integer.`);
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive safe integer.`);
  }
  return parsed;
}

function parsePrivateKey(value: string | undefined, name: string): Hex | undefined {
  if (!value) return undefined;
  if (!/^0x[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error(`${name} must be a 32-byte hex private key.`);
  }
  return value as Hex;
}

function assertRecord(value: unknown, name: string): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${name} must be an object.`);
  }
  return value as JsonRecord;
}

function normalizeAddress(value: unknown, name: string): Address {
  if (typeof value !== "string" || !isAddress(value, { strict: false })) {
    throw new Error(`${name} must be an EVM address.`);
  }
  return value as Address;
}

function normalizeHex(value: unknown, name: string): Hex {
  if (typeof value !== "string" || !isHex(value)) {
    throw new Error(`${name} must be hex.`);
  }
  return value as Hex;
}

function normalizeBytes32(value: unknown, name: string): Hex {
  const hex = normalizeHex(value, name);
  if (hex.length !== 66) {
    throw new Error(`${name} must be 32 bytes.`);
  }
  return hex;
}

function normalizeOptionalTransactionData(value: unknown, name: string): Hex {
  if (value === undefined || value === null || value === "") return "0x";
  const hex = normalizeHex(value, name);
  if (hex.length % 2 !== 0) {
    throw new Error(`${name} must be byte-aligned hex.`);
  }
  return hex;
}

function normalizeBigInt(value: unknown, name: string): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return BigInt(value);
  if (typeof value === "string" && /^0x[0-9a-fA-F]+$/.test(value)) return BigInt(value);
  if (typeof value === "string" && /^\d+$/.test(value)) return BigInt(value);
  throw new Error(`${name} must be an unsigned integer.`);
}

function normalizeOptionalBigInt(value: unknown, name: string): bigint | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return normalizeBigInt(value, name);
}

function normalizeZeroNativeValue(value: unknown, name: string): 0n {
  const parsed = normalizeOptionalBigInt(value, name) ?? 0n;
  if (parsed !== 0n) {
    throw new Error(`${name} must be zero for Curyo agent transaction plans.`);
  }
  return 0n;
}

function sameAddress(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

function stripEip712Domain(types: Record<string, TypedDataField[]>): Record<string, TypedDataField[]> {
  const { EIP712Domain: _domain, ...rest } = types;
  return rest;
}

function readTypedDataFields(types: unknown): Record<string, TypedDataField[]> {
  const record = assertRecord(types, "x402 typedData.types");
  const parsed: Record<string, TypedDataField[]> = {};

  for (const [typeName, fields] of Object.entries(record)) {
    if (!Array.isArray(fields)) {
      throw new Error(`x402 typedData.types.${typeName} must be an array.`);
    }
    parsed[typeName] = fields.map((field, index) => {
      const fieldRecord = assertRecord(field, `x402 typedData.types.${typeName}[${index}]`);
      if (typeof fieldRecord.name !== "string" || typeof fieldRecord.type !== "string") {
        throw new Error(`x402 typedData.types.${typeName}[${index}] must include name and type.`);
      }
      return { name: fieldRecord.name, type: fieldRecord.type };
    });
  }

  return parsed;
}

function normalizeTypedDataValue(value: unknown, type: string, types: Record<string, TypedDataField[]>): unknown {
  if (type.endsWith("[]")) {
    if (!Array.isArray(value)) throw new Error(`Expected ${type} array value.`);
    const itemType = type.slice(0, -2);
    return value.map(item => normalizeTypedDataValue(item, itemType, types));
  }

  if (/^u?int([0-9]*)$/.test(type)) {
    return normalizeBigInt(value, type);
  }

  if (type === "address") {
    return normalizeAddress(value, type);
  }

  if (type === "bytes32") {
    return normalizeBytes32(value, type);
  }

  if (type === "bytes" || /^bytes[0-9]+$/.test(type)) {
    return normalizeHex(value, type);
  }

  const nested = types[type];
  if (nested) {
    const record = assertRecord(value, type);
    return normalizeTypedDataMessage(record, type, types);
  }

  return value;
}

function normalizeTypedDataMessage(
  message: JsonRecord,
  primaryType: string,
  types: Record<string, TypedDataField[]>,
): JsonRecord {
  const fields = types[primaryType];
  if (!fields) {
    throw new Error(`x402 typedData.types is missing primary type ${primaryType}.`);
  }

  return Object.fromEntries(
    fields.map(field => [field.name, normalizeTypedDataValue(message[field.name], field.type, types)]),
  );
}

function parseX402AuthorizationRequest(value: unknown): {
  authorization: X402Authorization;
  typedData: X402TypedData;
} {
  const request = assertRecord(value, "x402AuthorizationRequest");
  const typedDataRecord = assertRecord(request.typedData ?? request.eip712, "x402AuthorizationRequest.typedData");
  const primaryType = typedDataRecord.primaryType;
  if (typeof primaryType !== "string" || !primaryType) {
    throw new Error("x402 typedData.primaryType is required.");
  }

  const types = stripEip712Domain(readTypedDataFields(typedDataRecord.types));
  const rawMessage = assertRecord(typedDataRecord.message, "x402 typedData.message");
  const normalizedMessage = normalizeTypedDataMessage(rawMessage, primaryType, types);
  const authorizationSource = assertRecord(request.authorization ?? rawMessage, "x402AuthorizationRequest.authorization");

  const authorization: X402Authorization = {
    from: normalizeAddress(authorizationSource.from ?? rawMessage.from, "paymentAuthorization.from"),
    nonce: normalizeBytes32(authorizationSource.nonce ?? rawMessage.nonce, "paymentAuthorization.nonce"),
    to: normalizeAddress(authorizationSource.to ?? rawMessage.to, "paymentAuthorization.to"),
    validAfter: normalizeBigInt(authorizationSource.validAfter ?? rawMessage.validAfter, "paymentAuthorization.validAfter").toString(),
    validBefore: normalizeBigInt(authorizationSource.validBefore ?? rawMessage.validBefore, "paymentAuthorization.validBefore").toString(),
    value: normalizeBigInt(authorizationSource.value ?? rawMessage.value, "paymentAuthorization.value").toString(),
  };

  return {
    authorization,
    typedData: {
      domain: assertRecord(typedDataRecord.domain, "x402 typedData.domain"),
      message: normalizedMessage,
      primaryType,
      types,
    },
  };
}

async function deriveScryptKey(
  password: string,
  salt: Buffer,
  params: { dklen: number; n: number; p: number; r: number },
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(
      Buffer.from(password),
      salt,
      params.dklen,
      {
        N: params.n,
        maxmem: Math.max(32 * 1024 * 1024, 128 * params.n * params.r * 2),
        p: params.p,
        r: params.r,
      },
      (error, derivedKey) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(derivedKey);
      },
    );
  });
}

async function encryptPrivateKey(privateKey: Hex, password: string, address: Address): Promise<KeystoreV3> {
  const salt = randomBytes(32);
  const iv = randomBytes(16);
  const privateKeyBytes = Buffer.from(privateKey.slice(2), "hex");
  const derivedKey = await deriveScryptKey(password, salt, DEFAULT_SCRYPT_PARAMS);
  const cipher = createCipheriv("aes-128-ctr", derivedKey.subarray(0, 16), iv);
  const ciphertext = Buffer.concat([cipher.update(privateKeyBytes), cipher.final()]);
  const macInput = Buffer.concat([derivedKey.subarray(16, 32), ciphertext]);

  return {
    address: address.slice(2).toLowerCase(),
    crypto: {
      cipher: "aes-128-ctr",
      cipherparams: { iv: iv.toString("hex") },
      ciphertext: ciphertext.toString("hex"),
      kdf: "scrypt",
      kdfparams: {
        ...DEFAULT_SCRYPT_PARAMS,
        salt: salt.toString("hex"),
      },
      mac: keccak256(`0x${macInput.toString("hex")}`).slice(2),
    },
    version: KEYSTORE_VERSION,
  };
}

async function decryptLocalKeystore(path: string, password: string): Promise<Hex> {
  const raw = await readFile(path, "utf8");
  const keystore = JSON.parse(raw) as KeystoreV3;
  if (keystore.version !== KEYSTORE_VERSION) {
    throw new Error(`Unsupported keystore version: ${String(keystore.version)}.`);
  }
  if (keystore.crypto?.kdf !== "scrypt") {
    throw new Error(`Unsupported keystore KDF: ${String(keystore.crypto?.kdf)}.`);
  }
  if (keystore.crypto?.cipher !== "aes-128-ctr") {
    throw new Error(`Unsupported keystore cipher: ${String(keystore.crypto?.cipher)}.`);
  }

  const params = keystore.crypto.kdfparams;
  const salt = Buffer.from(params.salt, "hex");
  const ciphertext = Buffer.from(keystore.crypto.ciphertext, "hex");
  const derivedKey = await deriveScryptKey(password, salt, params);
  const macInput = Buffer.concat([derivedKey.subarray(16, 32), ciphertext]);
  const computedMac = Buffer.from(keccak256(`0x${macInput.toString("hex")}`).slice(2), "hex");
  const storedMac = Buffer.from(keystore.crypto.mac.replace(/^0x/, ""), "hex");

  if (computedMac.length !== storedMac.length || !timingSafeEqual(computedMac, storedMac)) {
    throw new Error("Keystore MAC mismatch. Check the local signer password.");
  }

  const iv = Buffer.from(keystore.crypto.cipherparams.iv, "hex");
  const decipher = createDecipheriv("aes-128-ctr", derivedKey.subarray(0, 16), iv);
  const privateKey = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return `0x${privateKey.toString("hex")}` as Hex;
}

export function loadLocalSignerConfig(options: CliOptions = {}, env: NodeJS.ProcessEnv = process.env): LocalSignerConfig {
  const passwordEnvName = optionString(options, "password-env") ?? envString(env, "CURYO_LOCAL_SIGNER_PASSWORD_ENV");
  const keystorePassword =
    optionString(options, "keystore-password") ??
    (passwordEnvName ? envString(env, passwordEnvName) : undefined) ??
    envString(env, "CURYO_LOCAL_SIGNER_KEYSTORE_PASSWORD");

  return {
    chainId: parsePositiveInteger(optionString(options, "chain-id") ?? envString(env, "CURYO_CHAIN_ID"), "CURYO_CHAIN_ID"),
    chainName: optionString(options, "chain-name") ?? envString(env, "CURYO_CHAIN_NAME") ?? "Curyo local signer chain",
    keystorePassword,
    keystorePath: optionString(options, "keystore") ?? envString(env, "CURYO_LOCAL_SIGNER_KEYSTORE_PATH"),
    pollingIntervalMs:
      parsePositiveInteger(
        optionString(options, "polling-interval-ms") ?? envString(env, "CURYO_LOCAL_SIGNER_POLLING_INTERVAL_MS"),
        "CURYO_LOCAL_SIGNER_POLLING_INTERVAL_MS",
      ) ?? 2_000,
    privateKey: parsePrivateKey(
      optionString(options, "private-key") ?? envString(env, "CURYO_LOCAL_SIGNER_PRIVATE_KEY"),
      "CURYO_LOCAL_SIGNER_PRIVATE_KEY",
    ),
    receiptTimeoutMs:
      parsePositiveInteger(
        optionString(options, "receipt-timeout-ms") ?? envString(env, "CURYO_LOCAL_SIGNER_RECEIPT_TIMEOUT_MS"),
        "CURYO_LOCAL_SIGNER_RECEIPT_TIMEOUT_MS",
      ) ?? 120_000,
    rpcUrl: optionString(options, "rpc-url") ?? envString(env, "CURYO_RPC_URL"),
  };
}

export async function loadLocalSignerWallet(config: LocalSignerConfig): Promise<LoadedLocalSignerWallet> {
  if (config.keystorePath && config.privateKey) {
    throw new Error("Set either CURYO_LOCAL_SIGNER_KEYSTORE_PATH or CURYO_LOCAL_SIGNER_PRIVATE_KEY, not both.");
  }

  if (config.keystorePath) {
    if (!config.keystorePassword) {
      throw new Error("Set CURYO_LOCAL_SIGNER_KEYSTORE_PASSWORD to unlock the local signer keystore.");
    }
    const privateKey = await decryptLocalKeystore(resolve(config.keystorePath), config.keystorePassword);
    return { account: privateKeyToAccount(privateKey), source: "keystore" };
  }

  if (config.privateKey) {
    return { account: privateKeyToAccount(config.privateKey), source: "private-key" };
  }

  throw new Error("No local signer wallet configured. Set CURYO_LOCAL_SIGNER_KEYSTORE_PATH or generate one with `wallet --generate`.");
}

export async function generateLocalSignerWallet(
  config: LocalSignerConfig,
  options: { overwrite?: boolean } = {},
): Promise<GeneratedLocalSignerWallet> {
  if (!config.keystorePath) {
    throw new Error("Set CURYO_LOCAL_SIGNER_KEYSTORE_PATH or pass --keystore before generating a wallet.");
  }
  if (!config.keystorePassword) {
    throw new Error("Set CURYO_LOCAL_SIGNER_KEYSTORE_PASSWORD before generating a wallet.");
  }
  if (config.privateKey) {
    throw new Error("Refusing to generate a keystore while CURYO_LOCAL_SIGNER_PRIVATE_KEY is set.");
  }

  const keystorePath = resolve(config.keystorePath);
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);
  const keystore = await encryptPrivateKey(privateKey, config.keystorePassword, account.address);
  await mkdir(dirname(keystorePath), { recursive: true });
  await writeFile(keystorePath, `${JSON.stringify(keystore, null, 2)}\n`, {
    flag: options.overwrite ? "w" : "wx",
    mode: 0o600,
  });
  await chmod(keystorePath, 0o600);

  return { account, keystorePath, source: "keystore" };
}

export function withLocalSignerWallet(payload: unknown, walletAddress: Address): AskHumansRequest {
  const request = assertRecord(payload, "ask payload") as AskHumansRequest;
  const requestedWallet = request.walletAddress;
  if (typeof requestedWallet === "string" && requestedWallet.trim() && !sameAddress(requestedWallet, walletAddress)) {
    throw new Error(`Ask payload walletAddress ${requestedWallet} does not match local signer ${walletAddress}.`);
  }

  return { ...request, walletAddress };
}

export async function signX402AuthorizationRequest(
  account: PrivateKeyAccount,
  x402AuthorizationRequest: unknown,
): Promise<X402Authorization> {
  const { authorization, typedData } = parseX402AuthorizationRequest(x402AuthorizationRequest);
  if (authorization.from && !sameAddress(authorization.from, account.address)) {
    throw new Error(`x402 authorization is for ${authorization.from}, but local signer is ${account.address}.`);
  }

  const signature = await account.signTypedData({
    domain: typedData.domain,
    message: typedData.message,
    primaryType: typedData.primaryType,
    types: typedData.types,
  } as never);

  return { ...authorization, signature };
}

async function resolveChain(config: LocalSignerConfig) {
  if (!config.rpcUrl) {
    throw new Error("Set CURYO_RPC_URL before executing local signer transaction plans.");
  }

  const probeClient = createPublicClient({ transport: http(config.rpcUrl) });
  const rpcChainId = await probeClient.getChainId();
  if (config.chainId !== undefined && rpcChainId !== config.chainId) {
    throw new Error(`CURYO_CHAIN_ID is ${config.chainId}, but CURYO_RPC_URL reports ${rpcChainId}.`);
  }

  return defineChain({
    id: rpcChainId,
    name: config.chainName,
    nativeCurrency: { decimals: 18, name: "Native token", symbol: "NATIVE" },
    rpcUrls: {
      default: { http: [config.rpcUrl] },
    },
  });
}

function summarizeReceipt(receipt: TransactionReceipt): LocalTransactionReceiptSummary {
  return {
    blockNumber: receipt.blockNumber.toString(),
    gasUsed: receipt.gasUsed.toString(),
    status: receipt.status,
    transactionHash: receipt.transactionHash,
  };
}

async function executeTransactionPlan(params: {
  account: PrivateKeyAccount;
  calls: CuryoAgentWalletTransactionCall[];
  config: LocalSignerConfig;
  onProgress?: (event: LocalAskProgress) => void;
}): Promise<LocalTransactionExecutionSummary> {
  const chain = await resolveChain(params.config);
  const transport = http(params.config.rpcUrl);
  const publicClient = createPublicClient({ chain, transport });
  const walletClient = createWalletClient({
    account: params.account,
    chain,
    transport,
  });
  const calls: LocalTransactionExecutionSummary["calls"] = [];

  for (const [index, call] of params.calls.entries()) {
    const to = normalizeAddress(call.to, `transactionPlan.calls[${index}].to`);
    const hash = await walletClient.sendTransaction({
      account: params.account,
      data: normalizeOptionalTransactionData(call.data, `transactionPlan.calls[${index}].data`),
      to,
      value: normalizeZeroNativeValue(call.value, `transactionPlan.calls[${index}].value`),
    });
    params.onProgress?.({ hash, index, phase: call.phase, type: "transaction_sent" });

    const receipt = await publicClient.waitForTransactionReceipt({
      hash,
      pollingInterval: params.config.pollingIntervalMs,
      timeout: params.config.receiptTimeoutMs,
    });
    const summary = summarizeReceipt(receipt);
    params.onProgress?.({ hash, index, receipt: summary, type: "transaction_confirmed" });
    if (receipt.status !== "success") {
      throw new Error(`transactionPlan.calls[${index}] reverted: ${hash}`);
    }

    calls.push({ hash, index, phase: call.phase, receipt: summary, to });
    if (typeof call.waitAfterMs === "number" && call.waitAfterMs > 0) {
      await new Promise(resolveWait => setTimeout(resolveWait, call.waitAfterMs));
    }
  }

  return {
    calls,
    transactionHashes: calls.map(call => call.hash),
  };
}

export async function askHumansWithLocalSigner(params: {
  account: PrivateKeyAccount;
  agent: Pick<CuryoAgentClient, "askHumans" | "confirmAskTransactions">;
  config: LocalSignerConfig;
  onProgress?: (event: LocalAskProgress) => void;
  paymentMode?: AskHumansRequest["paymentMode"];
  payload: unknown;
}): Promise<LocalAskResult> {
  const baseAsk = withLocalSignerWallet(params.payload, params.account.address);
  if (params.paymentMode) {
    baseAsk.paymentMode = params.paymentMode;
  }

  const initialAsk = await params.agent.askHumans(baseAsk);
  params.onProgress?.({ response: initialAsk, type: "ask_submitted" });

  let finalAsk = initialAsk;
  let signedX402Authorization = false;
  if (initialAsk.x402AuthorizationRequest) {
    const paymentAuthorization = await signX402AuthorizationRequest(params.account, initialAsk.x402AuthorizationRequest);
    signedX402Authorization = true;
    params.onProgress?.({ type: "x402_signed" });

    finalAsk = await params.agent.askHumans({
      ...baseAsk,
      paymentAuthorization,
      paymentMode: "x402_authorization",
    });
    params.onProgress?.({ response: finalAsk, type: "x402_resubmitted" });
  }

  const calls = finalAsk.transactionPlan?.calls ?? [];
  if (!calls.length) {
    return {
      finalAsk,
      initialAsk,
      signedX402Authorization,
      walletAddress: params.account.address,
    };
  }

  if (!finalAsk.operationKey) {
    throw new Error("Curyo returned a transaction plan without an operationKey.");
  }

  const transactions = await executeTransactionPlan({
    account: params.account,
    calls,
    config: params.config,
    onProgress: params.onProgress,
  });
  const confirmRequest: ConfirmAskTransactionsRequest = {
    operationKey: finalAsk.operationKey,
    transactionHashes: transactions.transactionHashes,
  };
  const confirmed = await params.agent.confirmAskTransactions(confirmRequest);
  params.onProgress?.({ response: confirmed, type: "transactions_confirmed" });

  return {
    confirmed,
    finalAsk,
    initialAsk,
    signedX402Authorization,
    transactions,
    walletAddress: params.account.address,
  };
}
