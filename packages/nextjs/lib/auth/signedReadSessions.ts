import { createHash, randomBytes } from "crypto";
import "server-only";
import { dbClient } from "~~/lib/db";

export const SIGNED_READ_SESSION_COOKIE_NAME = "curyo_signed_read_session";
export const SIGNED_READ_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

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
          expires_at INTEGER NOT NULL,
          created_at INTEGER NOT NULL
        )
      `);
      await dbClient.execute(`
        CREATE INDEX IF NOT EXISTS signed_read_sessions_wallet_expires_idx
        ON signed_read_sessions (wallet_address, expires_at)
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

export async function issueSignedReadSession(walletAddress: `0x${string}`) {
  await ensureSignedReadSessionTable();

  const now = Date.now();
  const expiresAt = now + SIGNED_READ_SESSION_TTL_MS;
  const token = randomBytes(32).toString("hex");

  await cleanupExpiredSignedReadSessions(now);
  await dbClient.execute({
    sql: `
      INSERT INTO signed_read_sessions (token_hash, wallet_address, expires_at, created_at)
      VALUES (?, ?, ?, ?)
    `,
    args: [hashSessionToken(token), walletAddress, expiresAt, now],
  });

  return {
    token,
    expiresAt: new Date(expiresAt),
  };
}

export async function verifySignedReadSession(token: string | undefined, walletAddress: `0x${string}`) {
  if (!token) return false;

  await ensureSignedReadSessionTable();

  const now = Date.now();
  const result = await dbClient.execute({
    sql: `
      SELECT token_hash
      FROM signed_read_sessions
      WHERE token_hash = ?
        AND wallet_address = ?
        AND expires_at > ?
      LIMIT 1
    `,
    args: [hashSessionToken(token), walletAddress, now],
  });

  return result.rows.length > 0;
}

export function getSignedReadSessionCookie(nameValue: { token: string; expiresAt: Date }) {
  return {
    name: SIGNED_READ_SESSION_COOKIE_NAME,
    value: nameValue.token,
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: nameValue.expiresAt,
  };
}
