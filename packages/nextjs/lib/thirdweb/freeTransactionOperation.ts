import { type Hex, getAddress, isAddress, isHex, keccak256, stringToHex, toHex } from "viem";

export type FreeTransactionOperationCall = {
  data?: Hex;
  to: `0x${string}`;
  value?: bigint | Hex;
};

function normalizeHex(value: Hex | undefined, fallback: Hex): Hex {
  if (!value) {
    return fallback;
  }

  return (value.startsWith("0x") ? value.toLowerCase() : `0x${value}`.toLowerCase()) as Hex;
}

function normalizeValue(value: bigint | Hex | undefined): Hex | null {
  if (typeof value === "bigint") {
    return toHex(value);
  }

  if (typeof value === "string") {
    return isHex(value) ? normalizeHex(value, "0x0") : null;
  }

  return "0x0";
}

export function buildFreeTransactionOperationKey(params: {
  chainId: number;
  calls: readonly FreeTransactionOperationCall[];
  sender: string;
}): Hex | null {
  if (!Number.isFinite(params.chainId) || !isAddress(params.sender) || params.calls.length === 0) {
    return null;
  }

  const normalizedCalls = params.calls.map(call => {
    if (!isAddress(call.to)) {
      return null;
    }

    if (call.data && !isHex(call.data)) {
      return null;
    }

    const normalizedValue = normalizeValue(call.value);
    if (!normalizedValue) {
      return null;
    }

    return {
      data: normalizeHex(call.data, "0x"),
      to: getAddress(call.to).toLowerCase(),
      value: normalizedValue,
    };
  });

  if (normalizedCalls.some(call => call === null)) {
    return null;
  }

  return keccak256(
    stringToHex(
      JSON.stringify({
        calls: normalizedCalls,
        chainId: params.chainId,
        sender: getAddress(params.sender).toLowerCase(),
      }),
    ),
  );
}
