import {
  getGasBalanceErrorMessage,
  isFreeTransactionExhaustedError,
  isInsufficientFundsError,
  isUnsupportedRpcMethodError,
} from "./transactionErrors";

export type ClaimTransactionFeedbackContext = {
  canSponsorTransactions: boolean;
  freeTransactionRemaining: number;
  freeTransactionVerified: boolean;
  isAwaitingSponsoredWalletReconnect: boolean;
  isMissingGasBalance: boolean;
  nativeTokenSymbol: string;
};

export function getClaimGasErrorMessage(
  context: Pick<
    ClaimTransactionFeedbackContext,
    "canSponsorTransactions" | "freeTransactionRemaining" | "freeTransactionVerified" | "nativeTokenSymbol"
  >,
) {
  if (context.freeTransactionVerified && context.freeTransactionRemaining === 0) {
    return `Free transactions used up. Add some ${context.nativeTokenSymbol} for gas, then retry.`;
  }

  return getGasBalanceErrorMessage(context.nativeTokenSymbol, {
    canSponsorTransactions: context.canSponsorTransactions,
  });
}

export function getClaimPreflightErrorMessage(context: ClaimTransactionFeedbackContext) {
  if (context.isAwaitingSponsoredWalletReconnect) {
    return "Wallet reconnecting. Retry in a moment.";
  }

  if (context.isMissingGasBalance) {
    return getClaimGasErrorMessage(context);
  }

  return null;
}

export function isClaimGasShortageError(
  error: unknown,
  context: Pick<ClaimTransactionFeedbackContext, "freeTransactionRemaining" | "freeTransactionVerified">,
) {
  if (isFreeTransactionExhaustedError(error) || isInsufficientFundsError(error)) {
    return true;
  }

  return (
    context.freeTransactionVerified && context.freeTransactionRemaining === 0 && isUnsupportedRpcMethodError(error)
  );
}
