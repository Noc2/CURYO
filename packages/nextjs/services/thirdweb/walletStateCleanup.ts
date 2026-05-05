import { CURYO_E2E_RPC_URL_STORAGE_KEY, CURYO_E2E_TEST_WALLET_PRIVATE_KEY_STORAGE_KEY } from "./testWalletStorage";

export const WALLET_STATE_EXACT_KEYS = [
  CURYO_E2E_TEST_WALLET_PRIVATE_KEY_STORAGE_KEY,
  CURYO_E2E_RPC_URL_STORAGE_KEY,
] as const;

export const WALLET_STATE_PREFIXES = [
  "thirdweb:",
  "thirdwebEwsWallet",
  "thirdweb_guest_session_id_",
  "walletToken-",
  "a-",
  "wagmi.",
] as const;

export function clearWalletState(storage: Storage | null | undefined) {
  if (!storage) {
    return;
  }

  const keysToRemove: string[] = [];

  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (!key) {
      continue;
    }

    if (
      WALLET_STATE_EXACT_KEYS.includes(key as (typeof WALLET_STATE_EXACT_KEYS)[number]) ||
      WALLET_STATE_PREFIXES.some(prefix => key.startsWith(prefix))
    ) {
      keysToRemove.push(key);
    }
  }

  for (const key of keysToRemove) {
    storage.removeItem(key);
  }
}
