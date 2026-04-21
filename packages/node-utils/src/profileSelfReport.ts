export const PROFILE_SELF_REPORT_SCHEMA_VERSION = 1;
export const PROFILE_SELF_REPORT_SOURCE = "self_reported_public_profiles" as const;
export const PROFILE_SELF_REPORT_VERIFIED = false;
export const PROFILE_SELF_REPORT_RESTRICTS_ELIGIBILITY = false;
export const MAX_PROFILE_SELF_REPORT_LENGTH = 1600;

export const PROFILE_SELF_REPORT_NOTICE =
  "Audience context is public, self-reported, unverified, and not used for vote eligibility.";

export const AGE_GROUP_OPTIONS = [
  "18-24",
  "25-34",
  "35-44",
  "45-54",
  "55-64",
  "65+",
] as const;

export const LANGUAGE_OPTIONS = [
  "en",
  "es",
  "fr",
  "de",
  "pt",
  "it",
  "nl",
  "pl",
  "tr",
  "ar",
  "hi",
  "id",
  "ja",
  "ko",
  "zh",
  "other",
] as const;

export const ROLE_OPTIONS = [
  "student",
  "founder",
  "engineer",
  "product-design",
  "researcher",
  "operator",
  "finance",
  "creator",
  "educator",
  "healthcare",
  "legal-policy",
  "public-sector",
  "other",
] as const;

export const EXPERTISE_OPTIONS = [
  "ai",
  "crypto",
  "finance",
  "consumer-products",
  "media",
  "science",
  "health",
  "gaming",
  "education",
  "local-services",
  "public-policy",
  "other",
] as const;

export type AgeGroup = (typeof AGE_GROUP_OPTIONS)[number];
export type LanguageCode = (typeof LANGUAGE_OPTIONS)[number];
export type ProfileRole = (typeof ROLE_OPTIONS)[number];
export type ExpertiseArea = (typeof EXPERTISE_OPTIONS)[number];

export interface ProfileSelfReport {
  v: typeof PROFILE_SELF_REPORT_SCHEMA_VERSION;
  ageGroup?: AgeGroup;
  residenceCountry?: string;
  nationalities?: string[];
  languages?: LanguageCode[];
  roles?: ProfileRole[];
  expertise?: ExpertiseArea[];
}

export interface ProfileSelfReportBucket {
  down: number;
  total: number;
  up: number;
  value: string;
}

export interface ProfileSelfReportAudienceContext {
  fields: {
    ageGroup: ProfileSelfReportBucket[];
    expertise: ProfileSelfReportBucket[];
    languages: ProfileSelfReportBucket[];
    nationalities: ProfileSelfReportBucket[];
    residenceCountry: ProfileSelfReportBucket[];
    roles: ProfileSelfReportBucket[];
  };
  missingSelfReportCount: number;
  note: string;
  restrictedEligibility: false;
  selfReportedProfileCount: number;
  source: typeof PROFILE_SELF_REPORT_SOURCE;
  totalRevealedVotes: number;
  verified: false;
}

export interface ProfileSelfReportVoteRow {
  isUp?: boolean | null;
  selfReport?: string | null;
}

const AGE_GROUP_SET = new Set<string>(AGE_GROUP_OPTIONS);
const LANGUAGE_SET = new Set<string>(LANGUAGE_OPTIONS);
const ROLE_SET = new Set<string>(ROLE_OPTIONS);
const EXPERTISE_SET = new Set<string>(EXPERTISE_OPTIONS);
const COUNTRY_CODE_PATTERN = /^[A-Z]{2}$/;

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeCountryCode(value: unknown) {
  const normalized = asString(value).toUpperCase();
  return COUNTRY_CODE_PATTERN.test(normalized) ? normalized : undefined;
}

function normalizeEnum<T extends string>(value: unknown, allowed: Set<string>): T | undefined {
  const normalized = asString(value);
  return allowed.has(normalized) ? (normalized as T) : undefined;
}

function normalizeStringArray<T extends string>(
  value: unknown,
  options: {
    allowCountryCodes?: boolean;
    allowed?: Set<string>;
    maxItems: number;
  },
) {
  if (!Array.isArray(value)) return undefined;

  const seen = new Set<string>();
  for (const item of value) {
    const normalized = options.allowCountryCodes
      ? normalizeCountryCode(item)
      : options.allowed
        ? normalizeEnum<T>(item, options.allowed)
        : undefined;
    if (normalized) {
      seen.add(normalized);
    }
  }

  const items = Array.from(seen).slice(0, options.maxItems) as T[];
  return items.length > 0 ? items : undefined;
}

function pruneEmpty(report: ProfileSelfReport) {
  const next: ProfileSelfReport = { v: PROFILE_SELF_REPORT_SCHEMA_VERSION };

  if (report.ageGroup) next.ageGroup = report.ageGroup;
  if (report.residenceCountry) next.residenceCountry = report.residenceCountry;
  if (report.nationalities?.length) next.nationalities = report.nationalities;
  if (report.languages?.length) next.languages = report.languages;
  if (report.roles?.length) next.roles = report.roles;
  if (report.expertise?.length) next.expertise = report.expertise;

  return next;
}

