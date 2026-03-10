import { ANVIL_ACCOUNTS } from "../helpers/anvil-accounts";
import { expect, test } from "@playwright/test";

const BASE_URL = "http://localhost:3000";

/**
 * Next.js API route tests.
 * Pure API tests using fetch — no browser needed.
 */
test.describe("Next.js API routes", () => {
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

  test("GET /api/username returns profile for known address", async () => {
    const address = ANVIL_ACCOUNTS.account2.address;
    const res = await fetch(`${BASE_URL}/api/username?address=${address}`);
    expect(res.ok).toBe(true);

    const data = await res.json();
    expect(data).toHaveProperty("address");
    expect(data).toHaveProperty("username");
    expect(data.address).toBe(address.toLowerCase());
  });

  test("GET /api/comments returns empty list for content without comments", async () => {
    const res = await fetch(`${BASE_URL}/api/comments?contentId=1`);
    expect(res.ok).toBe(true);

    const data = await res.json();
    expect(data).toHaveProperty("comments");
    expect(data).toHaveProperty("count");
    expect(data).toHaveProperty("totalCount");
    expect(Array.isArray(data.comments)).toBe(true);
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
    expect(res.ok).toBe(true);

    const data = await res.json();
    expect(data.thumbnailUrl).toBeNull();
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
    expect(res.status).toBe(400);
  });

  test("GET /api/comments returns 400 for missing contentId", async () => {
    const res = await fetch(`${BASE_URL}/api/comments`);
    expect(res.status).toBe(400);
  });

  test("POST /api/comments creates comment with valid signature", async () => {
    const { privateKeyToAccount } = await import("viem/accounts");
    const account = privateKeyToAccount(ANVIL_ACCOUNTS.account2.privateKey as `0x${string}`);

    const contentId = "1";
    const body = `E2E test comment ${Date.now()}`;
    const challengeRes = await fetch(`${BASE_URL}/api/comments/challenge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contentId, body, address: account.address }),
    });
    expect(challengeRes.status).toBe(200);

    const challenge = await challengeRes.json();
    expect(challenge).toHaveProperty("challengeId");
    expect(challenge).toHaveProperty("message");
    const signature = await account.signMessage({ message: challenge.message });

    // Small delay to ensure SQLite WAL flushes the challenge insert
    await new Promise(r => setTimeout(r, 200));

    const res = await fetch(`${BASE_URL}/api/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contentId, body, address: account.address, signature, challengeId: challenge.challengeId }),
    });

    if (res.status !== 200) {
      const errBody = await res.json().catch(() => ({}));
      console.log(`    ⚠ Comment POST failed: ${res.status} ${JSON.stringify(errBody)}`);
    }
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data).toHaveProperty("comment");
    expect(data.comment.body).toBe(body);
    expect(data.comment.walletAddress).toBe(account.address.toLowerCase());
  });

  test("POST /api/comments requires a one-time challenge and rejects replay", async () => {
    const { privateKeyToAccount } = await import("viem/accounts");
    const account = privateKeyToAccount(ANVIL_ACCOUNTS.account2.privateKey as `0x${string}`);
    const contentId = "1";
    const body = `Replay test comment ${Date.now()}`;

    const challengeRes = await fetch(`${BASE_URL}/api/comments/challenge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contentId, body, address: account.address }),
    });
    expect(challengeRes.status).toBe(200);

    const challenge = await challengeRes.json();
    expect(challenge).toHaveProperty("challengeId");
    const signature = await account.signMessage({ message: challenge.message });

    // Small delay to ensure SQLite WAL flushes the challenge insert
    await new Promise(r => setTimeout(r, 200));

    const firstRes = await fetch(`${BASE_URL}/api/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contentId, body, address: account.address, signature, challengeId: challenge.challengeId }),
    });

    if (firstRes.status !== 200) {
      const errBody = await firstRes.json().catch(() => ({}));
      console.log(`    ⚠ First comment POST failed: ${firstRes.status} ${JSON.stringify(errBody)}`);
    }
    expect(firstRes.status).toBe(200);

    const replayRes = await fetch(`${BASE_URL}/api/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contentId, body, address: account.address, signature, challengeId: challenge.challengeId }),
    });
    expect(replayRes.status).toBe(409);
  });

  test("POST /api/comments rejects invalid signature", async () => {
    const contentId = "1";
    const body = "fake comment";
    const challengeRes = await fetch(`${BASE_URL}/api/comments/challenge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contentId,
        body,
        address: ANVIL_ACCOUNTS.account2.address,
      }),
    });
    expect(challengeRes.status).toBe(200);

    const challenge = await challengeRes.json();
    const fakeSignature =
      "0x0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000ff";

    const res = await fetch(`${BASE_URL}/api/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contentId,
        body,
        address: ANVIL_ACCOUNTS.account2.address,
        signature: fakeSignature,
        challengeId: challenge.challengeId,
      }),
    });
    expect(res.status).toBe(401);
  });

  test("POST /api/comments rejects missing fields", async () => {
    const res = await fetch(`${BASE_URL}/api/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contentId: "1" }), // missing body, address, signature
    });
    expect(res.status).toBe(400);
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
});
