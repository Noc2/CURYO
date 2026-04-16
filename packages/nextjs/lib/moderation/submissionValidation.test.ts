import {
  findBlockedContentTags,
  getContentDescriptionValidationError,
  getContentTagValidationError,
  getContentTitleValidationError,
} from "./submissionValidation";
import assert from "node:assert/strict";
import test from "node:test";

test("getContentTitleValidationError rejects prohibited terms", () => {
  assert.equal(getContentTitleValidationError("NSFW highlights"), "Your question contains prohibited content");
});

test("getContentDescriptionValidationError rejects prohibited terms", () => {
  assert.equal(
    getContentDescriptionValidationError("A full pornography roundup"),
    "Your description contains prohibited content",
  );
});

test("getContentTagValidationError rejects prohibited custom tags", () => {
  assert.equal(getContentTagValidationError("rule34"), "This category contains prohibited content");
});

test("getContentTagValidationError allows normal custom tags", () => {
  assert.equal(getContentTagValidationError("indie games"), null);
});

test("findBlockedContentTags returns trimmed blocked tags", () => {
  assert.deepEqual(findBlockedContentTags(["music", " nsfw ", "science"]), ["nsfw"]);
});
