type SelfVerificationError = {
  error_code?: string;
  reason?: string;
};

function getSelfVerificationErrorCode(error: SelfVerificationError | null | undefined): string {
  return error?.error_code || error?.reason || "";
}

export function resolveSelfVerificationErrorMessage(error: SelfVerificationError | null | undefined): string {
  const code = getSelfVerificationErrorCode(error);

  if (code.includes("UnsupportedDocumentType")) {
    return "Use a passport or biometric ID card in Self.";
  }

  if (code.includes("AgeTooYoung")) {
    return "You must be at least 18 to claim from the faucet.";
  }

  if (code.includes("NullifierAlreadyUsed")) {
    return "This document has already been used to verify. Each passport or biometric ID card can only be used once.";
  }

  if (code.includes("InvalidUserIdentifier")) {
    return "Wallet address mismatch. Make sure you're connected with the correct wallet.";
  }

  if (code.includes("InsufficientFaucetBalance")) {
    return "The faucet is currently empty. Please try again later.";
  }

  return error?.reason || "Verification failed. Please try again.";
}
