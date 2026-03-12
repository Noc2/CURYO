import { createHash, randomBytes } from "crypto";
import "server-only";
import { dbClient } from "~~/lib/db";

export const WATCHLIST_SIGNED_WRITE_SESSION_COOKIE_NAME = "curyo_watchlist_write_session";
export const PROFILE_FOLLOWS_SIGNED_WRITE_SESSION_COOKIE_NAME = "curyo_profile_follows_write_session";
export const SIGNED_WRITE_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type SignedWriteSessionScope = "watchlist" | "profile_follows";

let ensureSignedWriteSessionTablePromise: Promise<void> | null = null;

function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function ensureSignedWriteSessionTable() {
  if (!ensureSignedWriteSessionTablePromise) {
    ensureSignedWriteSessionTablePromise = (async () => {
      await dbClient.execute(`
        CREATE TABLE IF NOT EXISTS signed_write_sessions (
          token_hash TEXT PRIMARY KEY,
          wallet_address TEXT NOT NULL,
          scope TEXT NOT NULL DEFAULT 'legacy',
          expires_at INTEGER NOT NULL,
          created_at INTEGER NOT NULL
        )
      `);
      const tableInfo = await dbClient.execute("PRAGMA table_info(signed_write_sessions)");
      const hasScopeColumn = tableInfo.rows.some(row => row.name === "scope");
      if (!hasScopeColumn) {
        await dbClient.execute(`
          ALTER TABLE signed_write_sessions
          ADD COLUMN scope TEXT NOT NULL DEFAULT 'legacy'
        `);
      }
      await dbClient.execute(`
        CREATE INDEX IF NOT EXISTS signed_write_sessions_wallet_scope_expires_idx
        ON signed_write_sessions (wallet_address, scope, expires_at)
      `);
    })();
  }

  await ensureSignedWriteSessionTablePromise;
}

async function cleanupExpiredSignedWriteSessions(now: number) {
  await dbClient.execute({
    sql: "DELETE FROM signed_write_sessions WHERE expires_at <= ?",
    args: [now],
  });
}

export async function issueSignedWriteSession(walletAddress: `0x${string}`, scope: SignedWriteSessionScope) {
  await ensureSignedWriteSessionTable();

  const now = Date.now();
  const expiresAt = now + SIGNED_WRITE_SESSION_TTL_MS;
  const token = randomBytes(32).toString("hex");

  await cleanupExpiredSignedWriteSessions(now);
  await dbClient.execute({
    sql: `
      INSERT INTO signed_write_sessions (token_hash, wallet_address, scope, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?)
    `,
    args: [hashSessionToken(token), walletAddress, scope, expiresAt, now],
  });

  return {
    token,
    expiresAt: new Date(expiresAt),
  };
}

export async function verifySignedWriteSession(
  token: string | undefined,
  walletAddress: `0x${string}`,
  scope: SignedWriteSessionScope,
) {
  if (!token) return false;

  await ensureSignedWriteSessionTable();

  const now = Date.now();
  const result = await dbClient.execute({
    sql: `
      SELECT token_hash
      FROM signed_write_sessions
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

export function getSignedWriteSessionCookie(
  scope: SignedWriteSessionScope,
  nameValue: { token: string; expiresAt: Date },
) {
  const cookieName =
    scope === "watchlist"
      ? WATCHLIST_SIGNED_WRITE_SESSION_COOKIE_NAME
      : scope === "profile_follows"
        ? PROFILE_FOLLOWS_SIGNED_WRITE_SESSION_COOKIE_NAME
        : "curyo_write_session";

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
