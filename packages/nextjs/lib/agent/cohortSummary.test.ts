import { buildAgentCohortSummary } from "./cohortSummary";
import assert from "node:assert/strict";
import test from "node:test";

test("buildAgentCohortSummary keeps the strongest public self-reported buckets", () => {
  const summary = buildAgentCohortSummary({
    fields: {
      ageGroup: [],
      expertise: [
        { down: 1, total: 3, up: 2, value: "ai" },
        { down: 0, total: 2, up: 2, value: "crypto" },
      ],
      languages: [{ down: 0, total: 4, up: 4, value: "en" }],
      nationalities: [],
      residenceCountry: [{ down: 1, total: 3, up: 2, value: "DE" }],
      roles: [
        { down: 0, total: 3, up: 3, value: "founder" },
        { down: 1, total: 5, up: 4, value: "engineer" },
      ],
    },
    note: "Audience context is public, self-reported, unverified, and not used for vote eligibility.",
    restrictedEligibility: false,
    selfReportedProfileCount: 4,
    source: "self_reported_public_profiles",
    totalRevealedVotes: 5,
    verified: false,
  });

  assert.deepEqual(summary, {
    coverageShare: 0.8,
    note: "Audience context is public, self-reported, unverified, and not used for vote eligibility.",
    selfReportedProfileCount: 4,
    source: "self_reported_public_profiles",
    topSignals: {
      expertise: [
        { down: 1, total: 3, up: 2, value: "ai" },
        { down: 0, total: 2, up: 2, value: "crypto" },
      ],
      languages: [{ down: 0, total: 4, up: 4, value: "en" }],
      residenceCountry: [{ down: 1, total: 3, up: 2, value: "DE" }],
      roles: [
        { down: 1, total: 5, up: 4, value: "engineer" },
        { down: 0, total: 3, up: 3, value: "founder" },
      ],
    },
    totalRevealedVotes: 5,
  });
});

test("buildAgentCohortSummary returns null without usable self-report signal", () => {
  assert.equal(
    buildAgentCohortSummary({
      fields: {
        ageGroup: [],
        expertise: [],
        languages: [],
        nationalities: [],
        residenceCountry: [],
        roles: [],
      },
      note: "",
      selfReportedProfileCount: 0,
      source: "self_reported_public_profiles",
      totalRevealedVotes: 0,
    }),
    null,
  );
});
