import assert from "node:assert/strict";
import test from "node:test";
import { MAX_PROFILE_IMAGE_URL_LENGTH, validateProfileImageUrl } from "~~/lib/profile/profileValidation";

test("validateProfileImageUrl accepts a valid HTTPS URL", () => {
  const result = validateProfileImageUrl("https://example.com/avatar.png");

  assert.equal(result.error, null);
  assert.equal(result.sanitizedImageUrl, "https://example.com/avatar.png");
});

test("validateProfileImageUrl rejects non-HTTPS URLs", () => {
  const result = validateProfileImageUrl("http://example.com/avatar.png");

  assert.equal(result.error, "Please enter a valid HTTPS URL for the image");
  assert.equal(result.sanitizedImageUrl, null);
});

test("validateProfileImageUrl rejects URLs longer than the onchain limit", () => {
  const longUrl = `https://example.com/${"a".repeat(MAX_PROFILE_IMAGE_URL_LENGTH)}`;

  const result = validateProfileImageUrl(longUrl);

  assert.equal(result.error, `Profile image URL must be ${MAX_PROFILE_IMAGE_URL_LENGTH} characters or fewer`);
  assert.equal(result.sanitizedImageUrl, null);
});
