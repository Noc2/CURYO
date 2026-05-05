import type { SelfApp } from "@selfxyz/qrcode";

export type FaucetExcludedCountryCode = NonNullable<SelfApp["disclosures"]["excludedCountries"]>[number];

export const FAUCET_MINIMUM_AGE = 18;

export const FAUCET_EXCLUDED_COUNTRIES = [
  "CUB",
  "IRN",
  "PRK",
  "SYR",
] as const satisfies readonly FaucetExcludedCountryCode[];

export const FAUCET_EXCLUDED_COUNTRY_NAMES = ["Cuba", "Iran", "North Korea", "Syria"] as const;
