import "server-only";
import { isAddress } from "viem";
import type { ReputationAvatarPayload } from "~~/lib/avatar/avatarPayload";
import { getOptionalPonderUrl } from "~~/lib/env/server";
import { readCRepBalances, readProfileRegistryAvatarAccent } from "~~/lib/profileRegistry/server";

type ReputationAvatarApiResponse = Omit<ReputationAvatarPayload, "balance" | "avatarAccentHex"> & {
  avatarAccentHex?: string | null;
};

const AVATAR_REVALIDATE_SECONDS = 300;

export function createEmptyReputationAvatarPayload(address: string): ReputationAvatarPayload {
  const normalizedAddress = isAddress(address) ? (address.toLowerCase() as `0x${string}`) : address;

  return {
    address: normalizedAddress,
    balance: "0",
    avatarAccentHex: null,
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
  const ponderUrl = getOptionalPonderUrl();

  const [apiPayload, balances, avatarAccent] = await Promise.all([
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
    readProfileRegistryAvatarAccent(normalizedAddress).catch(() => ({ enabled: false, rgb: null, hex: null })),
  ]);

  return {
    ...fallbackPayload,
    ...(apiPayload ?? {}),
    address: normalizedAddress,
    balance: (balances[normalizedAddress] ?? 0n).toString(),
    avatarAccentHex: avatarAccent.hex,
    categories90d: apiPayload?.categories90d ?? [],
    stats: apiPayload?.stats ?? null,
    streak: apiPayload?.streak ?? fallbackPayload.streak,
    voterId: apiPayload?.voterId ?? null,
  };
}
