import { createHash, randomBytes } from "crypto";
import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { db } from "~~/lib/db";

export const PROFILE_UPDATE_CHALLENGE_ACTION = "profile-update";
export const PROFILE_UPDATE_CHALLENGE_TTL_MS = 5 * 60 * 1000;

const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,20}$/;
let ensureProfileUpdateChallengeTablePromise: Promise<void> | null = null;

export const signedActionChallenges = sqliteTable("signed_action_challenges", {
  id: text("id").primaryKey(),
  walletAddress: text("wallet_address").notNull(),
  action: text("action").notNull(),
  payloadHash: text("payload_hash").notNull(),
  nonce: text("nonce").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  usedAt: integer("used_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export interface ProfileUpdateInput {
  address?: string;
  username?: string | null;
  profileImageUrl?: string | null;
}

export interface NormalizedProfileUpdatePayload {
  normalizedAddress: `0x${string}`;
  username?: string;
  profileImageUrl?: string | null;
  hasUsername: boolean;
  hasProfileImage: boolean;
}

export async function ensureProfileUpdateChallengeTable() {
  if (!ensureProfileUpdateChallengeTablePromise) {
    ensureProfileUpdateChallengeTablePromise = (async () => {
      await db.run(
        sql.raw(`
        CREATE TABLE IF NOT EXISTS signed_action_challenges (
          id TEXT PRIMARY KEY NOT NULL,
          wallet_address TEXT NOT NULL,
          action TEXT NOT NULL,
          payload_hash TEXT NOT NULL,
          nonce TEXT NOT NULL,
          expires_at INTEGER NOT NULL,
          used_at INTEGER,
          created_at INTEGER NOT NULL
        )
      `),
      );
      await db.run(
        sql.raw(`
        CREATE INDEX IF NOT EXISTS signed_action_challenges_expires_at_idx
        ON signed_action_challenges (expires_at)
      `),
      );
    })();
  }

  await ensureProfileUpdateChallengeTablePromise;
}

function isValidAddress(address: string): address is `0x${string}` {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

export function isValidProfileImageUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function normalizeProfileUpdateInput(
  input: ProfileUpdateInput,
): { ok: true; payload: NormalizedProfileUpdatePayload } | { ok: false; error: string } {
  if (!input.address || !isValidAddress(input.address)) {
    return { ok: false, error: "Invalid wallet address" };
  }

  const hasUsername = input.username !== undefined && input.username !== null;
  const hasProfileImage = input.profileImageUrl !== undefined;

  if (!hasUsername && !hasProfileImage) {
    return { ok: false, error: "Must provide username or profileImageUrl" };
  }

  if (hasUsername && !USERNAME_REGEX.test(input.username!)) {
    return { ok: false, error: "Username must be 3-20 characters (letters, numbers, underscores only)" };
  }

  let normalizedProfileImageUrl: string | null | undefined = undefined;
  if (hasProfileImage) {
    const imageUrl = input.profileImageUrl;

    if (imageUrl === "" || imageUrl === null) {
      normalizedProfileImageUrl = null;
    } else if (typeof imageUrl !== "string" || !isValidProfileImageUrl(imageUrl)) {
      return { ok: false, error: "Invalid image URL format (must be http or https)" };
    } else {
      normalizedProfileImageUrl = imageUrl;
    }
  }

  return {
    ok: true,
    payload: {
      normalizedAddress: input.address.toLowerCase() as `0x${string}`,
      ...(hasUsername ? { username: input.username! } : {}),
      ...(hasProfileImage ? { profileImageUrl: normalizedProfileImageUrl } : {}),
      hasUsername,
      hasProfileImage,
    },
  };
}

export function hashProfileUpdatePayload(payload: NormalizedProfileUpdatePayload): string {
  const serialized = [
    `username:${payload.hasUsername ? (payload.username ?? "") : "__absent__"}`,
    `profileImageUrl:${payload.hasProfileImage ? (payload.profileImageUrl ?? "") : "__absent__"}`,
  ].join("\n");

  return createHash("sha256").update(serialized).digest("hex");
}

export function buildProfileUpdateChallengeMessage(params: {
  address: `0x${string}`;
  payloadHash: string;
  nonce: string;
  expiresAt: Date;
}): string {
  return [
    "Curyo profile update authorization",
    "",
    `Wallet: ${params.address}`,
    `Payload Hash: ${params.payloadHash}`,
    `Nonce: ${params.nonce}`,
    `Expires At: ${params.expiresAt.toISOString()}`,
  ].join("\n");
}

export function createProfileUpdateChallenge(payload: NormalizedProfileUpdatePayload) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + PROFILE_UPDATE_CHALLENGE_TTL_MS);
  const challengeId = randomBytes(16).toString("hex");
  const nonce = randomBytes(16).toString("hex");
  const payloadHash = hashProfileUpdatePayload(payload);
  const message = buildProfileUpdateChallengeMessage({
    address: payload.normalizedAddress,
    payloadHash,
    nonce,
    expiresAt,
  });

  return {
    challengeId,
    nonce,
    payloadHash,
    expiresAt,
    createdAt: now,
    message,
  };
}
