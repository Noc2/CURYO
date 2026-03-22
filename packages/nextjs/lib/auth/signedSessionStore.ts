import { createHash, randomBytes } from "crypto";
import "server-only";
import { dbClient } from "~~/lib/db";

type SessionCookie = {
  name: string;
  value: string;
  httpOnly: true;
  sameSite: "lax";
  secure: boolean;
  path: "/";
  expires: Date;
};

type SessionValue = {
  token: string;
  expiresAt: Date;
};

type SignedSessionStoreConfig<Scope extends string> = {
  tableName: string;
  indexName: string;
  ttlMs: number;
  cookieNames: Record<Scope, string>;
};

function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function createSignedSessionStore<Scope extends string>(config: SignedSessionStoreConfig<Scope>) {
  let ensureTablePromise: Promise<void> | null = null;

  async function ensureTable() {
    if (!ensureTablePromise) {
      ensureTablePromise = Promise.resolve();
    }

    await ensureTablePromise;
  }

  async function cleanupExpiredSessions(now: number) {
    await dbClient.execute({
      sql: `DELETE FROM ${config.tableName} WHERE expires_at <= ?`,
      args: [now],
    });
  }

  async function issueSession(walletAddress: `0x${string}`, scope: Scope): Promise<SessionValue> {
    await ensureTable();

    const now = Date.now();
    const expiresAt = now + config.ttlMs;
    const token = randomBytes(32).toString("hex");

    await cleanupExpiredSessions(now);
    await dbClient.execute({
      sql: `
        INSERT INTO ${config.tableName} (token_hash, wallet_address, scope, expires_at, created_at)
        VALUES (?, ?, ?, ?, ?)
      `,
      args: [hashSessionToken(token), walletAddress, scope, expiresAt, now],
    });

    return {
      token,
      expiresAt: new Date(expiresAt),
    };
  }

  async function verifySession(token: string | undefined, walletAddress: `0x${string}`, scope: Scope) {
    if (!token) return false;

    try {
      await ensureTable();

      const now = Date.now();
      const result = await dbClient.execute({
        sql: `
          SELECT token_hash
          FROM ${config.tableName}
          WHERE token_hash = ?
            AND wallet_address = ?
            AND scope = ?
            AND expires_at > ?
          LIMIT 1
        `,
        args: [hashSessionToken(token), walletAddress, scope, now],
      });

      return result.rows.length > 0;
    } catch (error) {
      console.warn(`[signed-session] failed to verify ${config.tableName} session`, error);
      return false;
    }
  }

  function getSessionCookie(scope: Scope, session: SessionValue): SessionCookie {
    return {
      name: config.cookieNames[scope],
      value: session.token,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      expires: session.expiresAt,
    };
  }

  return {
    ensureTable,
    issueSession,
    verifySession,
    getSessionCookie,
  };
}
