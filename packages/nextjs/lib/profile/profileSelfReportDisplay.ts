import {
  AGE_GROUP_OPTIONS,
  EXPERTISE_OPTIONS,
  type ExpertiseArea,
  LANGUAGE_OPTIONS,
  type LanguageCode,
  type ProfileRole,
  type ProfileSelfReport,
  ROLE_OPTIONS,
} from "@curyo/node-utils/profileSelfReport";

export const PROFILE_LANGUAGE_LABELS: Record<LanguageCode, string> = {
  ar: "Arabic",
  de: "German",
  en: "English",
  es: "Spanish",
  fr: "French",
  hi: "Hindi",
  id: "Indonesian",
  it: "Italian",
  ja: "Japanese",
  ko: "Korean",
  nl: "Dutch",
  other: "Other",
  pl: "Polish",
  pt: "Portuguese",
  tr: "Turkish",
  zh: "Chinese",
};

export const PROFILE_ROLE_LABELS: Record<ProfileRole, string> = {
  creator: "Creator",
  educator: "Educator",
  engineer: "Engineer",
  finance: "Finance",
  founder: "Founder",
  healthcare: "Healthcare",
  "legal-policy": "Legal / policy",
  operator: "Operations",
  other: "Other",
  "product-design": "Product / design",
  "public-sector": "Public sector",
  researcher: "Researcher",
  student: "Student",
};

export const PROFILE_EXPERTISE_LABELS: Record<ExpertiseArea, string> = {
  ai: "AI",
  "consumer-products": "Consumer products",
  crypto: "Crypto",
  education: "Education",
  finance: "Finance",
  gaming: "Gaming",
  health: "Health",
  "local-services": "Local services",
  media: "Media",
  other: "Other",
  "public-policy": "Public policy",
  science: "Science",
};

const FALLBACK_COUNTRY_CODES = [
  "AR",
  "AT",
  "AU",
  "BE",
  "BR",
  "CA",
  "CH",
  "CN",
  "DE",
  "DK",
  "ES",
  "FI",
  "FR",
  "GB",
  "ID",
  "IE",
  "IN",
  "IT",
  "JP",
  "KR",
  "MX",
  "NL",
  "NO",
  "PL",
  "PT",
  "SE",
  "SG",
  "TR",
  "US",
] as const;

const REGION_CODES_TO_EXCLUDE = new Set(["AC", "CP", "DG", "EA", "EU", "EZ", "IC", "TA", "UN", "XK"]);

function supportedRegionCodes() {
  const intl = Intl as typeof Intl & { supportedValuesOf?: (key: "region") => string[] };
  const regions = intl.supportedValuesOf?.("region") ?? [...FALLBACK_COUNTRY_CODES];
  return regions.filter(code => /^[A-Z]{2}$/.test(code) && !REGION_CODES_TO_EXCLUDE.has(code));
}

const regionNames =
  typeof Intl.DisplayNames === "function" ? new Intl.DisplayNames(undefined, { type: "region" }) : null;

export function formatProfileCountryCode(code: string) {
  return regionNames?.of(code) ?? code;
}

export const PROFILE_COUNTRY_OPTIONS = supportedRegionCodes()
  .map(code => ({ label: formatProfileCountryCode(code), value: code }))
  .sort((a, b) => a.label.localeCompare(b.label));

export const PROFILE_AGE_GROUP_OPTIONS = AGE_GROUP_OPTIONS.map(value => ({ label: value, value }));
export const PROFILE_LANGUAGE_OPTIONS = LANGUAGE_OPTIONS.map(value => ({
  label: PROFILE_LANGUAGE_LABELS[value],
  value,
}));
export const PROFILE_ROLE_OPTIONS = ROLE_OPTIONS.map(value => ({ label: PROFILE_ROLE_LABELS[value], value }));
export const PROFILE_EXPERTISE_OPTIONS = EXPERTISE_OPTIONS.map(value => ({
  label: PROFILE_EXPERTISE_LABELS[value],
  value,
}));

export function getProfileSelfReportDisplayGroups(report: ProfileSelfReport | null) {
  if (!report) return [];

  return [
    report.ageGroup ? { label: "Age group", values: [report.ageGroup] } : null,
    report.residenceCountry ? { label: "Country", values: [formatProfileCountryCode(report.residenceCountry)] } : null,
    report.nationalities?.length
      ? { label: "Nationality", values: report.nationalities.map(formatProfileCountryCode) }
      : null,
    report.languages?.length
      ? { label: "Languages", values: report.languages.map(value => PROFILE_LANGUAGE_LABELS[value]) }
      : null,
    report.roles?.length ? { label: "Roles", values: report.roles.map(value => PROFILE_ROLE_LABELS[value]) } : null,
    report.expertise?.length
      ? { label: "Experience", values: report.expertise.map(value => PROFILE_EXPERTISE_LABELS[value]) }
      : null,
  ].filter((group): group is { label: string; values: string[] } => Boolean(group));
}
