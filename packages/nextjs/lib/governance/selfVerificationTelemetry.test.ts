import { extractSelfVerificationErrorTelemetry, sanitizeSelfVerificationTelemetry } from "./selfVerificationTelemetry";
import assert from "node:assert/strict";
import test from "node:test";

test("sanitizeSelfVerificationTelemetry keeps operational fields and drops raw proof data", () => {
  const sanitized = sanitizeSelfVerificationTelemetry({
    attemptId: "attempt-1",
    contractAddress: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
    endpointType: "celo",
    errorMessage: "Proof generation failed",
    event: "self_verification_failed",
    requiredChainId: 42220,
    sdkVersion: "1.0.22",
    signature: "0xshould-not-be-kept",
    userDefinedData: "0xshould-not-be-kept",
    walletAddress: "0x1234567890abcdef1234567890abcdef12345678",
    walletChainId: 42220,
    walletId: "io.metamask",
  });

  assert.ok(sanitized);
  assert.equal(sanitized.event, "self_verification_failed");
  assert.equal(sanitized.contractAddress, "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd");
  assert.equal(sanitized.walletAddress, "0x1234567890abcdef1234567890abcdef12345678");
  assert.equal(sanitized.requiredChainId, 42220);
  assert.equal((sanitized as Record<string, unknown>).signature, undefined);
  assert.equal((sanitized as Record<string, unknown>).userDefinedData, undefined);
});

test("sanitizeSelfVerificationTelemetry rejects unknown event names", () => {
  assert.equal(
    sanitizeSelfVerificationTelemetry({
      event: "passport_data_uploaded",
    }),
    null,
  );
});

test("extractSelfVerificationErrorTelemetry normalizes Self and wallet error fields", () => {
  assert.deepEqual(
    extractSelfVerificationErrorTelemetry({
      error_code: "error",
      message: "MetaMask - RPC Error",
      reason: "proof_generation_failed",
      status: "proof_generation_failed",
    }),
    {
      errorCode: "error",
      errorMessage: "MetaMask - RPC Error",
      errorName: null,
      errorReason: "proof_generation_failed",
      errorStatus: "proof_generation_failed",
    },
  );
});
