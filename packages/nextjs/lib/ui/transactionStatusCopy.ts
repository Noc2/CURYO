const TRANSACTION_PENDING_SUFFIX =
  "This can take a few seconds. Some wallets show an approval step, others submit without a popup.";

export function getSubmittingTransactionMessage(action: string) {
  return `Submitting ${action}. ${TRANSACTION_PENDING_SUFFIX}`;
}

export const TRANSACTION_CONFIRMING_MESSAGE = "Transaction sent. Waiting for blockchain confirmation.";
