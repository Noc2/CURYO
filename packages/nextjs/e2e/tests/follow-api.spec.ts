import "../helpers/fetch-shim";
import { E2E_BASE_URL } from "../helpers/service-urls";
import { expect, test } from "@playwright/test";

const BASE_URL = E2E_BASE_URL;

test.describe("Profile follow API routes", () => {
  async function getFollowSessionStatus(address: string, cookie?: string) {
    const res = await fetch(`${BASE_URL}/api/follows/profiles/session?address=${address}`, {
      headers: cookie ? { cookie } : undefined,
    });
    expect(res.status).toBe(200);
    return res.json() as Promise<{ hasSession: boolean; hasReadSession: boolean; hasWriteSession: boolean }>;
  }

  async function issueReadChallenge(address: string) {
    const res = await fetch(`${BASE_URL}/api/follows/profiles/challenge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address, intent: "read" }),
    });
    expect(res.status).toBe(200);
    return res.json() as Promise<{ challengeId: string; message: string; expiresAt: string }>;
  }

  async function issueWriteChallenge(address: string, targetAddress: string, action: "follow" | "unfollow") {
    const res = await fetch(`${BASE_URL}/api/follows/profiles/challenge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address, targetAddress, action }),
    });
    expect(res.status).toBe(200);
    return res.json() as Promise<{ challengeId: string; message: string; expiresAt: string }>;
  }

  async function createReadSession(
    address: string,
    account: { signMessage: (args: { message: string }) => Promise<`0x${string}`> },
  ) {
    const challenge = await issueReadChallenge(address);
    const signature = await account.signMessage({ message: challenge.message });

    const res = await fetch(`${BASE_URL}/api/follows/profiles`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address, signature, challengeId: challenge.challengeId }),
    });
    expect(res.status).toBe(200);

    const cookie = res.headers.get("set-cookie");
    expect(cookie).toContain("curyo_profile_follows_read_session=");

    return {
      cookie: cookie!.split(";")[0],
      body: await res.json(),
    };
  }

  async function followProfile(
    address: string,
    targetAddress: string,
    account: { signMessage: (args: { message: string }) => Promise<`0x${string}`> },
    cookie?: string,
  ) {
    const res = await fetch(`${BASE_URL}/api/follows/profiles`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...(cookie ? { cookie } : {}),
      },
      body: cookie
        ? JSON.stringify({ address, targetAddress })
        : await (async () => {
            const challenge = await issueWriteChallenge(address, targetAddress, "follow");
            const signature = await account.signMessage({ message: challenge.message });
            return JSON.stringify({ address, targetAddress, signature, challengeId: challenge.challengeId });
          })(),
    });
    expect(res.status).toBe(200);
    return {
      body: await res.json(),
      cookie: res.headers.get("set-cookie")?.split(";")[0],
    };
  }

  async function unfollowProfile(
    address: string,
    targetAddress: string,
    account: { signMessage: (args: { message: string }) => Promise<`0x${string}`> },
    cookie?: string,
  ) {
    const res = await fetch(`${BASE_URL}/api/follows/profiles`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        ...(cookie ? { cookie } : {}),
      },
      body: cookie
        ? JSON.stringify({ address, targetAddress })
        : await (async () => {
            const challenge = await issueWriteChallenge(address, targetAddress, "unfollow");
            const signature = await account.signMessage({ message: challenge.message });
            return JSON.stringify({ address, targetAddress, signature, challengeId: challenge.challengeId });
          })(),
    });
    expect(res.status).toBe(200);
    return {
      body: await res.json(),
      cookie: res.headers.get("set-cookie")?.split(";")[0],
    };
  }

  test("follow add/list/remove uses signed sessions and returns descending order", async () => {
    const { generatePrivateKey, privateKeyToAccount } = await import("viem/accounts");
    const account = privateKeyToAccount(generatePrivateKey());
    const address = account.address.toLowerCase();
    const firstTarget = privateKeyToAccount(generatePrivateKey()).address.toLowerCase();
    const secondTarget = privateKeyToAccount(generatePrivateKey()).address.toLowerCase();

    const unsignedSession = await getFollowSessionStatus(address);
    expect(unsignedSession.hasReadSession).toBe(false);
    expect(unsignedSession.hasWriteSession).toBe(false);

    const unauthenticatedRes = await fetch(`${BASE_URL}/api/follows/profiles?address=${address}`);
    expect(unauthenticatedRes.status).toBe(401);

    const initial = await createReadSession(address, account);
    expect(initial.body.items).toEqual([]);

    const firstFollow = await followProfile(address, firstTarget, account);
    expect(firstFollow.body).toMatchObject({ ok: true, following: true, targetAddress: firstTarget });
    expect(firstFollow.cookie).toContain("curyo_profile_follows_write_session=");

    await new Promise(resolve => setTimeout(resolve, 1_100));

    const combinedCookie = `${initial.cookie}; ${firstFollow.cookie}`;
    const writeSessionStatus = await getFollowSessionStatus(address, combinedCookie);
    expect(writeSessionStatus.hasReadSession).toBe(true);
    expect(writeSessionStatus.hasWriteSession).toBe(true);

    const secondFollow = await followProfile(address, secondTarget, account, combinedCookie);
    expect(secondFollow.body).toMatchObject({ ok: true, following: true, targetAddress: secondTarget });

    const listRes = await fetch(`${BASE_URL}/api/follows/profiles?address=${address}`, {
      headers: { cookie: combinedCookie },
    });
    expect(listRes.status).toBe(200);
    const list = await listRes.json();

    expect(list.count).toBe(2);
    expect(list.items.map((item: { walletAddress: string }) => item.walletAddress)).toEqual([
      secondTarget,
      firstTarget,
    ]);

    const removed = await unfollowProfile(address, secondTarget, account, combinedCookie);
    expect(removed.body).toMatchObject({ ok: true, following: false, targetAddress: secondTarget });

    const afterDeleteRes = await fetch(`${BASE_URL}/api/follows/profiles?address=${address}`, {
      headers: { cookie: combinedCookie },
    });
    expect(afterDeleteRes.status).toBe(200);
    const afterDelete = await afterDeleteRes.json();
    expect(afterDelete.items.map((item: { walletAddress: string }) => item.walletAddress)).toEqual([firstTarget]);
  });

  test("follow write session is address-bound", async () => {
    const { generatePrivateKey, privateKeyToAccount } = await import("viem/accounts");
    const account = privateKeyToAccount(generatePrivateKey());
    const otherAccount = privateKeyToAccount(generatePrivateKey());
    const address = account.address.toLowerCase();
    const otherAddress = otherAccount.address.toLowerCase();
    const target = privateKeyToAccount(generatePrivateKey()).address.toLowerCase();

    const firstFollow = await followProfile(address, target, account);
    expect(firstFollow.cookie).toContain("curyo_profile_follows_write_session=");

    const cookie = firstFollow.cookie!;

    const authorizedRes = await fetch(`${BASE_URL}/api/follows/profiles`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        cookie,
      },
      body: JSON.stringify({
        address,
        targetAddress: privateKeyToAccount(generatePrivateKey()).address.toLowerCase(),
      }),
    });
    expect(authorizedRes.status).toBe(200);

    const unauthorizedRes = await fetch(`${BASE_URL}/api/follows/profiles`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        cookie,
      },
      body: JSON.stringify({
        address: otherAddress,
        targetAddress: privateKeyToAccount(generatePrivateKey()).address.toLowerCase(),
      }),
    });
    expect(unauthorizedRes.status).toBe(401);
  });

  test("follow challenges are action-bound and reject replay", async () => {
    const { generatePrivateKey, privateKeyToAccount } = await import("viem/accounts");
    const account = privateKeyToAccount(generatePrivateKey());
    const address = account.address.toLowerCase();
    const target = privateKeyToAccount(generatePrivateKey()).address.toLowerCase();

    const challenge = await issueWriteChallenge(address, target, "follow");
    const signature = await account.signMessage({ message: challenge.message });

    const followRes = await fetch(`${BASE_URL}/api/follows/profiles`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address, targetAddress: target, signature, challengeId: challenge.challengeId }),
    });
    expect(followRes.status).toBe(200);

    const replayRes = await fetch(`${BASE_URL}/api/follows/profiles`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address, targetAddress: target, signature, challengeId: challenge.challengeId }),
    });
    expect(replayRes.status).toBe(409);

    const mismatchChallenge = await issueWriteChallenge(address, target, "follow");
    const mismatchSignature = await account.signMessage({ message: mismatchChallenge.message });

    const mismatchRes = await fetch(`${BASE_URL}/api/follows/profiles`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        address,
        targetAddress: target,
        signature: mismatchSignature,
        challengeId: mismatchChallenge.challengeId,
      }),
    });
    expect(mismatchRes.status).toBe(401);
  });
});
