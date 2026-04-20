import {
  MAX_QUESTION_REFERENCE_COUNT,
  extractQuestionReferenceIds,
  getQuestionReferenceValidationError,
  parseQuestionReferenceInput,
  parseQuestionReferences,
} from "./questionReferences";
import assert from "node:assert/strict";
import test from "node:test";

test("parseQuestionReferences splits text and question references", () => {
  const parsed = parseQuestionReferences("Compare this with [[question:42]] before rating.");

  assert.deepEqual(parsed.segments, [
    { type: "text", text: "Compare this with " },
    { type: "question-reference", contentId: "42", label: undefined, raw: "[[question:42]]" },
    { type: "text", text: " before rating." },
  ]);
  assert.deepEqual(parsed.references, [{ contentId: "42", label: undefined, raw: "[[question:42]]" }]);
});

test("parseQuestionReferences supports custom labels and normalizes ids", () => {
  const parsed = parseQuestionReferences("Try [[ question:0042 | the other proposal ]] too.");

  assert.deepEqual(parsed.segments[1], {
    type: "question-reference",
    contentId: "42",
    label: "the other proposal",
    raw: "[[ question:0042 | the other proposal ]]",
  });
  assert.deepEqual(parsed.references, [
    { contentId: "42", label: "the other proposal", raw: "[[ question:0042 | the other proposal ]]" },
  ]);
});

test("parseQuestionReferences leaves malformed references as text", () => {
  const description = "Ignore [[question:abc]] and [[question:0]].";

  assert.deepEqual(parseQuestionReferences(description), {
    segments: [{ type: "text", text: description }],
    references: [],
  });
});

test("extractQuestionReferenceIds dedupes ids across descriptions", () => {
  assert.deepEqual(
    extractQuestionReferenceIds(["[[question:1]] [[question:2]]", "Again [[question:2]] and [[question:003]]"]),
    ["1", "2", "3"],
  );
});

test("getQuestionReferenceValidationError limits unique references", () => {
  const withinLimit = Array.from({ length: MAX_QUESTION_REFERENCE_COUNT }, (_, index) => `[[question:${index + 1}]]`);
  assert.equal(getQuestionReferenceValidationError(withinLimit.join(" ")), null);

  assert.equal(
    getQuestionReferenceValidationError(`${withinLimit.join(" ")} [[question:999]]`),
    `Description can reference up to ${MAX_QUESTION_REFERENCE_COUNT} questions`,
  );
});

test("parseQuestionReferenceInput accepts ids, raw syntax, and internal links", () => {
  assert.equal(parseQuestionReferenceInput("42"), "42");
  assert.equal(parseQuestionReferenceInput("#0042"), "42");
  assert.equal(parseQuestionReferenceInput("[[question:42|Alternative]]"), "42");
  assert.equal(parseQuestionReferenceInput("/rate?content=42"), "42");
  assert.equal(parseQuestionReferenceInput("https://app.curyo.xyz/vote?content=0042"), "42");
});

test("parseQuestionReferenceInput rejects unsupported values", () => {
  assert.equal(parseQuestionReferenceInput("0"), null);
  assert.equal(parseQuestionReferenceInput("question 42"), null);
  assert.equal(parseQuestionReferenceInput("https://example.com/rate?content=42"), null);
  assert.equal(parseQuestionReferenceInput("ftp://app.curyo.xyz/rate?content=42"), null);
  assert.equal(parseQuestionReferenceInput("/rate?content=abc"), null);
});
