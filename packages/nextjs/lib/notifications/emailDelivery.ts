import { and, eq, isNotNull, or, sql } from "drizzle-orm";
import "server-only";
import { db, dbClient } from "~~/lib/db";
import { notificationEmailDeliveries, notificationEmailSubscriptions, watchedContent } from "~~/lib/db/schema";
import { getOptionalAppUrl } from "~~/lib/env/server";
import { getFollowedWalletAddresses } from "~~/lib/follows/profileFollow";
import { sendResendEmail } from "~~/lib/notifications/resend";
import { pickSettlingSoonNotification } from "~~/lib/notifications/settlingSoon";
import { ponderGet } from "~~/services/ponder/client";

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
  profileImageUrl: string | null;
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
  profileImageUrl: string | null;
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
  profileImageUrl: string | null;
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
            delivered_at INTEGER NOT NULL
          )
        `),
      );
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

function getAbsoluteVoteUrl(contentId: string) {
  const appUrl = getOptionalAppUrl();
  const base = appUrl ?? "http://localhost:3000";
  const url = new URL("/vote", base);
  url.searchParams.set("content", contentId);
  return url.toString();
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildCandidates(subscription: DeliverySubscription, events: NotificationEventResponse): EmailCandidate[] {
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

      candidates.set(eventKey, {
        walletAddress: subscription.walletAddress,
        email: subscription.email,
        eventKey,
        eventType: "round_resolved",
        contentId: item.contentId,
        subject: "A tracked round just resolved on Curyo",
        body: `${bodyPrefix}: "${item.title}".`,
        href: getAbsoluteVoteUrl(item.contentId),
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
      href: getAbsoluteVoteUrl(settlingSoonSummary.contentId),
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
        href: getAbsoluteVoteUrl(item.contentId),
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
        href: getAbsoluteVoteUrl(item.contentId),
      });
    }
  }

  return [...candidates.values()];
}

async function deliveryExists(eventKey: string) {
  const [row] = await db
    .select({ id: notificationEmailDeliveries.id })
    .from(notificationEmailDeliveries)
    .where(eq(notificationEmailDeliveries.eventKey, eventKey))
    .limit(1);

  return Boolean(row);
}

async function recordDelivery(candidate: EmailCandidate) {
  await db.insert(notificationEmailDeliveries).values({
    walletAddress: candidate.walletAddress,
    email: candidate.email,
    eventKey: candidate.eventKey,
    eventType: candidate.eventType,
    contentId: candidate.contentId ?? null,
    deliveredAt: new Date(),
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
  const safeSubject = escapeHtml(candidate.subject);
  const safeBody = escapeHtml(candidate.body);
  const safeHref = escapeHtml(candidate.href);

  await sendResendEmail({
    to: candidate.email,
    subject: candidate.subject,
    text: `${candidate.body}\n\nOpen Curyo: ${candidate.href}`,
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #f5f5f5; background: #111; padding: 24px;">
        <h1 style="font-size: 20px; margin-bottom: 12px;">${safeSubject}</h1>
        <p style="margin-bottom: 16px;">${safeBody}</p>
        <p style="margin-bottom: 20px;">
          <a href="${safeHref}" style="display: inline-block; background: #fff; color: #111; padding: 10px 16px; border-radius: 9999px; text-decoration: none; font-weight: 600;">
            Open Curyo
          </a>
        </p>
      </div>
    `,
  });
}

export async function deliverNotificationEmails() {
  await ensureNotificationEmailDeliveriesTable();

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
      candidates = buildCandidates(subscription, events);
    } catch (error) {
      console.error("Failed to prepare notification email candidates:", subscription.walletAddress, error);
      result.failed += 1;
      continue;
    }

    for (const candidate of candidates) {
      result.attempted += 1;

      if (await deliveryExists(candidate.eventKey)) {
        result.skipped += 1;
        continue;
      }

      const leaseAcquired = await acquireDeliveryLease(candidate.eventKey, Date.now());
      if (!leaseAcquired) {
        result.skipped += 1;
        continue;
      }

      try {
        await sendCandidate(candidate);
        await recordDelivery(candidate);
        result.sent += 1;
      } catch (error) {
        console.error("Failed to send notification email:", candidate.eventKey, error);
        result.failed += 1;
      } finally {
        await releaseDeliveryLease(candidate.eventKey);
      }
    }
  }

  return result;
}
