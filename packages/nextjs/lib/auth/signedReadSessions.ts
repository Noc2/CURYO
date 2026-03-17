import { createHash, randomBytes } from "crypto";
import "server-only";
import { dbClient } from "~~/lib/db";

export const WATCHLIST_SIGNED_READ_SESSION_COOKIE_NAME = "curyo_watchlist_read_session";
export const PROFILE_FOLLOWS_SIGNED_READ_SESSION_COOKIE_NAME = "curyo_profile_follows_read_session";
export const NOTIFICATION_PREFERENCES_SIGNED_READ_SESSION_COOKIE_NAME = "curyo_notification_preferences_read_session";
export const NOTIFICATION_EMAIL_SIGNED_READ_SESSION_COOKIE_NAME = "curyo_notification_email_read_session";
export const SIGNED_READ_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type SignedReadSessionScope =
  | "watchlist"
  | "profile_follows"
  | "notification_preferences"
  | "notification_email";

let ensureSignedReadSessionTablePromise: Promise<void> | null = null;

function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function ensureSignedReadSessionTable() {
  if (!ensureSignedReadSessionTablePromise) {
    ensureSignedReadSessionTablePromise = (async () => {
      await dbClient.execute(`
        CREATE TABLE IF NOT EXISTS signed_read_sessions (
          token_hash TEXT PRIMARY KEY,
          wallet_address TEXT NOT NULL,
          scope TEXT NOT NULL,
          expires_at INTEGER NOT NULL,
          created_at INTEGER NOT NULL
        )
      `);
      await dbClient.execute(`
        CREATE INDEX IF NOT EXISTS signed_read_sessions_wallet_scope_expires_idx
        ON signed_read_sessions (wallet_address, scope, expires_at)
      `);
    })();
  }

  await ensureSignedReadSessionTablePromise;
}

async function cleanupExpiredSignedReadSessions(now: number) {
  await dbClient.execute({
    sql: "DELETE FROM signed_read_sessions WHERE expires_at <= ?",
    args: [now],
  });
}

export async function issueSignedReadSession(walletAddress: `0x${string}`, scope: SignedReadSessionScope) {
  await ensureSignedReadSessionTable();

  const now = Date.now();
  const expiresAt = now + SIGNED_READ_SESSION_TTL_MS;
  const token = randomBytes(32).toString("hex");

  await cleanupExpiredSignedReadSessions(now);
  await dbClient.execute({
    sql: `
      INSERT INTO signed_read_sessions (token_hash, wallet_address, scope, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?)
    `,
    args: [hashSessionToken(token), walletAddress, scope, expiresAt, now],
  });

  return {
    token,
    expiresAt: new Date(expiresAt),
  };
}

export async function verifySignedReadSession(
  token: string | undefined,
  walletAddress: `0x${string}`,
  scope: SignedReadSessionScope,
) {
  if (!token) return false;

  await ensureSignedReadSessionTable();

  const now = Date.now();
  const result = await dbClient.execute({
    sql: `
      SELECT token_hash
      FROM signed_read_sessions
      WHERE token_hash = ?
        AND wallet_address = ?
        AND scope = ?
        AND expires_at > ?
      LIMIT 1
    `,
    args: [hashSessionToken(token), walletAddress, scope, now],
  });

  return result.rows.length > 0;
}

export function getSignedReadSessionCookie(
  scope: SignedReadSessionScope,
  nameValue: { token: string; expiresAt: Date },
) {
  const cookieName =
    scope === "watchlist"
      ? WATCHLIST_SIGNED_READ_SESSION_COOKIE_NAME
      : scope === "profile_follows"
        ? PROFILE_FOLLOWS_SIGNED_READ_SESSION_COOKIE_NAME
        : scope === "notification_preferences"
          ? NOTIFICATION_PREFERENCES_SIGNED_READ_SESSION_COOKIE_NAME
          : NOTIFICATION_EMAIL_SIGNED_READ_SESSION_COOKIE_NAME;

  return {
    name: cookieName,
    value: nameValue.token,
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: nameValue.expiresAt,
  };
}
