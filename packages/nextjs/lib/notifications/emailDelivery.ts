import { and, eq, isNotNull, or, sql } from "drizzle-orm";
import "server-only";
import { db, dbClient } from "~~/lib/db";
import { notificationEmailDeliveries, notificationEmailSubscriptions, watchedContent } from "~~/lib/db/schema";
import { getOptionalAppUrl } from "~~/lib/env/server";
import { getFollowedWalletAddresses } from "~~/lib/follows/profileFollow";
import { buildCuryoEmailHtml } from "~~/lib/notifications/emailTemplate";
import { isResendConfigured, sendResendEmail } from "~~/lib/notifications/resend";
import { pickSettlingSoonNotification } from "~~/lib/notifications/settlingSoon";
import { isPonderAvailable, isPonderConfigured, ponderGet } from "~~/services/ponder/client";

type DeliverySubscription = typeof notificationEmailSubscriptions.$inferSelect;

interface NotificationEventSubmissionItem {
  contentId: string;
  title: string;
  description: string;
  url: string;
  createdAt: string;
  categoryId: string;
  submitter: string;
  profileName: string | null;
}

interface NotificationEventResolutionItem {
  id: string;
  contentId: string;
  roundId: string;
  voter: string;
  isUp: boolean | null;
  title: string;
  description: string;
  url: string;
  settledAt: string | null;
  roundState: number | null;
  roundUpWins: boolean | null;
  profileName: string | null;
  outcome: "won" | "lost" | "cancelled" | "tied" | "reveal_failed" | "resolved";
  source?: "watched" | "voted" | "watched_voted";
}

interface NotificationEventSettlingItem {
  id: string;
  contentId: string;
  roundId: string;
  title: string;
  description: string;
  url: string;
  submitter: string;
  categoryId: string;
  roundStartTime: string | null;
  estimatedSettlementTime: string | null;
  profileName: string | null;
  source: "watched" | "voted" | "watched_voted";
}

interface NotificationEventResponse {
  settlingSoon: NotificationEventSettlingItem[];
  followedSubmissions: NotificationEventSubmissionItem[];
  followedResolutions: NotificationEventResolutionItem[];
  trackedResolutions: NotificationEventResolutionItem[];
}

interface EmailCandidate {
  walletAddress: string;
  email: string;
  eventKey: string;
  eventType: string;
  contentId?: string;
  subject: string;
  body: string;
  href: string;
}

let ensureNotificationEmailDeliveriesTablePromise: Promise<void> | null = null;
const DELIVERY_LEASE_MS = 2 * 60 * 1000;
const DELIVERY_STATUS_SENT = "sent";
const DELIVERY_STATUS_SENDING = "sending";
type DeliveryStatus = typeof DELIVERY_STATUS_SENT | typeof DELIVERY_STATUS_SENDING;

export function resolveNotificationEmailDeliveryStatus(args: {
  resendConfigured: boolean;
  ponderConfigured: boolean;
  ponderAvailable: boolean;
  appUrlConfigured: boolean;
}) {
  if (!args.resendConfigured || !args.ponderConfigured || !args.appUrlConfigured) {
    return {
      ok: false as const,
      error: "Notification delivery is not configured",
    };
  }

  if (!args.ponderAvailable) {
    return {
      ok: false as const,
      error: "Notification delivery is unavailable while the indexer is offline",
    };
  }

  return {
    ok: true as const,
  };
}

export async function getNotificationEmailDeliveryStatus() {
  const resendConfigured = isResendConfigured();
  const ponderConfigured = isPonderConfigured();
  const ponderAvailable = ponderConfigured ? await isPonderAvailable() : false;
  const appUrlConfigured = Boolean(getOptionalAppUrl());

  return resolveNotificationEmailDeliveryStatus({
    resendConfigured,
    ponderConfigured,
    ponderAvailable,
    appUrlConfigured,
  });
}

function getRequiredNotificationAppUrl() {
  const appUrl = getOptionalAppUrl();
  if (!appUrl) {
    throw new Error("Notification delivery is not configured");
  }
  return appUrl;
}

