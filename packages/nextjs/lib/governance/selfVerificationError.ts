type SelfVerificationError = {
  error_code?: string;
  reason?: string;
};

function getSelfVerificationErrorCode(error: SelfVerificationError | null | undefined): string {
  return error?.error_code || error?.reason || "";
}

export function resolveSelfVerificationErrorMessage(error: SelfVerificationError | null | undefined): string {
  const code = getSelfVerificationErrorCode(error);

  if (code.includes("MinimumAgeNotMet") || code.includes("InvalidMinimumAge")) {
    return "You must be at least 18 to claim from the faucet.";
  }

  if (code.includes("InvalidForbiddenCountriesList") || code.includes("ForbiddenCountries")) {
    return "This faucet claim is not available from restricted sanctioned-country jurisdictions.";
  }

  if (code.includes("UnsupportedDocumentType")) {
    return "This Self credential is not currently accepted by Curyo governance.";
  }

  if (code.includes("SanctionsCheckFailed") || code.includes("InvalidOfac")) {
    return "Self could not confirm sanctions clearance for this verification.";
  }

  if (code.includes("NullifierAlreadyUsed")) {
    return "This document has already been used to verify. Each supported Self credential can only be used once.";
  }

  if (code.includes("InvalidUserIdentifier")) {
    return "Wallet address mismatch. Make sure you're connected with the correct wallet.";
  }

  if (code.includes("InsufficientFaucetBalance")) {
    return "The faucet is currently empty. Please try again later.";
  }

  return error?.reason || "Verification failed. Please try again.";
}
