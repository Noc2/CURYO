import { listAgentResultTemplates } from "./templates";
import assert from "node:assert/strict";
import test from "node:test";

test("listAgentResultTemplates exposes machine-readable metadata for agent clients", () => {
  const templates = listAgentResultTemplates();
  const generic = templates.find(template => template.id === "generic_rating");
  const ranked = templates.find(template => template.id === "ranked_option_member");
  const featureAcceptance = templates.find(template => template.id === "feature_acceptance_test");
  const traceReview = templates.find(template => template.id === "agent_trace_review");

  assert.ok(generic);
  assert.equal(generic?.submissionPattern, "single_question");
  assert.equal(generic?.bundleStrategy, "independent");
  assert.deepEqual(generic?.templateInputsExample, {
    audience: "new visitors",
    goal: "quick human interest check",
    successSignal: "Would this make you want to learn more?",
  });

  assert.ok(ranked);
  assert.equal(ranked?.submissionPattern, "bundle_member");
  assert.equal(ranked?.bundleStrategy, "rank_by_rating");
  assert.equal(ranked?.templateInputsSchema.type, "object");

  assert.ok(featureAcceptance);
  assert.equal(featureAcceptance?.submissionPattern, "single_question");
  assert.equal(featureAcceptance?.bundleStrategy, "independent");
  assert.equal(featureAcceptance?.templateInputsSchema.type, "object");
  assert.ok(
    (featureAcceptance?.templateInputsSchema.properties as Record<string, unknown> | undefined)?.expectedBehavior,
  );
  assert.ok((featureAcceptance?.templateInputsSchema.properties as Record<string, unknown> | undefined)?.testSteps);
  assert.ok(
    (featureAcceptance?.templateInputsSchema.properties as Record<string, unknown> | undefined)?.acceptanceCriteria,
  );

  assert.ok(traceReview);
  assert.equal(traceReview?.submissionPattern, "single_question");
  assert.equal(traceReview?.bundleStrategy, "independent");
  assert.ok((traceReview?.templateInputsSchema.properties as Record<string, unknown> | undefined)?.traceId);
  assert.ok((traceReview?.templateInputsSchema.properties as Record<string, unknown> | undefined)?.taskGoal);
  assert.ok((traceReview?.templateInputsSchema.properties as Record<string, unknown> | undefined)?.reviewFocus);
});
