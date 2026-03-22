import { eq } from "drizzle-orm";
import "server-only";
import { type NotificationPreferencesPayload } from "~~/lib/auth/notificationPreferences";
import { db } from "~~/lib/db";
import { notificationPreferences } from "~~/lib/db/schema";
import { DEFAULT_NOTIFICATION_PREFERENCES } from "~~/lib/notifications/shared";

export type StoredNotificationPreferences = typeof DEFAULT_NOTIFICATION_PREFERENCES;

export async function ensureNotificationPreferencesTable() {
  // Schema is managed via Drizzle migrations.
}

export async function getNotificationPreferences(walletAddress: `0x${string}`): Promise<StoredNotificationPreferences> {
  await ensureNotificationPreferencesTable();

  const [item] = await db
    .select()
    .from(notificationPreferences)
    .where(eq(notificationPreferences.walletAddress, walletAddress))
    .limit(1);

  if (!item) {
    return { ...DEFAULT_NOTIFICATION_PREFERENCES };
  }

  return {
    roundResolved: item.roundResolved,
    settlingSoonHour: item.settlingSoonHour,
    settlingSoonDay: item.settlingSoonDay,
    followedSubmission: item.followedSubmission,
    followedResolution: item.followedResolution,
  };
}

export async function upsertNotificationPreferences(
  walletAddress: `0x${string}`,
  payload: NotificationPreferencesPayload,
): Promise<StoredNotificationPreferences> {
  await ensureNotificationPreferencesTable();

  const now = new Date();

  await db
    .insert(notificationPreferences)
    .values({
      walletAddress,
      roundResolved: payload.roundResolved,
      settlingSoonHour: payload.settlingSoonHour,
      settlingSoonDay: payload.settlingSoonDay,
      followedSubmission: payload.followedSubmission,
      followedResolution: payload.followedResolution,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: notificationPreferences.walletAddress,
      set: {
        roundResolved: payload.roundResolved,
        settlingSoonHour: payload.settlingSoonHour,
        settlingSoonDay: payload.settlingSoonDay,
        followedSubmission: payload.followedSubmission,
        followedResolution: payload.followedResolution,
        updatedAt: now,
      },
    });

  return {
    roundResolved: payload.roundResolved,
    settlingSoonHour: payload.settlingSoonHour,
    settlingSoonDay: payload.settlingSoonDay,
    followedSubmission: payload.followedSubmission,
    followedResolution: payload.followedResolution,
  };
}
