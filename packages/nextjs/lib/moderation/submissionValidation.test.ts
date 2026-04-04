import {
  findBlockedCategorySubcategories,
  findBlockedContentTags,
  getCategoryDomainValidationError,
  getCategoryNameValidationError,
  getCategorySubcategoryValidationError,
  getContentDescriptionValidationError,
  getContentTagValidationError,
  getContentTitleValidationError,
} from "./submissionValidation";
import assert from "node:assert/strict";
import test from "node:test";

test("getContentTitleValidationError rejects prohibited terms", () => {
  assert.equal(getContentTitleValidationError("NSFW highlights"), "Your title contains prohibited content");
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

test("getCategoryNameValidationError rejects prohibited platform names", () => {
  assert.equal(getCategoryNameValidationError("OnlyFans clips"), "Platform name contains prohibited content");
});

test("getCategoryDomainValidationError rejects prohibited platform domains", () => {
  assert.equal(getCategoryDomainValidationError("xhamster.com"), "This domain contains prohibited content");
});

test("getCategorySubcategoryValidationError rejects prohibited subcategories", () => {
  assert.equal(getCategorySubcategoryValidationError(" hentai "), "This category contains prohibited content");
});

test("findBlockedCategorySubcategories returns trimmed blocked subcategories", () => {
  assert.deepEqual(findBlockedCategorySubcategories(["Culture", " rule34 "]), ["rule34"]);
});

test("findBlockedCategorySubcategories allows normal trimmed subcategories", () => {
  assert.deepEqual(findBlockedCategorySubcategories([" Culture ", "Podcasts"]), []);
});
