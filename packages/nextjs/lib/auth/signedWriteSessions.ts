import "server-only";
import { createSignedSessionStore } from "~~/lib/auth/signedSessionStore";

export const WATCHLIST_SIGNED_WRITE_SESSION_COOKIE_NAME = "curyo_watchlist_write_session";
export const PROFILE_FOLLOWS_SIGNED_WRITE_SESSION_COOKIE_NAME = "curyo_profile_follows_write_session";
const SIGNED_WRITE_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type SignedWriteSessionScope = "watchlist" | "profile_follows";

const signedWriteSessionStore = createSignedSessionStore<SignedWriteSessionScope>({
  tableName: "signed_write_sessions",
  indexName: "signed_write_sessions_wallet_scope_expires_idx",
  ttlMs: SIGNED_WRITE_SESSION_TTL_MS,
  cookieNames: {
    watchlist: WATCHLIST_SIGNED_WRITE_SESSION_COOKIE_NAME,
    profile_follows: PROFILE_FOLLOWS_SIGNED_WRITE_SESSION_COOKIE_NAME,
  },
});

export const issueSignedWriteSession = signedWriteSessionStore.issueSession;
export const verifySignedWriteSession = signedWriteSessionStore.verifySession;
export const getSignedWriteSessionCookie = signedWriteSessionStore.getSessionCookie;
