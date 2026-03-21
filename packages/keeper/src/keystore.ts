/**
 * Foundry keystore helpers for the keeper.
 */
import { decryptKeystore, getKeystoreAccountFromCredentials } from "@curyo/node-utils/keystore";
import type { PrivateKeyAccount } from "viem/accounts";

export { decryptKeystore };

let cachedAccount: PrivateKeyAccount | null | undefined;

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
    return cachedAccount;
  } catch (err: any) {
    console.error(`[Keystore] Failed to decrypt "${name}": ${err.message}`);
    cachedAccount = null;
    return null;
  }
}