export function normalizeProfileSelfReport(value: unknown): ProfileSelfReport {
  const source = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

  return pruneEmpty({
    v: PROFILE_SELF_REPORT_SCHEMA_VERSION,
    ageGroup: normalizeEnum<AgeGroup>(source.ageGroup, AGE_GROUP_SET),
    residenceCountry: normalizeCountryCode(source.residenceCountry),
    nationalities: normalizeStringArray<string>(source.nationalities, { allowCountryCodes: true, maxItems: 3 }),
    languages: normalizeStringArray<LanguageCode>(source.languages, { allowed: LANGUAGE_SET, maxItems: 5 }),
    roles: normalizeStringArray<ProfileRole>(source.roles, { allowed: ROLE_SET, maxItems: 4 }),
    expertise: normalizeStringArray<ExpertiseArea>(source.expertise, { allowed: EXPERTISE_SET, maxItems: 5 }),
  });
}

export function profileSelfReportHasValues(report: ProfileSelfReport | null | undefined) {
  return Boolean(
    report?.ageGroup ||
      report?.residenceCountry ||
      report?.nationalities?.length ||
      report?.languages?.length ||
      report?.roles?.length ||
      report?.expertise?.length,
  );
}

export function serializeProfileSelfReport(value: unknown) {
  const serialized = JSON.stringify(normalizeProfileSelfReport(value));
  if (serialized.length > MAX_PROFILE_SELF_REPORT_LENGTH) {
    throw new Error(`Self-report payload must be ${MAX_PROFILE_SELF_REPORT_LENGTH} characters or fewer.`);
  }
  return serialized;
}

export function parseProfileSelfReport(value: unknown): ProfileSelfReport | null {
  if (typeof value !== "string" || value.trim().length === 0) return null;

  try {
    const parsed = JSON.parse(value);
    const report = normalizeProfileSelfReport(parsed);
    return profileSelfReportHasValues(report) ? report : null;
  } catch {
    return null;
  }
}

function emptyBucketFields(): ProfileSelfReportAudienceContext["fields"] {
  return {
    ageGroup: [],
    expertise: [],
    languages: [],
    nationalities: [],
    residenceCountry: [],
    roles: [],
  };
}

export function emptyProfileSelfReportAudienceContext(totalRevealedVotes = 0): ProfileSelfReportAudienceContext {
  return {
    fields: emptyBucketFields(),
    missingSelfReportCount: totalRevealedVotes,
    note: PROFILE_SELF_REPORT_NOTICE,
    restrictedEligibility: PROFILE_SELF_REPORT_RESTRICTS_ELIGIBILITY,
    selfReportedProfileCount: 0,
    source: PROFILE_SELF_REPORT_SOURCE,
    totalRevealedVotes,
    verified: PROFILE_SELF_REPORT_VERIFIED,
  };
}

function addBucketCount(map: Map<string, ProfileSelfReportBucket>, value: string, isUp: boolean | null | undefined) {
  const bucket = map.get(value) ?? { down: 0, total: 0, up: 0, value };
  bucket.total += 1;
  if (isUp === true) bucket.up += 1;
  if (isUp === false) bucket.down += 1;
  map.set(value, bucket);
}

function sortedBuckets(map: Map<string, ProfileSelfReportBucket>) {
  return Array.from(map.values()).sort((a, b) => b.total - a.total || a.value.localeCompare(b.value));
}

export function aggregateProfileSelfReports(rows: Iterable<ProfileSelfReportVoteRow>): ProfileSelfReportAudienceContext {
  const fieldMaps = {
    ageGroup: new Map<string, ProfileSelfReportBucket>(),
    expertise: new Map<string, ProfileSelfReportBucket>(),
    languages: new Map<string, ProfileSelfReportBucket>(),
    nationalities: new Map<string, ProfileSelfReportBucket>(),
    residenceCountry: new Map<string, ProfileSelfReportBucket>(),
    roles: new Map<string, ProfileSelfReportBucket>(),
  };
  let missingSelfReportCount = 0;
  let selfReportedProfileCount = 0;
  let totalRevealedVotes = 0;

  for (const row of rows) {
    totalRevealedVotes += 1;
    const report = parseProfileSelfReport(row.selfReport);
    if (!report) {
      missingSelfReportCount += 1;
      continue;
    }

    selfReportedProfileCount += 1;
    if (report.ageGroup) addBucketCount(fieldMaps.ageGroup, report.ageGroup, row.isUp);
    if (report.residenceCountry) addBucketCount(fieldMaps.residenceCountry, report.residenceCountry, row.isUp);
    for (const nationality of report.nationalities ?? []) {
      addBucketCount(fieldMaps.nationalities, nationality, row.isUp);
    }
    for (const language of report.languages ?? []) {
      addBucketCount(fieldMaps.languages, language, row.isUp);
    }
    for (const role of report.roles ?? []) {
      addBucketCount(fieldMaps.roles, role, row.isUp);
    }
    for (const area of report.expertise ?? []) {
      addBucketCount(fieldMaps.expertise, area, row.isUp);
    }
  }

  return {
    fields: {
      ageGroup: sortedBuckets(fieldMaps.ageGroup),
      expertise: sortedBuckets(fieldMaps.expertise),
      languages: sortedBuckets(fieldMaps.languages),
      nationalities: sortedBuckets(fieldMaps.nationalities),
      residenceCountry: sortedBuckets(fieldMaps.residenceCountry),
      roles: sortedBuckets(fieldMaps.roles),
    },
    missingSelfReportCount,
    note: PROFILE_SELF_REPORT_NOTICE,
    restrictedEligibility: PROFILE_SELF_REPORT_RESTRICTS_ELIGIBILITY,
    selfReportedProfileCount,
    source: PROFILE_SELF_REPORT_SOURCE,
    totalRevealedVotes,
    verified: PROFILE_SELF_REPORT_VERIFIED,
  };
}
