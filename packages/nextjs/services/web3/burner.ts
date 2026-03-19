import { burner } from "burner-connector";

export const BURNER_WALLET_ID = "burnerWallet";
export const BURNER_WALLET_USE_SESSION_STORAGE = false;

export function createBurnerConnector() {
  return burner({
    useSessionStorage: BURNER_WALLET_USE_SESSION_STORAGE,
  });
}