export async function ensureNotificationEmailDeliveriesTable() {
  if (!ensureNotificationEmailDeliveriesTablePromise) {
    ensureNotificationEmailDeliveriesTablePromise = (async () => {
      await db.run(
        sql.raw(`
          CREATE TABLE IF NOT EXISTS notification_email_deliveries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            wallet_address TEXT NOT NULL,
            email TEXT NOT NULL,
            event_key TEXT NOT NULL UNIQUE,
            event_type TEXT NOT NULL,
            content_id TEXT,
            status TEXT NOT NULL DEFAULT 'sent',
            delivered_at INTEGER NOT NULL
          )
        `),
      );
      const tableInfo = await dbClient.execute("PRAGMA table_info(notification_email_deliveries)");
      const hasStatusColumn = tableInfo.rows.some(row => row.name === "status");
      if (!hasStatusColumn) {
        await dbClient.execute(`
          ALTER TABLE notification_email_deliveries
          ADD COLUMN status TEXT NOT NULL DEFAULT 'sent'
        `);
      }
      await db.run(
        sql.raw(`
          CREATE TABLE IF NOT EXISTS notification_email_delivery_leases (
            event_key TEXT PRIMARY KEY,
            lease_expires_at INTEGER NOT NULL
          )
        `),
      );
    })();
  }

  await ensureNotificationEmailDeliveriesTablePromise;
}

async function getActiveSubscriptions(): Promise<DeliverySubscription[]> {
  return db
    .select()
    .from(notificationEmailSubscriptions)
    .where(
      and(
        isNotNull(notificationEmailSubscriptions.verifiedAt),
        or(
          eq(notificationEmailSubscriptions.roundResolved, true),
          eq(notificationEmailSubscriptions.settlingSoonHour, true),
          eq(notificationEmailSubscriptions.settlingSoonDay, true),
          eq(notificationEmailSubscriptions.followedSubmission, true),
          eq(notificationEmailSubscriptions.followedResolution, true),
        ),
      ),
    );
}

async function getWatchedContentIds(walletAddress: string) {
  const rows = await db
    .select({ contentId: watchedContent.contentId })
    .from(watchedContent)
    .where(eq(watchedContent.walletAddress, walletAddress));

  return rows.map(row => row.contentId);
}

async function getNotificationEvents(walletAddress: string): Promise<NotificationEventResponse> {
  const watchedIds = await getWatchedContentIds(walletAddress);
  const followedWallets = await getFollowedWalletAddresses(walletAddress as `0x${string}`);
  return ponderGet<NotificationEventResponse>(`/notification-events/${walletAddress}`, {
    watched: watchedIds.join(","),
    followed: followedWallets.join(","),
  });
}

