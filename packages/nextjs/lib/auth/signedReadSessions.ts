import "server-only";
import { createSignedSessionStore } from "~~/lib/auth/signedSessionStore";

export const WATCHLIST_SIGNED_READ_SESSION_COOKIE_NAME = "curyo_watchlist_read_session";
export const PROFILE_FOLLOWS_SIGNED_READ_SESSION_COOKIE_NAME = "curyo_profile_follows_read_session";
export const NOTIFICATION_PREFERENCES_SIGNED_READ_SESSION_COOKIE_NAME = "curyo_notification_preferences_read_session";
export const NOTIFICATION_EMAIL_SIGNED_READ_SESSION_COOKIE_NAME = "curyo_notification_email_read_session";
const SIGNED_READ_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type SignedReadSessionScope =
  | "watchlist"
  | "profile_follows"
  | "notification_preferences"
  | "notification_email";

const signedReadSessionStore = createSignedSessionStore<SignedReadSessionScope>({
  tableName: "signed_read_sessions",
  indexName: "signed_read_sessions_wallet_scope_expires_idx",
  ttlMs: SIGNED_READ_SESSION_TTL_MS,
  cookieNames: {
    watchlist: WATCHLIST_SIGNED_READ_SESSION_COOKIE_NAME,
    profile_follows: PROFILE_FOLLOWS_SIGNED_READ_SESSION_COOKIE_NAME,
    notification_preferences: NOTIFICATION_PREFERENCES_SIGNED_READ_SESSION_COOKIE_NAME,
    notification_email: NOTIFICATION_EMAIL_SIGNED_READ_SESSION_COOKIE_NAME,
  },
});

export const issueSignedReadSession = signedReadSessionStore.issueSession;
export const verifySignedReadSession = signedReadSessionStore.verifySession;
export const getSignedReadSessionCookie = signedReadSessionStore.getSessionCookie;
