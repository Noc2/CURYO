import { isAddress } from "viem";

export const REFERRAL_QUERY_PARAM = "ref";
export const REFERRAL_ATTRIBUTION_STORAGE_KEY = "curyo_referral_attribution";
export const LEGACY_REFERRER_STORAGE_KEY = "curyo_referrer";
export const REFERRAL_ATTRIBUTION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type ReferralAttributionSource = "url" | "manual";

export type ReferralAttribution = {
  version: 1;
  referrer: string;
  capturedAt: number;
  expiresAt: number;
  source: ReferralAttributionSource;
};

type ReferralStorage = Pick<Storage, "getItem" | "removeItem" | "setItem">;

type ReferralStorageOptions = {
  localStorage?: ReferralStorage | null;
  sessionStorage?: ReferralStorage | null;
  now?: number;
  source?: ReferralAttributionSource;
  ttlMs?: number;
};

type SearchParamReader = Pick<URLSearchParams, "get">;

function getBrowserStorage(kind: "localStorage" | "sessionStorage"): ReferralStorage | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window[kind];
  } catch {
    return null;
  }
}

function getStoragePair(options: ReferralStorageOptions) {
  return {
    local: options.localStorage !== undefined ? options.localStorage : getBrowserStorage("localStorage"),
    session: options.sessionStorage !== undefined ? options.sessionStorage : getBrowserStorage("sessionStorage"),
  };
}

export function normalizeReferralAddress(value: string | null | undefined): string | null {
  const candidate = value?.trim().replace(/^0X/, "0x").toLowerCase();
  if (!candidate || !isAddress(candidate, { strict: false })) {
    return null;
  }

  return candidate;
}

export function createReferralAttribution(
  value: string | null | undefined,
  options: ReferralStorageOptions = {},
): ReferralAttribution | null {
  const referrer = normalizeReferralAddress(value);
  if (!referrer) {
    return null;
  }

  const now = options.now ?? Date.now();
  const ttlMs = options.ttlMs ?? REFERRAL_ATTRIBUTION_TTL_MS;

  return {
    version: 1,
    referrer,
    capturedAt: now,
    expiresAt: now + ttlMs,
    source: options.source ?? "url",
  };
}

function parseReferralAttribution(rawValue: string, now: number): ReferralAttribution | null {
  try {
    const parsed = JSON.parse(rawValue) as Partial<ReferralAttribution>;
    if (parsed.version !== 1 || typeof parsed.capturedAt !== "number" || typeof parsed.expiresAt !== "number") {
      return null;
    }

    const referrer = normalizeReferralAddress(parsed.referrer);
    if (!referrer || parsed.expiresAt <= now) {
      return null;
    }

    return {
      version: 1,
      referrer,
      capturedAt: parsed.capturedAt,
      expiresAt: parsed.expiresAt,
      source: parsed.source === "manual" ? "manual" : "url",
    };
  } catch {
    return null;
  }
}

function readAttributionFromStorage(storage: ReferralStorage | null, now: number): ReferralAttribution | null {
  if (!storage) {
    return null;
  }

  const rawValue = storage.getItem(REFERRAL_ATTRIBUTION_STORAGE_KEY);
  if (!rawValue) {
    return null;
  }

  const parsed = parseReferralAttribution(rawValue, now);
  if (!parsed) {
    storage.removeItem(REFERRAL_ATTRIBUTION_STORAGE_KEY);
  }

  return parsed;
}

function readLegacyReferrer(storage: ReferralStorage | null, now: number): ReferralAttribution | null {
  if (!storage) {
    return null;
  }

  const referrer = normalizeReferralAddress(storage.getItem(LEGACY_REFERRER_STORAGE_KEY));
  if (!referrer) {
    storage.removeItem(LEGACY_REFERRER_STORAGE_KEY);
    return null;
  }

  return createReferralAttribution(referrer, { now, source: "url" });
}

export function readStoredReferralAttribution(options: ReferralStorageOptions = {}): ReferralAttribution | null {
  const now = options.now ?? Date.now();
  const { local, session } = getStoragePair(options);

  return (
    readAttributionFromStorage(local, now) ??
    readAttributionFromStorage(session, now) ??
    readLegacyReferrer(session, now) ??
    readLegacyReferrer(local, now)
  );
}

export function getStoredReferralAddress(options: ReferralStorageOptions = {}): string | null {
  return readStoredReferralAttribution(options)?.referrer ?? null;
}

export function writeReferralAttribution(
  attribution: ReferralAttribution,
  options: ReferralStorageOptions = {},
): ReferralAttribution {
  const { local, session } = getStoragePair(options);
  const serialized = JSON.stringify(attribution);
  let wrotePrimary = false;

  try {
    local?.setItem(REFERRAL_ATTRIBUTION_STORAGE_KEY, serialized);
    local?.removeItem(LEGACY_REFERRER_STORAGE_KEY);
    wrotePrimary = !!local;
  } catch {
    wrotePrimary = false;
  }

  if (!wrotePrimary) {
    session?.setItem(REFERRAL_ATTRIBUTION_STORAGE_KEY, serialized);
  } else {
    try {
      session?.setItem(REFERRAL_ATTRIBUTION_STORAGE_KEY, serialized);
    } catch {
      // localStorage already has the attribution.
    }
  }

  try {
    session?.removeItem(LEGACY_REFERRER_STORAGE_KEY);
  } catch {
    // Ignore legacy cleanup failures.
  }

  return attribution;
}

export function storeReferralAttributionFromValue(
  value: string | null | undefined,
  options: ReferralStorageOptions = {},
): ReferralAttribution | null {
  const attribution = createReferralAttribution(value, options);
  if (!attribution) {
    return null;
  }

  return writeReferralAttribution(attribution, options);
}

export function captureReferralAttributionFromSearchParams(
  searchParams: SearchParamReader | null | undefined,
  options: ReferralStorageOptions = {},
): ReferralAttribution | null {
  return storeReferralAttributionFromValue(searchParams?.get(REFERRAL_QUERY_PARAM), {
    ...options,
    source: options.source ?? "url",
  });
}

export function clearStoredReferralAttribution(options: ReferralStorageOptions = {}) {
  const { local, session } = getStoragePair(options);

  for (const storage of [local, session]) {
    storage?.removeItem(REFERRAL_ATTRIBUTION_STORAGE_KEY);
    storage?.removeItem(LEGACY_REFERRER_STORAGE_KEY);
  }
}

export function buildReferralLandingUrl(origin: string, referrer: string | null | undefined): string {
  const normalizedReferrer = normalizeReferralAddress(referrer);
  if (!normalizedReferrer) {
    return "";
  }

  try {
    const url = new URL("/", origin);
    url.searchParams.set(REFERRAL_QUERY_PARAM, normalizedReferrer);
    url.searchParams.set("landing", "1");
    return url.toString();
  } catch {
    return "";
  }
}
