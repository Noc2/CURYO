/**
 * Foundry keystore decryption utility.
 * Copied from packages/nextjs/utils/keystore.ts (Node.js only, no browser deps).
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

  const derivedKey = crypto.scryptSync(Buffer.from(password), saltBuf, dklen, {
    N: n,
    r,
    p,
    maxmem: 128 * n * r * 2,
  });

  const macInput = Buffer.concat([derivedKey.subarray(16, 32), ciphertext]);
  const computedMac = keccak256(`0x${macInput.toString("hex")}`).slice(2);

  if (computedMac !== keystore.crypto.mac) {
    throw new Error("Keystore MAC mismatch — wrong password?");
  }

  const iv = Buffer.from(keystore.crypto.cipherparams.iv, "hex");
  const decipher = crypto.createDecipheriv("aes-128-ctr", derivedKey.subarray(0, 16), iv);
  const privateKey = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

  return `0x${privateKey.toString("hex")}` as `0x${string}`;
}

export function getKeystoreAccount(name: string, password: string): PrivateKeyAccount | null {
  try {
    const privateKey = decryptKeystore(name, password);
    const account = privateKeyToAccount(privateKey);
    console.log(`[Keystore] Decrypted account ${account.address} from keystore "${name}"`);
    return account;
  } catch (err: any) {
    console.error(`[Keystore] Failed to decrypt "${name}": ${err.message}`);
    return null;
  }
}
