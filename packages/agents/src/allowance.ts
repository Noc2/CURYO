import { publicClient } from "./client.js";
import { contractConfig } from "./contracts.js";
import type { Abi, Hex } from "viem";

type AllowanceWallet = {
  writeContract: (parameters: Record<string, unknown>) => Promise<Hex>;
};

export async function ensureHrepAllowance(params: {
  owner: `0x${string}`;
  spender: `0x${string}`;
  requiredAmount: bigint;
  token?: { address: `0x${string}`; abi: Abi };
  wallet: AllowanceWallet;
}): Promise<Hex | null> {
  const token = params.token ?? contractConfig.token;
  const currentAllowance = (await publicClient.readContract({
    ...token,
    functionName: "allowance",
    args: [params.owner, params.spender],
  })) as bigint;

  if (currentAllowance >= params.requiredAmount) {
    return null;
  }

  const approveTx = await params.wallet.writeContract({
    ...token,
    functionName: "approve",
    args: [params.spender, params.requiredAmount],
  });
  await publicClient.waitForTransactionReceipt({ hash: approveTx });
  return approveTx;
}
