/**
 * Foundry keystore helpers for Next.js server code.
 */
import { decryptKeystore, getKeystoreAccountFromCredentials } from "@curyo/node-utils/keystore";
import type { PrivateKeyAccount } from "viem/accounts";

export { decryptKeystore };

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
    cachedAccount = getKeystoreAccountFromCredentials(name, password);
    console.debug(`[Keystore] Decrypted account ${cachedAccount.address} from keystore "${name}"`);
    return cachedAccount;
  } catch (err: any) {
    console.error(`[Keystore] Failed to decrypt "${name}": ${err.message}`);
    cachedAccount = null;
    return null;
  }
}
