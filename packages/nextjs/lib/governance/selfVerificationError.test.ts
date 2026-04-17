import { resolveSelfVerificationErrorMessage } from "./selfVerificationError";
import assert from "node:assert/strict";
import test from "node:test";

test("resolveSelfVerificationErrorMessage explains unsupported document types", () => {
  assert.equal(
    resolveSelfVerificationErrorMessage({
      error_code: "UnsupportedDocumentType()",
      reason: "Transaction failed with error: UnsupportedDocumentType()",
    }),
    "This Self credential is not currently accepted by Curyo governance.",
  );
});

test("resolveSelfVerificationErrorMessage explains sanctions clearance failures", () => {
  assert.equal(
    resolveSelfVerificationErrorMessage({
      error_code: "SanctionsCheckFailed()",
      reason: "Transaction failed with error: SanctionsCheckFailed()",
    }),
    "Self could not confirm sanctions clearance for this verification.",
  );
});

test("resolveSelfVerificationErrorMessage explains minimum age failures", () => {
  assert.equal(
    resolveSelfVerificationErrorMessage({
      error_code: "MinimumAgeNotMet()",
      reason: "Transaction failed with error: MinimumAgeNotMet()",
    }),
    "You must be at least 18 to claim from the faucet.",
  );
});

test("resolveSelfVerificationErrorMessage explains restricted country failures", () => {
  assert.equal(
    resolveSelfVerificationErrorMessage({
      error_code: "InvalidForbiddenCountriesList",
      reason: "Self configuration mismatch: InvalidForbiddenCountriesList",
    }),
    "This faucet claim is not available from restricted sanctioned-country jurisdictions.",
  );
});

test("resolveSelfVerificationErrorMessage keeps the existing passport reuse guidance", () => {
  assert.equal(
    resolveSelfVerificationErrorMessage({
      error_code: "NullifierAlreadyUsed()",
      reason: "Transaction failed with error: NullifierAlreadyUsed()",
    }),
    "This document has already been used to verify. Each supported Self credential can only be used once.",
  );
});

test("resolveSelfVerificationErrorMessage falls back to the provided reason", () => {
  assert.equal(
    resolveSelfVerificationErrorMessage({
      reason: "Verification service unavailable",
    }),
    "Verification service unavailable",
  );
});
