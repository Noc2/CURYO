import { expect, test } from "@playwright/test";

const BASE_URL = "http://localhost:3000";

test.describe("Watchlist API routes", () => {
  async function getReadSessionStatus(address: string, cookie?: string) {
    const res = await fetch(`${BASE_URL}/api/watchlist/content/session?address=${address}`, {
      headers: cookie ? { cookie } : undefined,
    });
    expect(res.status).toBe(200);
    return res.json() as Promise<{ hasSession: boolean; hasReadSession: boolean; hasWriteSession: boolean }>;
  }

  async function issueReadChallenge(address: string) {
    const res = await fetch(`${BASE_URL}/api/watchlist/content/challenge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address, intent: "read" }),
    });
    expect(res.status).toBe(200);
    return res.json() as Promise<{ challengeId: string; message: string; expiresAt: string }>;
  }

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
    cookie?: string,
  ) {
    const res = await fetch(`${BASE_URL}/api/watchlist/content`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...(cookie ? { cookie } : {}),
      },
      body: cookie
        ? JSON.stringify({ address, contentId })
        : await (async () => {
            const challenge = await issueChallenge(address, contentId, "watch");
            const signature = await account.signMessage({ message: challenge.message });
            return JSON.stringify({ address, contentId, signature, challengeId: challenge.challengeId });
          })(),
    });
    expect(res.status).toBe(200);
    return {
      body: await res.json(),
      cookie: res.headers.get("set-cookie")?.split(";")[0],
    };
  }

  async function createReadSession(
    address: string,
    account: { signMessage: (args: { message: string }) => Promise<`0x${string}`> },
  ) {
    const challenge = await issueReadChallenge(address);
    const signature = await account.signMessage({ message: challenge.message });

    const res = await fetch(`${BASE_URL}/api/watchlist/content`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address, signature, challengeId: challenge.challengeId }),
    });
    expect(res.status).toBe(200);

    const cookie = res.headers.get("set-cookie");
    expect(cookie).toContain("curyo_watchlist_read_session=");

    return {
      cookie: cookie!.split(";")[0],
      body: await res.json(),
    };
  }

  async function unwatchContent(
    address: string,
    contentId: string,
    account: { signMessage: (args: { message: string }) => Promise<`0x${string}`> },
    cookie?: string,
  ) {
    const res = await fetch(`${BASE_URL}/api/watchlist/content`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        ...(cookie ? { cookie } : {}),
      },
      body: cookie
        ? JSON.stringify({ address, contentId })
        : await (async () => {
            const challenge = await issueChallenge(address, contentId, "unwatch");
            const signature = await account.signMessage({ message: challenge.message });
            return JSON.stringify({ address, contentId, signature, challengeId: challenge.challengeId });
          })(),
    });
    expect(res.status).toBe(200);
    return {
      body: await res.json(),
      cookie: res.headers.get("set-cookie")?.split(";")[0],
    };
  }

  test("watchlist add/list/remove returns sane createdAt values in descending order", async () => {
    const { generatePrivateKey, privateKeyToAccount } = await import("viem/accounts");
    const account = privateKeyToAccount(generatePrivateKey());
    const address = account.address.toLowerCase();
    const firstContentId = "1";
    const secondContentId = "2";

    const unsignedSession = await getReadSessionStatus(address);
    expect(unsignedSession.hasSession).toBe(false);
    expect(unsignedSession.hasReadSession).toBe(false);
    expect(unsignedSession.hasWriteSession).toBe(false);

    const unauthenticatedRes = await fetch(`${BASE_URL}/api/watchlist/content?address=${address}`);
    expect(unauthenticatedRes.status).toBe(401);

    const initial = await createReadSession(address, account);
    expect(initial.body.items).toEqual([]);

    const authorizedSession = await getReadSessionStatus(address, initial.cookie);
    expect(authorizedSession.hasSession).toBe(true);
    expect(authorizedSession.hasReadSession).toBe(true);
    expect(authorizedSession.hasWriteSession).toBe(false);

    const firstWatch = await watchContent(address, firstContentId, account);
    expect(firstWatch.body).toMatchObject({ ok: true, watched: true, contentId: firstContentId });
    expect(firstWatch.cookie).toContain("curyo_watchlist_write_session=");

    await new Promise(resolve => setTimeout(resolve, 1_100));

    const combinedCookie = `${initial.cookie}; ${firstWatch.cookie}`;
    const writeSessionStatus = await getReadSessionStatus(address, combinedCookie);
    expect(writeSessionStatus.hasWriteSession).toBe(true);

    const secondWatch = await watchContent(address, secondContentId, account, combinedCookie);
    expect(secondWatch.body).toMatchObject({ ok: true, watched: true, contentId: secondContentId });

    const listRes = await fetch(`${BASE_URL}/api/watchlist/content?address=${address}`, {
      headers: { cookie: combinedCookie },
    });
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

    const removed = await unwatchContent(address, secondContentId, account, combinedCookie);
    expect(removed.body).toMatchObject({ ok: true, watched: false, contentId: secondContentId });

    const afterDeleteRes = await fetch(`${BASE_URL}/api/watchlist/content?address=${address}`, {
      headers: { cookie: combinedCookie },
    });
    expect(afterDeleteRes.status).toBe(200);
    const afterDelete = await afterDeleteRes.json();
    expect(afterDelete.items.map((item: { contentId: string }) => item.contentId)).toEqual([firstContentId]);
  });

  test("watchlist challenges are action-bound and one-time use", async () => {
    const { generatePrivateKey, privateKeyToAccount } = await import("viem/accounts");
    const account = privateKeyToAccount(generatePrivateKey());
    const address = account.address.toLowerCase();
    const contentId = "3";

    const challenge = await issueChallenge(address, contentId, "watch");
    const signature = await account.signMessage({ message: challenge.message });

    const watchRes = await fetch(`${BASE_URL}/api/watchlist/content`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address, contentId, signature, challengeId: challenge.challengeId }),
    });
    expect(watchRes.status).toBe(200);

    const replayRes = await fetch(`${BASE_URL}/api/watchlist/content`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address, contentId, signature, challengeId: challenge.challengeId }),
    });
    expect(replayRes.status).toBe(409);

    const mismatchChallenge = await issueChallenge(address, contentId, "watch");
    const mismatchSignature = await account.signMessage({ message: mismatchChallenge.message });

    const mismatchRes = await fetch(`${BASE_URL}/api/watchlist/content`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        address,
        contentId,
        signature: mismatchSignature,
        challengeId: mismatchChallenge.challengeId,
      }),
    });
    expect(mismatchRes.status).toBe(401);
  });

  test("watchlist write session is address-bound and avoids repeat signatures", async () => {
    const { generatePrivateKey, privateKeyToAccount } = await import("viem/accounts");
    const account = privateKeyToAccount(generatePrivateKey());
    const otherAccount = privateKeyToAccount(generatePrivateKey());
    const address = account.address.toLowerCase();
    const otherAddress = otherAccount.address.toLowerCase();

    const signedWatch = await watchContent(address, "31", account);
    expect(signedWatch.cookie).toContain("curyo_watchlist_write_session=");

    const cookie = signedWatch.cookie!;

    const authorizedRes = await fetch(`${BASE_URL}/api/watchlist/content`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        cookie,
      },
      body: JSON.stringify({ address, contentId: "32" }),
    });
    expect(authorizedRes.status).toBe(200);

    const unauthorizedRes = await fetch(`${BASE_URL}/api/watchlist/content`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        cookie,
      },
      body: JSON.stringify({ address: otherAddress, contentId: "33" }),
    });
    expect(unauthorizedRes.status).toBe(401);
  });

  test("watchlist read session is address-bound", async () => {
    const { generatePrivateKey, privateKeyToAccount } = await import("viem/accounts");
    const account = privateKeyToAccount(generatePrivateKey());
    const otherAccount = privateKeyToAccount(generatePrivateKey());
    const session = await createReadSession(account.address.toLowerCase(), account);

    const authorizedRes = await fetch(`${BASE_URL}/api/watchlist/content?address=${account.address.toLowerCase()}`, {
      headers: { cookie: session.cookie },
    });
    expect(authorizedRes.status).toBe(200);

    const authorizedSession = await getReadSessionStatus(account.address.toLowerCase(), session.cookie);
    expect(authorizedSession.hasSession).toBe(true);

    const otherSession = await getReadSessionStatus(otherAccount.address.toLowerCase(), session.cookie);
    expect(otherSession.hasSession).toBe(false);

    const unauthorizedRes = await fetch(
      `${BASE_URL}/api/watchlist/content?address=${otherAccount.address.toLowerCase()}`,
      {
        headers: { cookie: session.cookie },
      },
    );
    expect(unauthorizedRes.status).toBe(401);
  });

  test("watchlist read session does not authorize notification preference reads", async () => {
    const { generatePrivateKey, privateKeyToAccount } = await import("viem/accounts");
    const account = privateKeyToAccount(generatePrivateKey());
    const session = await createReadSession(account.address.toLowerCase(), account);

    const res = await fetch(`${BASE_URL}/api/notifications/preferences?address=${account.address.toLowerCase()}`, {
      headers: { cookie: session.cookie },
    });

    expect(res.status).toBe(401);
  });
});
