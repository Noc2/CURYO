import { DEFAULT_ROUND_CONFIG, ROUND_STATE } from "@curyo/contracts/protocol";
import { and, asc, desc, eq, gte, inArray, or, sql } from "ponder";
import { db } from "ponder:api";
import { content, profile, round, vote } from "ponder:schema";
import type { ApiApp } from "../shared.js";
import {
  DISCOVER_MODULE_LIMIT,
  NOTIFICATION_EMAIL_LOOKBACK_SECONDS,
  SETTLING_SOON_WINDOW_SECONDS,
  getDiscoverResolutionOutcome,
  getEstimatedSettlementTime,
  jsonBig,
  parseAddressList,
  parseBigIntList,
} from "../shared.js";
import { isValidAddress, safeLimit } from "../utils.js";

export function registerDiscoveryRoutes(app: ApiApp) {
  app.get("/discover-signals/:address", async (c) => {
    const address = c.req.param("address").toLowerCase() as `0x${string}`;
    if (!isValidAddress(address)) return c.json({ error: "Invalid address" }, 400);

    const watchedContentIds = parseBigIntList(c.req.query("watched"), 100);
    const followedAddresses = parseAddressList(c.req.query("followed"), 200);

    const votedOpenRounds = await db
      .select({
        id: round.id,
        contentId: round.contentId,
        roundId: round.roundId,
        title: content.title,
        description: content.description,
        url: content.url,
        submitter: content.submitter,
        categoryId: content.categoryId,
        roundStartTime: round.startTime,
        profileName: profile.name,
      })
      .from(vote)
      .innerJoin(
        round,
        and(eq(vote.contentId, round.contentId), eq(vote.roundId, round.roundId)),
      )
      .innerJoin(content, eq(vote.contentId, content.id))
      .leftJoin(profile, eq(content.submitter, profile.address))
      .where(
        and(
          eq(vote.voter, address),
          eq(round.state, ROUND_STATE.Open),
          gte(round.voteCount, DEFAULT_ROUND_CONFIG.minVoters),
        ),
      )
      .orderBy(asc(round.startTime))
      .limit(24);

    const watchedOpenRounds = watchedContentIds.length === 0
      ? []
      : await db
          .select({
            id: round.id,
            contentId: round.contentId,
            roundId: round.roundId,
            title: content.title,
            description: content.description,
            url: content.url,
            submitter: content.submitter,
            categoryId: content.categoryId,
            roundStartTime: round.startTime,
            profileName: profile.name,
          })
          .from(round)
          .innerJoin(content, eq(round.contentId, content.id))
          .leftJoin(profile, eq(content.submitter, profile.address))
          .where(
            and(
              inArray(round.contentId, watchedContentIds),
              eq(round.state, ROUND_STATE.Open),
              gte(round.voteCount, DEFAULT_ROUND_CONFIG.minVoters),
            ),
          )
          .orderBy(asc(round.startTime))
          .limit(24);

    const settlingSoonMap = new Map<string, {
      id: string;
      contentId: bigint;
      roundId: bigint;
      title: string;
      description: string;
      url: string;
      submitter: string;
      categoryId: bigint;
      roundStartTime: bigint | null;
      estimatedSettlementTime: bigint | null;
      profileName: string | null;
      source: "watched" | "voted" | "watched_voted";
    }>();

    const addSettlingItems = (rows: typeof votedOpenRounds, source: "watched" | "voted") => {
      for (const item of rows) {
        const key = `${item.contentId.toString()}-${item.roundId.toString()}`;
        const existing = settlingSoonMap.get(key);
        settlingSoonMap.set(key, {
          ...item,
          estimatedSettlementTime: getEstimatedSettlementTime(item.roundStartTime),
          source: existing && existing.source !== source ? "watched_voted" : existing?.source ?? source,
        });
      }
    };

    addSettlingItems(votedOpenRounds, "voted");
    addSettlingItems(watchedOpenRounds, "watched");

    const nowSeconds = BigInt(Math.floor(Date.now() / 1000));
    const cutoff = nowSeconds + BigInt(SETTLING_SOON_WINDOW_SECONDS);
    const allSettlingSoon = [...settlingSoonMap.values()].sort((a, b) => {
      const aTime = a.estimatedSettlementTime ?? (2n ** 62n);
      const bTime = b.estimatedSettlementTime ?? (2n ** 62n);
      if (aTime === bTime) return 0;
      return aTime < bTime ? -1 : 1;
    });
    const settlingSoon = allSettlingSoon
      .filter(item => item.estimatedSettlementTime !== null && item.estimatedSettlementTime <= cutoff)
      .slice(0, DISCOVER_MODULE_LIMIT);
    const settlingSoonItems = settlingSoon.length > 0 ? settlingSoon : allSettlingSoon.slice(0, DISCOVER_MODULE_LIMIT);

    const followedSubmissions = followedAddresses.length === 0
      ? []
      : await db
          .select({
            contentId: content.id,
            title: content.title,
            description: content.description,
            url: content.url,
            createdAt: content.createdAt,
            categoryId: content.categoryId,
            submitter: content.submitter,
            profileName: profile.name,
          })
          .from(content)
          .leftJoin(profile, eq(content.submitter, profile.address))
          .where(and(eq(content.status, 0), inArray(content.submitter, followedAddresses)))
          .orderBy(desc(content.createdAt))
          .limit(DISCOVER_MODULE_LIMIT);

    const followedResolutions = followedAddresses.length === 0
      ? []
      : await db
          .select({
            id: vote.id,
            contentId: vote.contentId,
            roundId: vote.roundId,
            voter: vote.voter,
            isUp: vote.isUp,
            title: content.title,
            description: content.description,
            url: content.url,
            settledAt: round.settledAt,
            roundState: round.state,
            roundUpWins: round.upWins,
            profileName: profile.name,
          })
          .from(vote)
          .innerJoin(
            round,
            and(eq(vote.contentId, round.contentId), eq(vote.roundId, round.roundId)),
          )
          .innerJoin(content, eq(vote.contentId, content.id))
          .leftJoin(profile, eq(vote.voter, profile.address))
          .where(and(
            inArray(vote.voter, followedAddresses),
            eq(vote.revealed, true),
            or(
              eq(round.state, ROUND_STATE.Settled),
              eq(round.state, ROUND_STATE.Cancelled),
              eq(round.state, ROUND_STATE.Tied),
              eq(round.state, ROUND_STATE.RevealFailed),
            ),
          ))
          .orderBy(desc(round.settledAt), desc(vote.revealedAt))
          .limit(DISCOVER_MODULE_LIMIT);

    return jsonBig(c, {
      settlingSoon: settlingSoonItems,
      followedSubmissions,
      followedResolutions: followedResolutions.map(item => ({
        ...item,
        outcome: getDiscoverResolutionOutcome(item.roundState, item.isUp, item.roundUpWins),
      })),
    });
  });

  app.get("/notification-events/:address", async (c) => {
    const address = c.req.param("address").toLowerCase() as `0x${string}`;
    if (!isValidAddress(address)) return c.json({ error: "Invalid address" }, 400);

    const watchedContentIds = parseBigIntList(c.req.query("watched"), 200);
    const followedAddresses = parseAddressList(c.req.query("followed"), 200);
    const nowSeconds = BigInt(Math.floor(Date.now() / 1000));
    const settlingSoonCutoff = nowSeconds + BigInt(SETTLING_SOON_WINDOW_SECONDS);
    const recentCutoff = nowSeconds - BigInt(NOTIFICATION_EMAIL_LOOKBACK_SECONDS);

    const votedOpenRounds = await db
      .select({
        id: round.id,
        contentId: round.contentId,
        roundId: round.roundId,
        title: content.title,
        description: content.description,
        url: content.url,
        submitter: content.submitter,
        categoryId: content.categoryId,
        roundStartTime: round.startTime,
        profileName: profile.name,
      })
      .from(vote)
      .innerJoin(round, and(eq(vote.contentId, round.contentId), eq(vote.roundId, round.roundId)))
      .innerJoin(content, eq(vote.contentId, content.id))
      .leftJoin(profile, eq(content.submitter, profile.address))
      .where(
        and(
          eq(vote.voter, address),
          eq(round.state, ROUND_STATE.Open),
          gte(round.voteCount, DEFAULT_ROUND_CONFIG.minVoters),
        ),
      )
      .orderBy(asc(round.startTime))
      .limit(24);

    const watchedOpenRounds = watchedContentIds.length === 0
      ? []
      : await db
          .select({
            id: round.id,
            contentId: round.contentId,
            roundId: round.roundId,
            title: content.title,
            description: content.description,
            url: content.url,
            submitter: content.submitter,
            categoryId: content.categoryId,
            roundStartTime: round.startTime,
            profileName: profile.name,
          })
          .from(round)
          .innerJoin(content, eq(round.contentId, content.id))
          .leftJoin(profile, eq(content.submitter, profile.address))
          .where(
            and(
              inArray(round.contentId, watchedContentIds),
              eq(round.state, ROUND_STATE.Open),
              gte(round.voteCount, DEFAULT_ROUND_CONFIG.minVoters),
            ),
          )
          .orderBy(asc(round.startTime))
          .limit(24);

    const settlingSoonMap = new Map<string, any>();
    for (const [rows, source] of [[votedOpenRounds, "voted"], [watchedOpenRounds, "watched"]] as const) {
      for (const item of rows) {
        const key = `${item.contentId.toString()}-${item.roundId.toString()}`;
        const existing = settlingSoonMap.get(key);
        settlingSoonMap.set(key, {
          ...item,
          estimatedSettlementTime: getEstimatedSettlementTime(item.roundStartTime),
          source: existing && existing.source !== source ? "watched_voted" : existing?.source ?? source,
        });
      }
    }

    const settlingSoon = [...settlingSoonMap.values()]
      .filter(item => item.estimatedSettlementTime !== null && item.estimatedSettlementTime <= settlingSoonCutoff)
      .sort((a, b) => {
        const aTime = a.estimatedSettlementTime ?? 2n ** 62n;
        const bTime = b.estimatedSettlementTime ?? 2n ** 62n;
        if (aTime === bTime) return 0;
        return aTime < bTime ? -1 : 1;
      })
      .slice(0, 24);

    const followedSubmissions = followedAddresses.length === 0
      ? []
      : await db
          .select({
            contentId: content.id,
            title: content.title,
            description: content.description,
            url: content.url,
            createdAt: content.createdAt,
            categoryId: content.categoryId,
            submitter: content.submitter,
            profileName: profile.name,
          })
          .from(content)
          .leftJoin(profile, eq(content.submitter, profile.address))
          .where(and(eq(content.status, 0), inArray(content.submitter, followedAddresses), gte(content.createdAt, recentCutoff)))
          .orderBy(desc(content.createdAt))
          .limit(24);

    const followedResolutions = followedAddresses.length === 0
      ? []
      : await db
          .select({
            id: vote.id,
            contentId: vote.contentId,
            roundId: vote.roundId,
            voter: vote.voter,
            isUp: vote.isUp,
            title: content.title,
            description: content.description,
            url: content.url,
            settledAt: round.settledAt,
            roundState: round.state,
            roundUpWins: round.upWins,
            profileName: profile.name,
          })
          .from(vote)
          .innerJoin(round, and(eq(vote.contentId, round.contentId), eq(vote.roundId, round.roundId)))
          .innerJoin(content, eq(vote.contentId, content.id))
          .leftJoin(profile, eq(vote.voter, profile.address))
          .where(and(
            inArray(vote.voter, followedAddresses),
            eq(vote.revealed, true),
            gte(round.settledAt, recentCutoff),
            or(
              eq(round.state, ROUND_STATE.Settled),
              eq(round.state, ROUND_STATE.Cancelled),
              eq(round.state, ROUND_STATE.Tied),
              eq(round.state, ROUND_STATE.RevealFailed),
            ),
          ))
          .orderBy(desc(round.settledAt), desc(vote.revealedAt))
          .limit(24);

    const votedResolved = await db
      .select({
        id: vote.id,
        contentId: vote.contentId,
        roundId: vote.roundId,
        voter: vote.voter,
        isUp: vote.isUp,
        title: content.title,
        description: content.description,
        url: content.url,
        settledAt: round.settledAt,
        roundState: round.state,
        roundUpWins: round.upWins,
        profileName: profile.name,
        source: sql<string>`'voted'`,
      })
      .from(vote)
      .innerJoin(round, and(eq(vote.contentId, round.contentId), eq(vote.roundId, round.roundId)))
      .innerJoin(content, eq(vote.contentId, content.id))
      .leftJoin(profile, eq(content.submitter, profile.address))
      .where(and(
        eq(vote.voter, address),
        gte(round.settledAt, recentCutoff),
        or(
          eq(round.state, ROUND_STATE.Settled),
          eq(round.state, ROUND_STATE.Cancelled),
          eq(round.state, ROUND_STATE.Tied),
          eq(round.state, ROUND_STATE.RevealFailed),
        ),
      ))
      .orderBy(desc(round.settledAt))
      .limit(24);

    const watchedResolved = watchedContentIds.length === 0
      ? []
      : await db
          .select({
            id: round.id,
            contentId: round.contentId,
            roundId: round.roundId,
            voter: sql<string>`''`,
            isUp: sql<boolean | null>`NULL`,
            title: content.title,
            description: content.description,
            url: content.url,
            settledAt: round.settledAt,
            roundState: round.state,
            roundUpWins: round.upWins,
            profileName: profile.name,
            source: sql<string>`'watched'`,
          })
          .from(round)
          .innerJoin(content, eq(round.contentId, content.id))
          .leftJoin(profile, eq(content.submitter, profile.address))
          .where(and(
            inArray(round.contentId, watchedContentIds),
            gte(round.settledAt, recentCutoff),
            or(
              eq(round.state, ROUND_STATE.Settled),
              eq(round.state, ROUND_STATE.Cancelled),
              eq(round.state, ROUND_STATE.Tied),
              eq(round.state, ROUND_STATE.RevealFailed),
            ),
          ))
          .orderBy(desc(round.settledAt))
          .limit(24);

    const trackedResolutionMap = new Map<string, any>();
    for (const item of [...watchedResolved, ...votedResolved]) {
      const key = `${item.contentId.toString()}-${item.roundId.toString()}`;
      const existing = trackedResolutionMap.get(key);
      trackedResolutionMap.set(key, {
        ...item,
        source: existing && existing.source !== item.source ? "watched_voted" : existing?.source ?? item.source,
        outcome: getDiscoverResolutionOutcome(item.roundState, item.isUp, item.roundUpWins),
      });
    }

    return jsonBig(c, {
      settlingSoon,
      followedSubmissions,
      followedResolutions: followedResolutions.map(item => ({
        ...item,
        outcome: getDiscoverResolutionOutcome(item.roundState, item.isUp, item.roundUpWins),
      })),
      trackedResolutions: [...trackedResolutionMap.values()]
        .sort((a, b) => {
          const aTime = a.settledAt ?? 0n;
          const bTime = b.settledAt ?? 0n;
          if (aTime === bTime) return 0;
          return aTime > bTime ? -1 : 1;
        })
        .slice(0, 24),
    });
  });

  app.get("/featured-today", async (c) => {
    const limit = safeLimit(c.req.query("limit"), DISCOVER_MODULE_LIMIT, 12);
    const activeLimit = Math.max(2, Math.ceil(limit / 2));
    const earlyLimit = Math.max(2, limit - activeLimit + 1);

    const selectFields = {
      id: round.id,
      contentId: round.contentId,
      roundId: round.roundId,
      title: content.title,
      description: content.description,
      url: content.url,
      submitter: content.submitter,
      categoryId: content.categoryId,
      voteCount: round.voteCount,
      totalStake: round.totalStake,
      roundStartTime: round.startTime,
      profileName: profile.name,
    };

    const activeDebates = await db
      .select(selectFields)
      .from(round)
      .innerJoin(content, eq(round.contentId, content.id))
      .leftJoin(profile, eq(content.submitter, profile.address))
      .where(and(
        eq(round.state, ROUND_STATE.Open),
        eq(content.status, 0),
        gte(round.voteCount, DEFAULT_ROUND_CONFIG.minVoters),
      ))
      .orderBy(desc(round.totalStake), desc(round.voteCount), desc(round.startTime))
      .limit(activeLimit);

    const earlySignal = await db
      .select(selectFields)
      .from(round)
      .innerJoin(content, eq(round.contentId, content.id))
      .leftJoin(profile, eq(content.submitter, profile.address))
      .where(and(
        eq(round.state, ROUND_STATE.Open),
        eq(content.status, 0),
        sql`${round.voteCount} < ${DEFAULT_ROUND_CONFIG.minVoters}`,
      ))
      .orderBy(desc(round.startTime), desc(round.totalStake))
      .limit(earlyLimit);

    const seen = new Set<string>();
    const items = [...activeDebates, ...earlySignal]
      .filter(item => {
        if (seen.has(item.id)) return false;
        seen.add(item.id);
        return true;
      })
      .slice(0, limit)
      .map(item => ({
        ...item,
        featuredReason:
          item.voteCount >= DEFAULT_ROUND_CONFIG.minVoters
            ? "Active debate"
            : item.voteCount > 0
              ? "Needs early signal"
              : "Fresh round",
      }));

    return jsonBig(c, { items });
  });
}
