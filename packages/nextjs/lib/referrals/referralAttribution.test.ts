import {
  LEGACY_REFERRER_STORAGE_KEY,
  REFERRAL_ATTRIBUTION_STORAGE_KEY,
  REFERRAL_ATTRIBUTION_TTL_MS,
  buildReferralLandingUrl,
  captureReferralAttributionFromSearchParams,
  clearStoredReferralAttribution,
  getStoredReferralAddress,
  readStoredReferralAttribution,
  storeReferralAttributionFromValue,
} from "./referralAttribution";
import assert from "node:assert/strict";
import test from "node:test";

const REFERRER = "0xc1cd80c7cd37b5499560c362b164cba1cff71b44";
const SECOND_REFERRER = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd";

class MemoryStorage {
  private values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }

  removeItem(key: string) {
    this.values.delete(key);
  }
}

class ThrowingStorage extends MemoryStorage {
  setItem() {
    throw new Error("blocked");
  }
}

test("captures a valid referral address from search params", () => {
  const localStorage = new MemoryStorage();
  const sessionStorage = new MemoryStorage();
  const searchParams = new URLSearchParams({ ref: REFERRER.toUpperCase(), landing: "1" });

  const attribution = captureReferralAttributionFromSearchParams(searchParams, {
    localStorage,
    now: 1_000,
    sessionStorage,
  });

  assert.equal(attribution?.referrer, REFERRER);
  assert.equal(attribution?.source, "url");
  assert.equal(attribution?.capturedAt, 1_000);
  assert.equal(attribution?.expiresAt, 1_000 + REFERRAL_ATTRIBUTION_TTL_MS);
  assert.equal(getStoredReferralAddress({ localStorage, now: 1_001, sessionStorage }), REFERRER);
});

test("does not overwrite a stored referral with an invalid URL value", () => {
  const localStorage = new MemoryStorage();
  const sessionStorage = new MemoryStorage();

  storeReferralAttributionFromValue(REFERRER, { localStorage, now: 1_000, sessionStorage });
  const captured = captureReferralAttributionFromSearchParams(new URLSearchParams({ ref: "not-an-address" }), {
    localStorage,
    now: 2_000,
    sessionStorage,
  });

  assert.equal(captured, null);
  assert.equal(getStoredReferralAddress({ localStorage, now: 2_000, sessionStorage }), REFERRER);
});

test("expires stored referrals and removes stale records", () => {
  const localStorage = new MemoryStorage();
  const sessionStorage = new MemoryStorage();

  storeReferralAttributionFromValue(REFERRER, {
    localStorage,
    now: 1_000,
    sessionStorage,
    ttlMs: 100,
  });

  assert.equal(readStoredReferralAttribution({ localStorage, now: 1_101, sessionStorage }), null);
  assert.equal(localStorage.getItem(REFERRAL_ATTRIBUTION_STORAGE_KEY), null);
});

test("falls back to session storage when local storage is unavailable", () => {
  const localStorage = new ThrowingStorage();
  const sessionStorage = new MemoryStorage();

  storeReferralAttributionFromValue(REFERRER, { localStorage, now: 1_000, sessionStorage });

  assert.equal(getStoredReferralAddress({ localStorage, now: 1_001, sessionStorage }), REFERRER);
});

test("manual attribution can replace a stored URL attribution", () => {
  const localStorage = new MemoryStorage();
  const sessionStorage = new MemoryStorage();

  storeReferralAttributionFromValue(REFERRER, { localStorage, now: 1_000, sessionStorage });
  const manualAttribution = storeReferralAttributionFromValue(SECOND_REFERRER, {
    localStorage,
    now: 2_000,
    sessionStorage,
    source: "manual",
  });

  assert.equal(manualAttribution?.source, "manual");
  assert.equal(getStoredReferralAddress({ localStorage, now: 2_001, sessionStorage }), SECOND_REFERRER);
});

test("reads legacy session referrers", () => {
  const localStorage = new MemoryStorage();
  const sessionStorage = new MemoryStorage();
  sessionStorage.setItem(LEGACY_REFERRER_STORAGE_KEY, REFERRER);

  const attribution = readStoredReferralAttribution({ localStorage, now: 1_000, sessionStorage });

  assert.equal(attribution?.referrer, REFERRER);
  assert.equal(attribution?.source, "url");
});

test("clears referral attribution from current and legacy storage keys", () => {
  const localStorage = new MemoryStorage();
  const sessionStorage = new MemoryStorage();

  storeReferralAttributionFromValue(REFERRER, { localStorage, now: 1_000, sessionStorage });
  sessionStorage.setItem(LEGACY_REFERRER_STORAGE_KEY, REFERRER);

  clearStoredReferralAttribution({ localStorage, sessionStorage });

  assert.equal(localStorage.getItem(REFERRAL_ATTRIBUTION_STORAGE_KEY), null);
  assert.equal(sessionStorage.getItem(REFERRAL_ATTRIBUTION_STORAGE_KEY), null);
  assert.equal(sessionStorage.getItem(LEGACY_REFERRER_STORAGE_KEY), null);
});

test("builds landing-page referral links with landing override", () => {
  assert.equal(
    buildReferralLandingUrl("https://www.curyo.xyz/governance", REFERRER.toUpperCase()),
    `https://www.curyo.xyz/?ref=${REFERRER}&landing=1`,
  );
});
