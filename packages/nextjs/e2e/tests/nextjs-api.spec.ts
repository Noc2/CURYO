import { ANVIL_ACCOUNTS } from "../helpers/anvil-accounts";
import "../helpers/fetch-shim";
import { E2E_BASE_URL } from "../helpers/service-urls";
import { expect, test } from "@playwright/test";

const BASE_URL = E2E_BASE_URL;

/**
 * Next.js API route tests.
 * Pure API tests using fetch — no browser needed.
 */
test.describe("Next.js API routes", () => {
  async function getNotificationPreferencesSessionStatus(address: string, cookie?: string) {
    const res = await fetch(`${BASE_URL}/api/notifications/preferences/session?address=${address}`, {
      headers: cookie ? { cookie } : undefined,
    });
    expect(res.status).toBe(200);
    return res.json() as Promise<{ hasSession: boolean }>;
  }

  async function issueNotificationPreferencesReadChallenge(address: string) {
    const res = await fetch(`${BASE_URL}/api/notifications/preferences/challenge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address, intent: "read" }),
    });
    expect(res.status).toBe(200);
    return res.json() as Promise<{ challengeId: string; message: string }>;
  }

  async function createNotificationPreferencesReadSession(
    address: string,
    signMessage: (args: { message: string }) => Promise<`0x${string}`>,
  ) {
    const challenge = await issueNotificationPreferencesReadChallenge(address);
    const signature = await signMessage({ message: challenge.message });
    const res = await fetch(`${BASE_URL}/api/notifications/preferences`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address, signature, challengeId: challenge.challengeId }),
    });

    expect(res.status).toBe(200);
    const cookie = res.headers.get("set-cookie");
    expect(cookie).toContain("curyo_notification_preferences_read_session=");

    return {
      cookie: cookie!.split(";")[0],
      body: await res.json(),
    };
  }

  async function updateNotificationPreferences(
    address: string,
    signMessage: (args: { message: string }) => Promise<`0x${string}`>,
    nextPreferences: Record<string, boolean>,
  ) {
    const challengeRes = await fetch(`${BASE_URL}/api/notifications/preferences/challenge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address, ...nextPreferences }),
    });
    expect(challengeRes.status).toBe(200);

    const challenge = await challengeRes.json();
    const signature = await signMessage({ message: challenge.message as string });

    const res = await fetch(`${BASE_URL}/api/notifications/preferences`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        address,
        ...nextPreferences,
        signature,
        challengeId: challenge.challengeId,
      }),
    });

    expect(res.status).toBe(200);
    return res.json();
  }

  async function issueEmailNotificationReadChallenge(address: string) {
    const res = await fetch(`${BASE_URL}/api/notifications/email/challenge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address, intent: "read" }),
    });
    expect(res.status).toBe(200);
    return res.json() as Promise<{ challengeId: string; message: string }>;
  }

  async function createEmailNotificationReadSession(
    address: string,
    signMessage: (args: { message: string }) => Promise<`0x${string}`>,
  ) {
    const challenge = await issueEmailNotificationReadChallenge(address);
    const signature = await signMessage({ message: challenge.message });
    const res = await fetch(`${BASE_URL}/api/notifications/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address, signature, challengeId: challenge.challengeId }),
    });

    expect(res.status).toBe(200);
    const cookie = res.headers.get("set-cookie");
    expect(cookie).toContain("curyo_notification_email_read_session=");

    return {
      cookie: cookie!.split(";")[0],
      body: await res.json(),
    };
  }

  async function getEmailNotificationSessionStatus(address: string, cookie?: string) {
    const res = await fetch(`${BASE_URL}/api/notifications/email/session?address=${address}`, {
      headers: cookie ? { cookie } : undefined,
    });
    expect(res.status).toBe(200);
    return res.json() as Promise<{ hasSession: boolean }>;
  }

  test("GET /api/leaderboard returns entry list", async () => {
    const res = await fetch(`${BASE_URL}/api/leaderboard?limit=10`);
    expect(res.ok).toBe(true);

    const data = await res.json();
    expect(data).toHaveProperty("entries");
    expect(data).toHaveProperty("totalCount");
    expect(data).toHaveProperty("source");
    expect(data).toHaveProperty("type", "voters");
    expect(Array.isArray(data.entries)).toBe(true);
    expect(data.entries.length).toBeGreaterThan(0);
  });

  test("GET /api/leaderboard rejects unsupported leaderboard types", async () => {
    const res = await fetch(`${BASE_URL}/api/leaderboard?type=content&limit=5`);
    expect(res.status).toBe(400);
  });

  test("GET /api/thumbnail resolves YouTube thumbnail", async () => {
    // YouTube thumbnails are resolved statically (no external API call)
    const videoUrl = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
    const res = await fetch(`${BASE_URL}/api/thumbnail?url=${encodeURIComponent(videoUrl)}`);
    expect(res.ok).toBe(true);

    const data = await res.json();
    expect(data).toHaveProperty("thumbnailUrl");
    expect(data.thumbnailUrl).toBeTruthy();
  });

  test("GET /api/thumbnail does not trust lookalike YouTube hostnames", async () => {
    const attackerUrl = "https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ";
    const res = await fetch(`${BASE_URL}/api/thumbnail?url=${encodeURIComponent(attackerUrl)}`);
    expect(res.status).toBe(400);

    const data = await res.json();
    expect(data.error).toBe("URL not allowed");
  });

  test("GET /api/thumbnail returns 400 for missing url", async () => {
    const res = await fetch(`${BASE_URL}/api/thumbnail`);
    expect(res.status).toBe(400);
  });

  test("GET /api/url-validation rejects malformed URL lists", async () => {
    const res = await fetch(`${BASE_URL}/api/url-validation?urls=notaurl,https://example.com`);
    expect(res.status).toBe(400);
  });

  test("POST /api/url-validation rejects non-array bodies", async () => {
    const res = await fetch(`${BASE_URL}/api/url-validation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ urls: "https://example.com" }),
    });
    expect([400, 429]).toContain(res.status);
  });

  test("GET /api/leaderboard includes known voter accounts", async () => {
    const res = await fetch(`${BASE_URL}/api/leaderboard?limit=100`);
    expect(res.ok).toBe(true);

    const data = await res.json();
    expect(data.entries.length).toBeGreaterThan(0);

    // At least one seeded account should appear (accounts #9, #10 voted during seed)
    const addresses = data.entries.map((u: { address: string }) => u.address.toLowerCase());
    const knownVoters = [ANVIL_ACCOUNTS.account9.address.toLowerCase(), ANVIL_ACCOUNTS.account10.address.toLowerCase()];
    const hasKnownVoter = knownVoters.some(addr => addresses.includes(addr));
    expect(hasKnownVoter).toBe(true);
  });

  test("notification preferences require a signed read session", async () => {
    const { privateKeyToAccount } = await import("viem/accounts");
    const account = privateKeyToAccount(ANVIL_ACCOUNTS.account2.privateKey as `0x${string}`);
    const otherAddress = ANVIL_ACCOUNTS.account3.address.toLowerCase();

    const unsignedSession = await getNotificationPreferencesSessionStatus(account.address.toLowerCase());
    expect(unsignedSession.hasSession).toBe(false);

    const unsignedRes = await fetch(
      `${BASE_URL}/api/notifications/preferences?address=${account.address.toLowerCase()}`,
    );
    expect(unsignedRes.status).toBe(401);

    const session = await createNotificationPreferencesReadSession(account.address.toLowerCase(), account.signMessage);
    expect(session.body).toHaveProperty("roundResolved");
    expect(session.body).toHaveProperty("settlingSoonHour");

    const authorizedRes = await fetch(
      `${BASE_URL}/api/notifications/preferences?address=${account.address.toLowerCase()}`,
      {
        headers: { cookie: session.cookie },
      },
    );
    expect(authorizedRes.status).toBe(200);

    const authorizedSession = await getNotificationPreferencesSessionStatus(
      account.address.toLowerCase(),
      session.cookie,
    );
    expect(authorizedSession.hasSession).toBe(true);

    const otherWalletSession = await getNotificationPreferencesSessionStatus(otherAddress, session.cookie);
    expect(otherWalletSession.hasSession).toBe(false);

    const otherWalletRes = await fetch(`${BASE_URL}/api/notifications/preferences?address=${otherAddress}`, {
      headers: { cookie: session.cookie },
    });
    expect(otherWalletRes.status).toBe(401);
  });

  test("notification preferences updates persist behind signed reads", async () => {
    const { privateKeyToAccount } = await import("viem/accounts");
    const account = privateKeyToAccount(ANVIL_ACCOUNTS.account2.privateKey as `0x${string}`);
    const address = account.address.toLowerCase();
    const nextPreferences = {
      roundResolved: false,
      settlingSoonHour: true,
      settlingSoonDay: false,
      followedSubmission: true,
      followedResolution: false,
    };

    const update = await updateNotificationPreferences(address, account.signMessage, nextPreferences);
    expect(update).toMatchObject({
      ok: true,
      preferences: nextPreferences,
    });

    const session = await createNotificationPreferencesReadSession(address, account.signMessage);
    expect(session.body).toMatchObject(nextPreferences);
  });

  test("email notification settings use a signed read session", async () => {
    const { privateKeyToAccount } = await import("viem/accounts");
    const account = privateKeyToAccount(ANVIL_ACCOUNTS.account2.privateKey as `0x${string}`);
    const otherAddress = ANVIL_ACCOUNTS.account3.address.toLowerCase();
    const address = account.address.toLowerCase();

    const unsignedSession = await getEmailNotificationSessionStatus(address);
    expect(unsignedSession.hasSession).toBe(false);

    const unsignedRes = await fetch(`${BASE_URL}/api/notifications/email?address=${address}`);
    expect(unsignedRes.status).toBe(401);

    const session = await createEmailNotificationReadSession(address, account.signMessage);
    expect(session.body).toHaveProperty("email");
    expect(session.body).toHaveProperty("verified");

    const authorizedRes = await fetch(`${BASE_URL}/api/notifications/email?address=${address}`, {
      headers: { cookie: session.cookie },
    });
    expect(authorizedRes.status).toBe(200);

    const authorizedSession = await getEmailNotificationSessionStatus(address, session.cookie);
    expect(authorizedSession.hasSession).toBe(true);

    const otherWalletSession = await getEmailNotificationSessionStatus(otherAddress, session.cookie);
    expect(otherWalletSession.hasSession).toBe(false);

    const otherWalletRes = await fetch(`${BASE_URL}/api/notifications/email?address=${otherAddress}`, {
      headers: { cookie: session.cookie },
    });
    expect(otherWalletRes.status).toBe(401);
  });

  test("notification preference read session does not authorize watchlist reads", async () => {
    const { privateKeyToAccount } = await import("viem/accounts");
    const account = privateKeyToAccount(ANVIL_ACCOUNTS.account2.privateKey as `0x${string}`);
    const session = await createNotificationPreferencesReadSession(account.address.toLowerCase(), account.signMessage);

    const res = await fetch(`${BASE_URL}/api/watchlist/content?address=${account.address.toLowerCase()}`, {
      headers: { cookie: session.cookie },
    });

    expect(res.status).toBe(401);
  });
});
