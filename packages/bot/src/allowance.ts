import { publicClient } from "./client.js";
import { contractConfig } from "./contracts.js";
import type { Hex } from "viem";

type AllowanceWallet = {
  writeContract: (parameters: Record<string, unknown>) => Promise<Hex>;
};

export async function ensureCrepAllowance(params: {
  owner: `0x${string}`;
  spender: `0x${string}`;
  requiredAmount: bigint;
  wallet: AllowanceWallet;
}): Promise<Hex | null> {
  const currentAllowance = (await publicClient.readContract({
    ...contractConfig.token,
    functionName: "allowance",
    args: [params.owner, params.spender],
  })) as bigint;

  if (currentAllowance >= params.requiredAmount) {
    return null;
  }

  const approveTx = await params.wallet.writeContract({
    ...contractConfig.token,
    functionName: "approve",
    args: [params.spender, params.requiredAmount],
  });
  await publicClient.waitForTransactionReceipt({ hash: approveTx });
  return approveTx;
}
