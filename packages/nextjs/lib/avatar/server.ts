import "server-only";
import { isAddress } from "viem";
import type { ReputationAvatarPayload } from "~~/lib/avatar/avatarPayload";
import { readCRepBalances } from "~~/lib/profileRegistry/server";

type ReputationAvatarApiResponse = Omit<ReputationAvatarPayload, "balance">;

const isProduction = process.env.NODE_ENV === "production";
const AVATAR_REVALIDATE_SECONDS = 300;

function readEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function isLocalhostHostname(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function getPonderUrl(): string | null {
  const rawValue = readEnv("NEXT_PUBLIC_PONDER_URL") ?? (!isProduction ? "http://localhost:42069" : undefined);

  if (!rawValue) {
    return null;
  }

  let url: URL;
  try {
    url = new URL(rawValue);
  } catch {
    return null;
  }

  if (isProduction && isLocalhostHostname(url.hostname)) {
    return null;
  }

  return url.toString().replace(/\/$/, "");
}

export function createEmptyReputationAvatarPayload(address: string): ReputationAvatarPayload {
  const normalizedAddress = isAddress(address) ? (address.toLowerCase() as `0x${string}`) : address;

  return {
    address: normalizedAddress,
    balance: "0",
    voterId: null,
    stats: null,
    streak: {
      currentDailyStreak: 0,
      bestDailyStreak: 0,
      totalActiveDays: 0,
      lastActiveDate: null,
      lastMilestoneDay: 0,
    },
    categories90d: [],
  };
}

export async function getReputationAvatarPayload(address: string): Promise<ReputationAvatarPayload> {
  if (!isAddress(address)) {
    return createEmptyReputationAvatarPayload(address);
  }

  const normalizedAddress = address.toLowerCase() as `0x${string}`;
  const fallbackPayload = createEmptyReputationAvatarPayload(normalizedAddress);
  const ponderUrl = getPonderUrl();

  const [apiPayload, balances] = await Promise.all([
    ponderUrl
      ? fetch(`${ponderUrl}/avatar/${normalizedAddress}`, {
          next: { revalidate: AVATAR_REVALIDATE_SECONDS },
        })
          .then(async response => {
            if (!response.ok) {
              return null;
            }
            return (await response.json()) as ReputationAvatarApiResponse;
          })
          .catch(() => null)
      : Promise.resolve<ReputationAvatarApiResponse | null>(null),
    readCRepBalances([normalizedAddress]).catch(() => ({ [normalizedAddress]: 0n }) as Record<string, bigint>),
  ]);

  return {
    ...fallbackPayload,
    ...(apiPayload ?? {}),
    address: normalizedAddress,
    balance: (balances[normalizedAddress] ?? 0n).toString(),
    categories90d: apiPayload?.categories90d ?? [],
    stats: apiPayload?.stats ?? null,
    streak: apiPayload?.streak ?? fallbackPayload.streak,
    voterId: apiPayload?.voterId ?? null,
  };
}
