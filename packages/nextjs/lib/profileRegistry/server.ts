import deployedContracts from "@curyo/contracts/deployedContracts";
import { type Abi, type Address, createPublicClient, http, isAddress } from "viem";
import { avatarAccentRgbToHex } from "~~/lib/avatar/avatarAccent";
import { getPrimaryServerTargetNetwork, getServerRpcOverrides, getServerTargetNetworkById } from "~~/lib/env/server";

interface ProfileRegistryProfile {
  username: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

interface ProfileRegistryAvatarAccent {
  enabled: boolean;
  rgb: number | null;
  hex: string | null;
}

type DeployedContractsMap = Record<
  number,
  Record<
    string,
    {
      address: Address;
      abi: Abi;
    }
  >
>;

const EMPTY_PROFILE: ProfileRegistryProfile = {
  username: null,
  createdAt: null,
  updatedAt: null,
};
const EMPTY_AVATAR_ACCENT: ProfileRegistryAvatarAccent = {
  enabled: false,
  rgb: null,
  hex: null,
};
const MULTICALL_BATCH_SIZE = 200;

type ProfileRegistryReadContext = {
  crepToken?: {
    abi: Abi;
    address: Address;
  };
  profileRegistry?: {
    abi: Abi;
    address: Address;
  };
  publicClient: {
    multicall: (...args: any[]) => Promise<any>;
    readContract: (...args: any[]) => Promise<any>;
  };
};

function normalizeAddress(address: string): `0x${string}` {
  return address.toLowerCase() as `0x${string}`;
}

function resolveProfileRegistryReadContext(chainId?: number): ProfileRegistryReadContext | null {
  const targetNetwork =
    typeof chainId === "number" ? getServerTargetNetworkById(chainId) : getPrimaryServerTargetNetwork();
  if (!targetNetwork) {
    return null;
  }

  const contractsForChain = (deployedContracts as unknown as Partial<DeployedContractsMap>)[targetNetwork.id];
  const rpcOverrides = getServerRpcOverrides();
  const rpcUrl = rpcOverrides?.[targetNetwork.id] ?? targetNetwork.rpcUrls.default.http[0];
  if (!rpcUrl) {
    return null;
  }

  return {
    crepToken: contractsForChain?.CuryoReputation,
    profileRegistry: contractsForChain?.ProfileRegistry,
    publicClient: createPublicClient({
      chain: targetNetwork,
      transport: http(rpcUrl),
    }),
  };
}

function chunkAddresses(addresses: readonly `0x${string}`[], size = MULTICALL_BATCH_SIZE): `0x${string}`[][] {
  const chunks: `0x${string}`[][] = [];

  for (let index = 0; index < addresses.length; index += size) {
    chunks.push(addresses.slice(index, index + size));
  }

  return chunks;
}

function normalizeUniqueAddresses(addresses: string[]): `0x${string}`[] {
  const seen = new Set<string>();
  return addresses
    .filter((address): address is `0x${string}` => isAddress(address))
    .map(normalizeAddress)
    .filter(address => {
      if (seen.has(address)) return false;
      seen.add(address);
      return true;
    });
}

function parseProfile(result: unknown): ProfileRegistryProfile {
  const profile = result as {
    name?: unknown;
    createdAt?: unknown;
    updatedAt?: unknown;
  };

  const createdAt = typeof profile.createdAt === "bigint" ? profile.createdAt : 0n;
  if (createdAt === 0n) {
    return EMPTY_PROFILE;
  }

  const updatedAt = typeof profile.updatedAt === "bigint" ? profile.updatedAt : createdAt;

  return {
    username: typeof profile.name === "string" && profile.name.length > 0 ? profile.name : null,
    createdAt: createdAt.toString(),
    updatedAt: updatedAt.toString(),
  };
}

function parseAvatarAccent(result: unknown): ProfileRegistryAvatarAccent {
  if (Array.isArray(result)) {
    const enabled = result[0] === true;
    const rgbValue = typeof result[1] === "bigint" ? Number(result[1]) : 0;
    return {
      enabled,
      rgb: enabled ? rgbValue : null,
      hex: enabled ? avatarAccentRgbToHex(rgbValue) : null,
    };
  }

  const accent = result as {
    enabled?: unknown;
    rgb?: unknown;
  };
  const enabled = accent.enabled === true;
  const rgbValue = typeof accent.rgb === "bigint" ? Number(accent.rgb) : 0;

  return {
    enabled,
    rgb: enabled ? rgbValue : null,
    hex: enabled ? avatarAccentRgbToHex(rgbValue) : null,
  };
}

export async function readProfileRegistryProfiles(
  addresses: string[],
  options: { chainId?: number } = {},
): Promise<Record<string, ProfileRegistryProfile>> {
  const normalizedAddresses = normalizeUniqueAddresses(addresses);
  const profiles: Record<string, ProfileRegistryProfile> = {};

  for (const address of normalizedAddresses) {
    profiles[address] = EMPTY_PROFILE;
  }

  const context = resolveProfileRegistryReadContext(options.chainId);
  if (!context?.profileRegistry || normalizedAddresses.length === 0) {
    return profiles;
  }

  for (const batch of chunkAddresses(normalizedAddresses)) {
    try {
      const results = await context.publicClient.multicall({
        allowFailure: true,
        contracts: batch.map(address => ({
          address: context.profileRegistry!.address,
          abi: context.profileRegistry!.abi,
          functionName: "getProfile",
          args: [address],
        })),
      });

      results.forEach((result: { status: string; result?: unknown }, index: number) => {
        const address = batch[index];
        profiles[address] = result.status === "success" ? parseProfile(result.result) : EMPTY_PROFILE;
      });
    } catch {
      // Fallback to individual calls when multicall3 is unavailable (e.g. local Anvil)
      await Promise.all(
        batch.map(async address => {
          try {
            const result = await context.publicClient.readContract({
              address: context.profileRegistry!.address,
              abi: context.profileRegistry!.abi,
              functionName: "getProfile",
              args: [address],
            });
            profiles[address] = parseProfile(result);
          } catch {
            profiles[address] = EMPTY_PROFILE;
          }
        }),
      );
    }
  }

  return profiles;
}

export async function readProfileRegistryAvatarAccent(
  address: string,
  options: { chainId?: number } = {},
): Promise<ProfileRegistryAvatarAccent> {
  const context = resolveProfileRegistryReadContext(options.chainId);
  if (!isAddress(address) || !context?.profileRegistry) {
    return EMPTY_AVATAR_ACCENT;
  }

  try {
    const result = await context.publicClient.readContract({
      address: context.profileRegistry.address,
      abi: context.profileRegistry.abi,
      functionName: "getAvatarAccent",
      args: [normalizeAddress(address)],
    });
    return parseAvatarAccent(result);
  } catch {
    return EMPTY_AVATAR_ACCENT;
  }
}

export async function readCRepBalances(
  addresses: string[],
  options: { chainId?: number } = {},
): Promise<Record<string, bigint>> {
  const normalizedAddresses = normalizeUniqueAddresses(addresses);
  const balances: Record<string, bigint> = {};

  for (const address of normalizedAddresses) {
    balances[address] = 0n;
  }

  const context = resolveProfileRegistryReadContext(options.chainId);
  if (!context?.crepToken || normalizedAddresses.length === 0) {
    return balances;
  }

  for (const batch of chunkAddresses(normalizedAddresses)) {
    try {
      const results = await context.publicClient.multicall({
        allowFailure: true,
        contracts: batch.map(address => ({
          address: context.crepToken!.address,
          abi: context.crepToken!.abi,
          functionName: "balanceOf",
          args: [address],
        })),
      });

      results.forEach((result: { status: string; result?: unknown }, index: number) => {
        const address = batch[index];
        balances[address] = result.status === "success" && typeof result.result === "bigint" ? result.result : 0n;
      });
    } catch {
      await Promise.all(
        batch.map(async address => {
          try {
            const result = await context.publicClient.readContract({
              address: context.crepToken!.address,
              abi: context.crepToken!.abi,
              functionName: "balanceOf",
              args: [address],
            });
            balances[address] = typeof result === "bigint" ? result : 0n;
          } catch {
            balances[address] = 0n;
          }
        }),
      );
    }
  }

  return balances;
}
