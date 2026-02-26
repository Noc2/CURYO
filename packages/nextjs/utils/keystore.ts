/**
 * Foundry keystore decryption utility.
 *
 * Decrypts Web3 Secret Storage v3 keystore files (as created by `cast wallet new`
 * or `cast wallet import`) using Node.js built-in crypto. No extra dependencies.
 *
 * Used by the Keeper and Faucet API routes to avoid storing raw private keys
 * in environment variables.
 */
import crypto from "crypto";
import { readFileSync } from "fs";
import { join } from "path";
import { keccak256 } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { PrivateKeyAccount } from "viem/accounts";

interface KeystoreV3 {
  version: 3;
  crypto: {
    cipher: string;
    ciphertext: string;
    cipherparams: { iv: string };
    kdf: string;
    kdfparams: {
      dklen: number;
      n: number;
      p: number;
      r: number;
      salt: string;
    };
    mac: string;
  };
}

/**
 * Decrypt a Foundry keystore file and return the raw private key.
 *
 * @param name - Keystore name (file in ~/.foundry/keystores/)
 * @param password - Password to decrypt the keystore
 * @returns The private key as a 0x-prefixed hex string
 */
export function decryptKeystore(name: string, password: string): `0x${string}` {
  const keystorePath = join(process.env.HOME ?? "~", ".foundry", "keystores", name);
  const raw = readFileSync(keystorePath, "utf-8");
  const keystore: KeystoreV3 = JSON.parse(raw);

  if (keystore.version !== 3) {
    throw new Error(`Unsupported keystore version: ${keystore.version}`);
  }

  if (keystore.crypto.kdf !== "scrypt") {
    throw new Error(`Unsupported KDF: ${keystore.crypto.kdf}`);
  }

  if (keystore.crypto.cipher !== "aes-128-ctr") {
    throw new Error(`Unsupported cipher: ${keystore.crypto.cipher}`);
  }

  const { n, r, p, dklen, salt } = keystore.crypto.kdfparams;
  const saltBuf = Buffer.from(salt, "hex");
  const ciphertext = Buffer.from(keystore.crypto.ciphertext, "hex");

  // Derive key using scrypt
  const derivedKey = crypto.scryptSync(Buffer.from(password), saltBuf, dklen, {
    N: n,
    r,
    p,
    maxmem: 128 * n * r * 2,
  });

  // Verify MAC: keccak256(derivedKey[16:32] + ciphertext)
  const macInput = Buffer.concat([derivedKey.subarray(16, 32), ciphertext]);
  const computedMac = keccak256(`0x${macInput.toString("hex")}`).slice(2);

  if (computedMac !== keystore.crypto.mac) {
    throw new Error("Keystore MAC mismatch — wrong password?");
  }

  // Decrypt private key using AES-128-CTR
  const iv = Buffer.from(keystore.crypto.cipherparams.iv, "hex");
  const decipher = crypto.createDecipheriv("aes-128-ctr", derivedKey.subarray(0, 16), iv);
  const privateKey = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

  return `0x${privateKey.toString("hex")}` as `0x${string}`;
}

// --- Cached account (scrypt is expensive, only decrypt once) ---
let cachedAccount: PrivateKeyAccount | null | undefined;

/**
 * Get a viem account from a Foundry keystore, configured via env vars.
 *
 * Reads KEYSTORE_ACCOUNT (keystore name) and KEYSTORE_PASSWORD (decrypt password).
 * Returns null if either is not set. Caches the result after first call.
 */
export function getKeystoreAccount(): PrivateKeyAccount | null {
  if (cachedAccount !== undefined) return cachedAccount;

  const name = process.env.KEYSTORE_ACCOUNT;
  const password = process.env.KEYSTORE_PASSWORD;

  if (!name || !password) {
    cachedAccount = null;
    return null;
  }

  try {
    const privateKey = decryptKeystore(name, password);
    cachedAccount = privateKeyToAccount(privateKey);
    console.log(`[Keystore] Decrypted account ${cachedAccount.address} from keystore "${name}"`);
    return cachedAccount;
  } catch (err: any) {
    console.error(`[Keystore] Failed to decrypt "${name}": ${err.message}`);
    cachedAccount = null;
    return null;
  }
}
