const TRANSACTION_PENDING_SUFFIX =
  "This can take a few seconds. Some wallets show an approval step, others submit without a popup.";

type TransactionStatusCopy = {
  title: string;
  description: string;
};

export function getSubmittingTransactionStatus(action: string): TransactionStatusCopy {
  return {
    title: `Submitting ${action}`,
    description: TRANSACTION_PENDING_SUFFIX,
  };
}

export function getSubmittingTransactionMessage(action: string) {
  const { title, description } = getSubmittingTransactionStatus(action);
  return `${title}. ${description}`;
}

export const TRANSACTION_CONFIRMING_STATUS: TransactionStatusCopy = {
  title: "Transaction sent",
  description: "Waiting for blockchain confirmation.",
};
