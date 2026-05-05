import type { ProfileSelfReportAudienceContext, ProfileSelfReportBucket } from "@curyo/node-utils/profileSelfReport";

export type AgentCohortSummary = {
  coverageShare: number | null;
  note: string;
  selfReportedProfileCount: number;
  source: string;
  topSignals: {
    expertise: ProfileSelfReportBucket[];
    languages: ProfileSelfReportBucket[];
    residenceCountry: ProfileSelfReportBucket[];
    roles: ProfileSelfReportBucket[];
  };
  totalRevealedVotes: number;
};

function isBucket(value: unknown): value is ProfileSelfReportBucket {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof (value as { value?: unknown }).value === "string" &&
      typeof (value as { total?: unknown }).total === "number" &&
      typeof (value as { up?: unknown }).up === "number" &&
      typeof (value as { down?: unknown }).down === "number",
  );
}

function topBuckets(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isBucket)
    .slice()
    .sort((a, b) => b.total - a.total || b.up - a.up || a.value.localeCompare(b.value))
    .slice(0, 5);
}

function roundShare(value: number) {
  return Math.round(value * 1000) / 1000;
}

export function buildAgentCohortSummary(audienceContext: unknown): AgentCohortSummary | null {
  if (!audienceContext || typeof audienceContext !== "object" || Array.isArray(audienceContext)) return null;
  const context = audienceContext as Partial<ProfileSelfReportAudienceContext>;
  const fields = context.fields;
  if (!fields || typeof fields !== "object") return null;

  const selfReportedProfileCount = Number(context.selfReportedProfileCount ?? 0);
  const totalRevealedVotes = Number(context.totalRevealedVotes ?? 0);
  const topSignals = {
    expertise: topBuckets((fields as ProfileSelfReportAudienceContext["fields"]).expertise),
    languages: topBuckets((fields as ProfileSelfReportAudienceContext["fields"]).languages),
    residenceCountry: topBuckets((fields as ProfileSelfReportAudienceContext["fields"]).residenceCountry),
    roles: topBuckets((fields as ProfileSelfReportAudienceContext["fields"]).roles),
  };

  if (
    selfReportedProfileCount <= 0 &&
    topSignals.expertise.length === 0 &&
    topSignals.languages.length === 0 &&
    topSignals.residenceCountry.length === 0 &&
    topSignals.roles.length === 0
  ) {
    return null;
  }

  return {
    coverageShare: totalRevealedVotes > 0 ? roundShare(selfReportedProfileCount / totalRevealedVotes) : null,
    note: typeof context.note === "string" ? context.note : "",
    selfReportedProfileCount,
    source: typeof context.source === "string" ? context.source : "unknown",
    topSignals,
    totalRevealedVotes,
  };
}
