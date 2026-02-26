import { ANVIL_ACCOUNTS } from "../helpers/anvil-accounts";
import { expect, test } from "@playwright/test";

const BASE_URL = "http://localhost:3000";

/**
 * Next.js API route tests.
 * Pure API tests using fetch — no browser needed.
 */
test.describe("Next.js API routes", () => {
  test("GET /api/leaderboard?type=voters returns user list", async () => {
    const res = await fetch(`${BASE_URL}/api/leaderboard?type=voters&limit=10`);
    expect(res.ok).toBe(true);

    const data = await res.json();
    expect(data).toHaveProperty("users");
    expect(data).toHaveProperty("totalCount");
    expect(data).toHaveProperty("source");
    expect(Array.isArray(data.users)).toBe(true);
    expect(data.users.length).toBeGreaterThan(0);
  });

  test("GET /api/leaderboard?type=content returns content leaderboard", async () => {
    const res = await fetch(`${BASE_URL}/api/leaderboard?type=content&limit=5`);
    expect(res.ok).toBe(true);

    const data = await res.json();
    expect(data).toHaveProperty("users");
    expect(data).toHaveProperty("source");
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

  test("GET /api/thumbnail returns 400 for missing url", async () => {
    const res = await fetch(`${BASE_URL}/api/thumbnail`);
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
    const message = `Post comment on Curyo content #${contentId}:\n${body}`;
    const signature = await account.signMessage({ message });

    const res = await fetch(`${BASE_URL}/api/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contentId, body, address: account.address, signature }),
    });
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data).toHaveProperty("comment");
    expect(data.comment.body).toBe(body);
    expect(data.comment.walletAddress).toBe(account.address.toLowerCase());
  });

  test("POST /api/comments rejects invalid signature", async () => {
    const fakeSignature =
      "0x0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000ff";

    const res = await fetch(`${BASE_URL}/api/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contentId: "1",
        body: "fake comment",
        address: ANVIL_ACCOUNTS.account2.address,
        signature: fakeSignature,
      }),
    });
    // Should be 401 (invalid signature) or 500 (signature recovery fails)
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  test("POST /api/comments rejects missing fields", async () => {
    const res = await fetch(`${BASE_URL}/api/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contentId: "1" }), // missing body, address, signature
    });
    expect(res.status).toBe(400);
  });

  test("GET /api/leaderboard?type=voters includes known voter accounts", async () => {
    const res = await fetch(`${BASE_URL}/api/leaderboard?type=voters&limit=100`);
    expect(res.ok).toBe(true);

    const data = await res.json();
    expect(data.users.length).toBeGreaterThan(0);

    // At least one seeded account should appear (accounts #9, #10 voted during seed)
    const addresses = data.users.map((u: { address: string }) => u.address.toLowerCase());
    const knownVoters = [ANVIL_ACCOUNTS.account9.address.toLowerCase(), ANVIL_ACCOUNTS.account10.address.toLowerCase()];
    const hasKnownVoter = knownVoters.some(addr => addresses.includes(addr));
    expect(hasKnownVoter).toBe(true);
  });
});
