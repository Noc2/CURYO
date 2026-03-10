import { expect, test } from "@playwright/test";

const BASE_URL = "http://localhost:3000";

test.describe("Watchlist API routes", () => {
  async function issueChallenge(address: string, contentId: string, action: "watch" | "unwatch") {
    const res = await fetch(`${BASE_URL}/api/watchlist/content/challenge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address, contentId, action }),
    });
    expect(res.status).toBe(200);
    return res.json() as Promise<{ challengeId: string; message: string; expiresAt: string }>;
  }

  async function watchContent(
    address: string,
    contentId: string,
    account: { signMessage: (args: { message: string }) => Promise<`0x${string}`> },
  ) {
    const challenge = await issueChallenge(address, contentId, "watch");
    const signature = await account.signMessage({ message: challenge.message });

    const res = await fetch(`${BASE_URL}/api/watchlist/content`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address, contentId, signature, challengeId: challenge.challengeId }),
    });
    expect(res.status).toBe(200);
    return res.json();
  }

  async function unwatchContent(
    address: string,
    contentId: string,
    account: { signMessage: (args: { message: string }) => Promise<`0x${string}`> },
  ) {
    const challenge = await issueChallenge(address, contentId, "unwatch");
    const signature = await account.signMessage({ message: challenge.message });

    const res = await fetch(`${BASE_URL}/api/watchlist/content`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address, contentId, signature, challengeId: challenge.challengeId }),
    });
    expect(res.status).toBe(200);
    return res.json();
  }

  test("watchlist add/list/remove returns sane createdAt values in descending order", async () => {
    const { generatePrivateKey, privateKeyToAccount } = await import("viem/accounts");
    const account = privateKeyToAccount(generatePrivateKey());
    const address = account.address.toLowerCase();
    const firstContentId = "1";
    const secondContentId = "2";

    const initialRes = await fetch(`${BASE_URL}/api/watchlist/content?address=${address}`);
    expect(initialRes.status).toBe(200);
    const initial = await initialRes.json();
    expect(initial.items).toEqual([]);

    const firstWatch = await watchContent(address, firstContentId, account);
    expect(firstWatch).toMatchObject({ ok: true, watched: true, contentId: firstContentId });

    await new Promise(resolve => setTimeout(resolve, 1_100));

    const secondWatch = await watchContent(address, secondContentId, account);
    expect(secondWatch).toMatchObject({ ok: true, watched: true, contentId: secondContentId });

    const listRes = await fetch(`${BASE_URL}/api/watchlist/content?address=${address}`);
    expect(listRes.status).toBe(200);
    const list = await listRes.json();

    expect(list.count).toBe(2);
    expect(Array.isArray(list.items)).toBe(true);
    expect(list.items.map((item: { contentId: string }) => item.contentId)).toEqual([secondContentId, firstContentId]);

    const timestamps = list.items.map((item: { createdAt: string }) => new Date(item.createdAt));
    for (const timestamp of timestamps) {
      expect(Number.isFinite(timestamp.getTime())).toBe(true);
      expect(timestamp.toISOString()).toBe(timestamp.toJSON());
      expect(timestamp.getUTCFullYear()).toBeLessThan(2100);
    }
    expect(timestamps[0]!.getTime()).toBeGreaterThan(timestamps[1]!.getTime());

    const removed = await unwatchContent(address, secondContentId, account);
    expect(removed).toMatchObject({ ok: true, watched: false, contentId: secondContentId });

    const afterDeleteRes = await fetch(`${BASE_URL}/api/watchlist/content?address=${address}`);
    expect(afterDeleteRes.status).toBe(200);
    const afterDelete = await afterDeleteRes.json();
    expect(afterDelete.items.map((item: { contentId: string }) => item.contentId)).toEqual([firstContentId]);
  });
});
