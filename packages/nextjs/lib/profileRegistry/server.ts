import deployedContracts from "@curyo/contracts/deployedContracts";
import { type Abi, type Address, createPublicClient, http, isAddress } from "viem";
import scaffoldConfig from "~~/scaffold.config";

export interface ProfileRegistryProfile {
  username: string | null;
  profileImageUrl: string | null;
  createdAt: string | null;
  updatedAt: string | null;
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
  profileImageUrl: null,
  createdAt: null,
  updatedAt: null,
};

const targetNetwork = scaffoldConfig.targetNetworks[0];
const contractsForChain = (deployedContracts as unknown as Partial<DeployedContractsMap>)[targetNetwork.id];
const profileRegistry = contractsForChain?.ProfileRegistry;
const crepToken = contractsForChain?.CuryoReputation;
const rpcOverrides = scaffoldConfig.rpcOverrides as Partial<Record<number, string>> | undefined;
const rpcUrl = rpcOverrides?.[targetNetwork.id] ?? targetNetwork.rpcUrls.default.http[0];

const publicClient = profileRegistry
  ? createPublicClient({
      chain: targetNetwork,
      transport: http(rpcUrl),
    })
  : null;

function normalizeAddress(address: string): `0x${string}` {
  return address.toLowerCase() as `0x${string}`;
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
    imageUrl?: unknown;
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
    profileImageUrl: typeof profile.imageUrl === "string" && profile.imageUrl.length > 0 ? profile.imageUrl : null,
    createdAt: createdAt.toString(),
    updatedAt: updatedAt.toString(),
  };
}

export async function readProfileRegistryProfiles(
  addresses: string[],
): Promise<Record<string, ProfileRegistryProfile>> {
  const normalizedAddresses = normalizeUniqueAddresses(addresses);
  const profiles: Record<string, ProfileRegistryProfile> = {};

  for (const address of normalizedAddresses) {
    profiles[address] = EMPTY_PROFILE;
  }

  if (!profileRegistry || !publicClient || normalizedAddresses.length === 0) {
    return profiles;
  }

  try {
    const results = await publicClient.multicall({
      allowFailure: true,
      contracts: normalizedAddresses.map(address => ({
        address: profileRegistry.address,
        abi: profileRegistry.abi,
        functionName: "getProfile",
        args: [address],
      })),
    });

    results.forEach((result, index) => {
      const address = normalizedAddresses[index];
      profiles[address] = result.status === "success" ? parseProfile(result.result) : EMPTY_PROFILE;
    });
  } catch {
    // Fallback to individual calls when multicall3 is unavailable (e.g. local Anvil)
    await Promise.all(
      normalizedAddresses.map(async address => {
        try {
          const result = await publicClient.readContract({
            address: profileRegistry.address,
            abi: profileRegistry.abi,
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

  return profiles;
}

export async function readProfileRegistryProfile(address: string): Promise<ProfileRegistryProfile> {
  if (!isAddress(address)) {
    return EMPTY_PROFILE;
  }

  const normalizedAddress = normalizeAddress(address);
  const profiles = await readProfileRegistryProfiles([normalizedAddress]);
  return profiles[normalizedAddress] ?? EMPTY_PROFILE;
}

export async function readCRepBalances(addresses: string[]): Promise<Record<string, bigint>> {
  const normalizedAddresses = normalizeUniqueAddresses(addresses);
  const balances: Record<string, bigint> = {};

  for (const address of normalizedAddresses) {
    balances[address] = 0n;
  }

  if (!crepToken || !publicClient || normalizedAddresses.length === 0) {
    return balances;
  }

  try {
    const results = await publicClient.multicall({
      allowFailure: true,
      contracts: normalizedAddresses.map(address => ({
        address: crepToken.address,
        abi: crepToken.abi,
        functionName: "balanceOf",
        args: [address],
      })),
    });

    results.forEach((result, index) => {
      const address = normalizedAddresses[index];
      balances[address] = result.status === "success" && typeof result.result === "bigint" ? result.result : 0n;
    });
  } catch {
    await Promise.all(
      normalizedAddresses.map(async address => {
        try {
          const result = await publicClient.readContract({
            address: crepToken.address,
            abi: crepToken.abi,
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

  return balances;
}

export async function listRegisteredProfileAddresses(params: { limit: number; offset?: number }) {
  if (!profileRegistry || !publicClient || params.limit <= 0) {
    return { addresses: [] as `0x${string}`[], total: 0 };
  }

  const offset = Math.max(params.offset ?? 0, 0);
  const result = await publicClient.readContract({
    address: profileRegistry.address,
    abi: profileRegistry.abi,
    functionName: "getRegisteredAddressesPaginated",
    args: [BigInt(offset), BigInt(params.limit)],
  });

  const tuple = result as readonly [readonly string[], bigint];
  const addresses = Array.isArray(tuple[0])
    ? tuple[0].filter((address): address is `0x${string}` => isAddress(address)).map(normalizeAddress)
    : [];
  const total = typeof tuple[1] === "bigint" ? Number(tuple[1]) : addresses.length;

  return { addresses, total };
}
