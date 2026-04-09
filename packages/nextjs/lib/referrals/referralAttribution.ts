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

function safeGetItem(storage: ReferralStorage | null, key: string): string | null {
  if (!storage) {
    return null;
  }

  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function safeSetItem(storage: ReferralStorage | null, key: string, value: string): boolean {
  if (!storage) {
    return false;
  }

  try {
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function safeRemoveItem(storage: ReferralStorage | null, key: string) {
  if (!storage) {
    return;
  }

  try {
    storage.removeItem(key);
  } catch {
    // Ignore unavailable or blocked storage.
  }
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
  const rawValue = safeGetItem(storage, REFERRAL_ATTRIBUTION_STORAGE_KEY);
  if (!rawValue) {
    return null;
  }

  const parsed = parseReferralAttribution(rawValue, now);
  if (!parsed) {
    safeRemoveItem(storage, REFERRAL_ATTRIBUTION_STORAGE_KEY);
  }

  return parsed;
}

function readLegacyReferrer(storage: ReferralStorage | null, now: number): ReferralAttribution | null {
  const referrer = normalizeReferralAddress(safeGetItem(storage, LEGACY_REFERRER_STORAGE_KEY));
  if (!referrer) {
    safeRemoveItem(storage, LEGACY_REFERRER_STORAGE_KEY);
    return null;
  }

  return createReferralAttribution(referrer, { now, source: "url" });
}

function getLatestAttribution(...attributions: Array<ReferralAttribution | null>): ReferralAttribution | null {
  return attributions.reduce<ReferralAttribution | null>((latest, attribution) => {
    if (!attribution) {
      return latest;
    }

    if (!latest || attribution.capturedAt > latest.capturedAt) {
      return attribution;
    }

    return latest;
  }, null);
}

export function readStoredReferralAttribution(options: ReferralStorageOptions = {}): ReferralAttribution | null {
  const now = options.now ?? Date.now();
  const { local, session } = getStoragePair(options);

  return getLatestAttribution(
    readAttributionFromStorage(local, now),
    readAttributionFromStorage(session, now),
    readLegacyReferrer(session, now),
    readLegacyReferrer(local, now),
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

  const wrotePrimary = safeSetItem(local, REFERRAL_ATTRIBUTION_STORAGE_KEY, serialized);
  if (wrotePrimary) {
    safeRemoveItem(local, LEGACY_REFERRER_STORAGE_KEY);
  }

  if (!wrotePrimary) {
    safeSetItem(session, REFERRAL_ATTRIBUTION_STORAGE_KEY, serialized);
  } else {
    safeSetItem(session, REFERRAL_ATTRIBUTION_STORAGE_KEY, serialized);
  }

  safeRemoveItem(session, LEGACY_REFERRER_STORAGE_KEY);

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
  const attribution = createReferralAttribution(searchParams?.get(REFERRAL_QUERY_PARAM), {
    ...options,
    source: options.source ?? "url",
  });
  if (!attribution) {
    return null;
  }

  return readStoredReferralAttribution(options) ?? writeReferralAttribution(attribution, options);
}

export function clearStoredReferralAttribution(options: ReferralStorageOptions = {}) {
  const { local, session } = getStoragePair(options);

  for (const storage of [local, session]) {
    safeRemoveItem(storage, REFERRAL_ATTRIBUTION_STORAGE_KEY);
    safeRemoveItem(storage, LEGACY_REFERRER_STORAGE_KEY);
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