function getDisplayName(address: string, profileName: string | null) {
  return profileName || `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function getAbsoluteVoteUrl(contentId: string, appUrl: string) {
  const url = new URL("/vote", appUrl);
  url.searchParams.set("content", contentId);
  return url.toString();
}

function getAbsoluteGovernanceUrl(appUrl: string) {
  return new URL("/governance", appUrl).toString();
}

function getAbsoluteRoundResolvedUrl(
  contentId: string,
  source: NotificationEventResolutionItem["source"],
  appUrl: string,
) {
  return source === "watched" ? getAbsoluteVoteUrl(contentId, appUrl) : getAbsoluteGovernanceUrl(appUrl);
}

function buildCandidates(
  subscription: DeliverySubscription,
  events: NotificationEventResponse,
  appUrl: string,
): EmailCandidate[] {
  const candidates = new Map<string, EmailCandidate>();
  const nowSeconds = Math.floor(Date.now() / 1000);

  if (subscription.roundResolved) {
    for (const item of events.trackedResolutions) {
      const source = item.source ?? "voted";
      const eventKey = `round-resolved:${subscription.walletAddress}:${item.contentId}:${item.roundId}`;
      const bodyPrefix =
        source === "watched"
          ? "A watched round resolved"
          : source === "watched_voted"
            ? "A round you watched and voted on resolved"
            : "A round you voted on resolved";
      const href = getAbsoluteRoundResolvedUrl(item.contentId, source, appUrl);
      const body =
        source === "watched"
          ? `${bodyPrefix}: "${item.title}".`
          : `${bodyPrefix}: "${item.title}". Open Governance to claim your cREP from this round.`;

      candidates.set(eventKey, {
        walletAddress: subscription.walletAddress,
        email: subscription.email,
        eventKey,
        eventType: "round_resolved",
        contentId: item.contentId,
        subject: "A tracked round just resolved on Curyo",
        body,
        href,
      });
    }
  }

  const settlingSoonSummary = pickSettlingSoonNotification({
    nowSeconds,
    items: events.settlingSoon,
    seenHourIds: new Set(),
    seenDayIds: new Set(),
    allowHour: subscription.settlingSoonHour,
    allowDay: subscription.settlingSoonDay,
  });

  if (settlingSoonSummary) {
    const eventKey = `settling-${settlingSoonSummary.kind}:${subscription.walletAddress}:${settlingSoonSummary.itemIds.join(",")}`;
    candidates.set(eventKey, {
      walletAddress: subscription.walletAddress,
      email: subscription.email,
      eventKey,
      eventType: settlingSoonSummary.kind === "hour" ? "settling_soon_hour" : "settling_soon_day",
      contentId: settlingSoonSummary.contentId,
      subject:
        settlingSoonSummary.kind === "hour"
          ? "A tracked round is settling within the hour"
          : "A tracked round looks likely to settle today",
      body: settlingSoonSummary.body,
      href: getAbsoluteVoteUrl(settlingSoonSummary.contentId, appUrl),
    });
  }

  if (subscription.followedSubmission) {
    for (const item of events.followedSubmissions) {
      const eventKey = `followed-submission:${subscription.walletAddress}:${item.contentId}:${item.createdAt}`;
      const displayName = getDisplayName(item.submitter, item.profileName);
      candidates.set(eventKey, {
        walletAddress: subscription.walletAddress,
        email: subscription.email,
        eventKey,
        eventType: "followed_submission",
        contentId: item.contentId,
        subject: `${displayName} submitted something new on Curyo`,
        body: `${displayName} just submitted "${item.title}".`,
        href: getAbsoluteVoteUrl(item.contentId, appUrl),
      });
    }
  }

  if (subscription.followedResolution) {
    for (const item of events.followedResolutions) {
      const eventKey = `followed-resolution:${subscription.walletAddress}:${item.contentId}:${item.roundId}:${item.settledAt ?? ""}`;
      const displayName = getDisplayName(item.voter, item.profileName);
      const action = item.outcome === "won" ? "won" : item.outcome === "lost" ? "lost" : "resolved";
      candidates.set(eventKey, {
        walletAddress: subscription.walletAddress,
        email: subscription.email,
        eventKey,
        eventType: "followed_resolution",
        contentId: item.contentId,
        subject: `${displayName} ${action} a Curyo call`,
        body: `${displayName} ${action} a call on "${item.title}".`,
        href: getAbsoluteVoteUrl(item.contentId, appUrl),
      });
    }
  }

  return [...candidates.values()];
}

async function getDeliveryState(eventKey: string): Promise<DeliveryStatus | null> {
  const [row] = await db
    .select({ status: notificationEmailDeliveries.status })
    .from(notificationEmailDeliveries)
    .where(eq(notificationEmailDeliveries.eventKey, eventKey))
    .limit(1);

  if (!row) return null;
  return row.status === DELIVERY_STATUS_SENDING ? DELIVERY_STATUS_SENDING : DELIVERY_STATUS_SENT;
}

export function resolveNotificationEmailDeliveryAttempt(args: {
  deliveryState: "sent" | "sending" | null;
  leaseAcquired: boolean;
}) {
  if (args.deliveryState === DELIVERY_STATUS_SENT) {
    return "skip-sent" as const;
  }

  if (!args.leaseAcquired) {
    return "skip-lease" as const;
  }

  return "send" as const;
}

async function reservePendingDelivery(candidate: EmailCandidate) {
  const result = await dbClient.execute({
    sql: `
      INSERT INTO notification_email_deliveries (
        wallet_address,
        email,
        event_key,
        event_type,
        content_id,
        status,
        delivered_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(event_key) DO UPDATE SET
        wallet_address = excluded.wallet_address,
        email = excluded.email,
        event_type = excluded.event_type,
        content_id = excluded.content_id,
        status = excluded.status
      WHERE notification_email_deliveries.status != ?
      RETURNING event_key
    `,
    args: [
      candidate.walletAddress,
      candidate.email,
      candidate.eventKey,
      candidate.eventType,
      candidate.contentId ?? null,
      DELIVERY_STATUS_SENDING,
      0,
      DELIVERY_STATUS_SENT,
    ],
  });

  return result.rows.length > 0;
}

async function markDeliverySent(eventKey: string) {
  await db
    .update(notificationEmailDeliveries)
    .set({
      status: DELIVERY_STATUS_SENT,
      deliveredAt: new Date(),
    })
    .where(eq(notificationEmailDeliveries.eventKey, eventKey));
}

async function clearPendingDelivery(eventKey: string) {
  await dbClient.execute({
    sql: "DELETE FROM notification_email_deliveries WHERE event_key = ? AND status = ?",
    args: [eventKey, DELIVERY_STATUS_SENDING],
  });
}

async function acquireDeliveryLease(eventKey: string, now: number) {
  const result = await dbClient.execute({
    sql: `
      INSERT INTO notification_email_delivery_leases (event_key, lease_expires_at)
      VALUES (?, ?)
      ON CONFLICT(event_key) DO UPDATE SET
        lease_expires_at = excluded.lease_expires_at
      WHERE notification_email_delivery_leases.lease_expires_at <= ?
      RETURNING event_key
    `,
    args: [eventKey, now + DELIVERY_LEASE_MS, now],
  });

  return result.rows.length > 0;
}

async function releaseDeliveryLease(eventKey: string) {
  await dbClient.execute({
    sql: "DELETE FROM notification_email_delivery_leases WHERE event_key = ?",
    args: [eventKey],
  });
}

async function sendCandidate(candidate: EmailCandidate) {
  await sendResendEmail({
    to: candidate.email,
    subject: candidate.subject,
    text: `${candidate.body}\n\nOpen Curyo: ${candidate.href}`,
    html: buildCuryoEmailHtml({
      eyebrow: "Curyo notification",
      title: candidate.subject,
      body: candidate.body,
      ctaLabel: "Open Curyo",
      ctaHref: candidate.href,
      footerNote: "You are receiving this email because this notification type is enabled in your Curyo settings.",
    }),
  });
}

export async function deliverNotificationEmails() {
  await ensureNotificationEmailDeliveriesTable();
  const appUrl = getRequiredNotificationAppUrl();

  const subscriptions = await getActiveSubscriptions();
  const result = {
    processedSubscriptions: subscriptions.length,
    attempted: 0,
    sent: 0,
    skipped: 0,
    failed: 0,
  };

  for (const subscription of subscriptions) {
    let candidates: EmailCandidate[];
    try {
      const events = await getNotificationEvents(subscription.walletAddress);
      candidates = buildCandidates(subscription, events, appUrl);
    } catch (error) {
      console.error("Failed to prepare notification email candidates:", subscription.walletAddress, error);
      result.failed += 1;
      continue;
    }

    for (const candidate of candidates) {
      result.attempted += 1;

      const deliveryState = await getDeliveryState(candidate.eventKey);
      const leaseAcquired = await acquireDeliveryLease(candidate.eventKey, Date.now());
      const attempt = resolveNotificationEmailDeliveryAttempt({
        deliveryState,
        leaseAcquired,
      });

      if (attempt === "skip-sent" || attempt === "skip-lease") {
        result.skipped += 1;
        continue;
      }

      try {
        const reserved = await reservePendingDelivery(candidate);
        if (!reserved) {
          result.skipped += 1;
          await releaseDeliveryLease(candidate.eventKey);
          continue;
        }

        await sendCandidate(candidate);
        try {
          await markDeliverySent(candidate.eventKey);
          result.sent += 1;
          await releaseDeliveryLease(candidate.eventKey);
        } catch (error) {
          console.error(
            "Notification email may have been sent but could not be marked delivered:",
            candidate.eventKey,
            error,
          );
          result.failed += 1;
        }
      } catch (error) {
        console.error("Failed to send notification email:", candidate.eventKey, error);
        await clearPendingDelivery(candidate.eventKey);
        await releaseDeliveryLease(candidate.eventKey);
        result.failed += 1;
      }
    }
  }

  return result;
}
