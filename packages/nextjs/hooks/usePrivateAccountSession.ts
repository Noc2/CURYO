"use client";

type SignMessageAsync = (args: { message: string }) => Promise<`0x${string}`>;

type PrivateSessionChallengeResponse = {
  challengeId?: string;
  error?: string;
  message?: string;
};

const pendingSessions = new Map<string, Promise<void>>();

async function readJson<T>(response: Response, fallbackError: string): Promise<T> {
  const body = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!response.ok) {
    throw new Error(body?.error || fallbackError);
  }

  return body as T;
}

export async function ensurePrivateAccountReadSession(address: string, signMessageAsync: SignMessageAsync) {
  const normalizedAddress = address.toLowerCase();
  const status = await readJson<{ hasSession?: boolean }>(
    await fetch(`/api/account/private-session?address=${encodeURIComponent(address)}`),
    "Failed to check account session",
  );

  if (status.hasSession) {
    return;
  }

  const pending = pendingSessions.get(normalizedAddress);
  if (pending) {
    return pending;
  }

  const nextPending = (async () => {
    const challenge = await readJson<PrivateSessionChallengeResponse>(
      await fetch("/api/account/private-session/challenge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address }),
      }),
      "Failed to create account session challenge",
    );

    if (!challenge.message || !challenge.challengeId) {
      throw new Error(challenge.error || "Failed to create account session challenge");
    }

    const signature = await signMessageAsync({ message: challenge.message });
    await readJson<{ ok?: boolean; hasSession?: boolean }>(
      await fetch("/api/account/private-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, challengeId: challenge.challengeId, signature }),
      }),
      "Failed to create account session",
    );
  })().finally(() => {
    pendingSessions.delete(normalizedAddress);
  });

  pendingSessions.set(normalizedAddress, nextPending);
  return nextPending;
}
