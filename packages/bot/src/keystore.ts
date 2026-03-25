/**
 * Foundry keystore helpers for the bot.
 */
import { getKeystoreAccountFromCredentials } from "@curyo/node-utils/keystore";
import type { PrivateKeyAccount } from "viem/accounts";

export function getKeystoreAccount(name: string, password: string): PrivateKeyAccount | null {
  try {
    const account = getKeystoreAccountFromCredentials(name, password);
    console.log(`[Keystore] Decrypted account ${account.address} from keystore "${name}"`);
    return account;
  } catch (err: any) {
    console.error(`[Keystore] Failed to decrypt "${name}": ${err.message}`);
    return null;
  }
}
