import { and, eq, ne } from "drizzle-orm";
import "server-only";
import { type NotificationEmailPayload } from "~~/lib/auth/notificationEmails";
import { db } from "~~/lib/db";
import { type NotificationEmailSubscription, notificationEmailSubscriptions } from "~~/lib/db/schema";
import {
  DEFAULT_EMAIL_NOTIFICATION_SETTINGS,
  type EmailNotificationSettingsState,
} from "~~/lib/notifications/emailShared";

export async function ensureNotificationEmailSubscriptionsTable() {
  // Schema is managed via Drizzle migrations.
}

function getTimestampMs(value: Date | string): number {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

function toState(row: typeof notificationEmailSubscriptions.$inferSelect | undefined): EmailNotificationSettingsState {
  if (!row) {
    return { ...DEFAULT_EMAIL_NOTIFICATION_SETTINGS };
  }

  return {
    email: row.email,
    verified: Boolean(row.verifiedAt),
    roundResolved: row.roundResolved,
    settlingSoonHour: row.settlingSoonHour,
    settlingSoonDay: row.settlingSoonDay,
    followedSubmission: row.followedSubmission,
    followedResolution: row.followedResolution,
  };
}

export async function getEmailNotificationSettings(walletAddress: `0x${string}`) {
  await ensureNotificationEmailSubscriptionsTable();

  const [row] = await db
    .select()
    .from(notificationEmailSubscriptions)
    .where(eq(notificationEmailSubscriptions.walletAddress, walletAddress))
    .limit(1);

  return toState(row);
}

export async function getEmailNotificationSubscription(
  walletAddress: `0x${string}`,
): Promise<NotificationEmailSubscription | null> {
  await ensureNotificationEmailSubscriptionsTable();

  const [row] = await db
    .select()
    .from(notificationEmailSubscriptions)
    .where(eq(notificationEmailSubscriptions.walletAddress, walletAddress))
    .limit(1);

  return row ?? null;
}

export async function upsertEmailNotificationSettings(walletAddress: `0x${string}`, payload: NotificationEmailPayload) {
  await ensureNotificationEmailSubscriptionsTable();

  if (!payload.email) {
    await db
      .delete(notificationEmailSubscriptions)
      .where(eq(notificationEmailSubscriptions.walletAddress, walletAddress));
    return {
      settings: { ...DEFAULT_EMAIL_NOTIFICATION_SETTINGS },
      verificationToken: null as string | null,
    };
  }

  const [emailOwner] = await db
    .select({ walletAddress: notificationEmailSubscriptions.walletAddress })
    .from(notificationEmailSubscriptions)
    .where(
      and(
        eq(notificationEmailSubscriptions.email, payload.email),
        ne(notificationEmailSubscriptions.walletAddress, walletAddress),
      ),
    )
    .limit(1);

  if (emailOwner) {
    throw new Error("EMAIL_IN_USE");
  }

  const [existing] = await db
    .select()
    .from(notificationEmailSubscriptions)
    .where(eq(notificationEmailSubscriptions.walletAddress, walletAddress))
    .limit(1);

  const now = new Date();
  const emailChanged = !existing || existing.email !== payload.email;
  const requiresVerification = emailChanged || !existing?.verifiedAt;
  const verificationToken = requiresVerification ? crypto.randomUUID() : null;
  const verificationExpiresAt = requiresVerification ? new Date(now.getTime() + 24 * 60 * 60 * 1000) : null;

  await db
    .insert(notificationEmailSubscriptions)
    .values({
      walletAddress,
      email: payload.email,
      verifiedAt: emailChanged ? null : (existing?.verifiedAt ?? null),
      verificationToken,
      verificationExpiresAt,
      roundResolved: payload.roundResolved,
      settlingSoonHour: payload.settlingSoonHour,
      settlingSoonDay: payload.settlingSoonDay,
      followedSubmission: payload.followedSubmission,
      followedResolution: payload.followedResolution,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: notificationEmailSubscriptions.walletAddress,
      set: {
        email: payload.email,
        verifiedAt: emailChanged ? null : (existing?.verifiedAt ?? null),
        verificationToken,
        verificationExpiresAt,
        roundResolved: payload.roundResolved,
        settlingSoonHour: payload.settlingSoonHour,
        settlingSoonDay: payload.settlingSoonDay,
        followedSubmission: payload.followedSubmission,
        followedResolution: payload.followedResolution,
        updatedAt: now,
      },
    });

  return {
    settings: {
      email: payload.email,
      verified: !requiresVerification,
      roundResolved: payload.roundResolved,
      settlingSoonHour: payload.settlingSoonHour,
      settlingSoonDay: payload.settlingSoonDay,
      followedSubmission: payload.followedSubmission,
      followedResolution: payload.followedResolution,
    } satisfies EmailNotificationSettingsState,
    verificationToken,
  };
}

export async function restoreEmailNotificationSubscription(
  walletAddress: `0x${string}`,
  snapshot: NotificationEmailSubscription | null,
) {
  await ensureNotificationEmailSubscriptionsTable();

  if (!snapshot) {
    await db
      .delete(notificationEmailSubscriptions)
      .where(eq(notificationEmailSubscriptions.walletAddress, walletAddress));
    return;
  }

  await db.insert(notificationEmailSubscriptions).values(snapshot).onConflictDoUpdate({
    target: notificationEmailSubscriptions.walletAddress,
    set: snapshot,
  });
}

export async function verifyEmailNotificationToken(token: string) {
  await ensureNotificationEmailSubscriptionsTable();

  const now = new Date();
  const [row] = await db
    .select()
    .from(notificationEmailSubscriptions)
    .where(eq(notificationEmailSubscriptions.verificationToken, token))
    .limit(1);

  if (!row || !row.verificationExpiresAt || getTimestampMs(row.verificationExpiresAt) < now.getTime()) {
    return { ok: false as const };
  }

  await db
    .update(notificationEmailSubscriptions)
    .set({
      verifiedAt: now,
      verificationToken: null,
      verificationExpiresAt: null,
      updatedAt: now,
    })
    .where(eq(notificationEmailSubscriptions.walletAddress, row.walletAddress));

  return { ok: true as const, walletAddress: row.walletAddress, email: row.email };
}
