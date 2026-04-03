export type RpcSendResult =
  | { status: "success"; txHash: `0x${string}` }
  | { status: "reverted"; txHash: `0x${string}`; reason: string }
  | { status: "unknown"; txHash?: `0x${string}`; error: string };

export function isRetryableDirectCommitSendResult(result: RpcSendResult): boolean {
  if (result.status === "reverted") {
    return true;
  }

  return result.status === "unknown" && result.txHash == null;
}
