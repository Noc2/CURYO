import {
  getGasBalanceErrorMessage,
  isFreeTransactionExhaustedError,
  isInsufficientFundsError,
  isUnsupportedRpcMethodError,
} from "./transactionErrors";

export type ClaimTransactionFeedbackContext = {
  canShowFreeTransactionAllowance: boolean;
  canSponsorTransactions: boolean;
  freeTransactionRemaining: number;
  freeTransactionVerified: boolean;
  hasNativeGasBalance: boolean;
  isAwaitingFreeTransactionAllowance: boolean;
  isAwaitingSelfFundedWalletReconnect: boolean;
  isAwaitingSponsoredWalletReconnect: boolean;
  isMissingGasBalance: boolean;
  nativeTokenSymbol: string;
};

export function getClaimGasErrorMessage(
  context: Pick<
    ClaimTransactionFeedbackContext,
    | "canShowFreeTransactionAllowance"
    | "canSponsorTransactions"
    | "freeTransactionRemaining"
    | "freeTransactionVerified"
    | "hasNativeGasBalance"
    | "nativeTokenSymbol"
  >,
) {
  if (
    context.canShowFreeTransactionAllowance &&
    context.freeTransactionVerified &&
    context.freeTransactionRemaining === 0
  ) {
    if (context.hasNativeGasBalance) {
      return `Free transactions used up. Retry to use ${context.nativeTokenSymbol} for gas.`;
    }

    return `Free transactions used up. Add some ${context.nativeTokenSymbol} for gas, then retry.`;
  }

  return getGasBalanceErrorMessage(context.nativeTokenSymbol, {
    canSponsorTransactions: context.canSponsorTransactions,
  });
}

export function getClaimPreflightErrorMessage(context: ClaimTransactionFeedbackContext) {
  if (context.isAwaitingFreeTransactionAllowance) {
    return "Checking wallet gas mode. Retry in a moment.";
  }

  if (context.isAwaitingSelfFundedWalletReconnect) {
    return "Wallet switching to paid gas. Retry in a moment.";
  }

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
  context: Pick<
    ClaimTransactionFeedbackContext,
    "canShowFreeTransactionAllowance" | "freeTransactionRemaining" | "freeTransactionVerified"
  >,
) {
  if (isFreeTransactionExhaustedError(error) || isInsufficientFundsError(error)) {
    return true;
  }

  return (
    context.canShowFreeTransactionAllowance &&
    context.freeTransactionVerified &&
    context.freeTransactionRemaining === 0 &&
    isUnsupportedRpcMethodError(error)
  );
}
