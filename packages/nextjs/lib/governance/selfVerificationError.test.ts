import { resolveSelfVerificationErrorMessage } from "./selfVerificationError";
import assert from "node:assert/strict";
import test from "node:test";

test("resolveSelfVerificationErrorMessage shows a clear underage message", () => {
  assert.equal(
    resolveSelfVerificationErrorMessage({
      error_code: "AgeTooYoung()",
      reason: "Transaction failed with error: AgeTooYoung()",
    }),
    "You must be at least 18 to claim from the faucet.",
  );
});

test("resolveSelfVerificationErrorMessage keeps the existing passport reuse guidance", () => {
  assert.equal(
    resolveSelfVerificationErrorMessage({
      error_code: "NullifierAlreadyUsed()",
      reason: "Transaction failed with error: NullifierAlreadyUsed()",
    }),
    "This passport has already been used to verify. Each passport can only be used once.",
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
