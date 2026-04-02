"use client";

import { useMemo } from "react";
import { type Address, type WalletClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { hardhat } from "viem/chains";
import {
  CURYO_E2E_RPC_URL_STORAGE_KEY,
  CURYO_E2E_TEST_WALLET_PRIVATE_KEY_STORAGE_KEY,
} from "~~/services/thirdweb/testWalletStorage";

const DEFAULT_LOCAL_TEST_RPC_URL = "http://127.0.0.1:8545";
const PRIVATE_KEY_PATTERN = /^0x[0-9a-fA-F]{64}$/;

function getStoredLocalE2EPrivateKey(): `0x${string}` | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }

  const value = window.localStorage.getItem(CURYO_E2E_TEST_WALLET_PRIVATE_KEY_STORAGE_KEY)?.trim();
  if (!value || !PRIVATE_KEY_PATTERN.test(value)) {
    return undefined;
  }

  return value as `0x${string}`;
}

function normalizeRpcUrl(value: string | null | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  try {
    return new URL(value.trim()).toString().replace(/\/$/, "");
  } catch {
    return undefined;
  }
}

export function getStoredLocalE2ETestWalletRpcUrl(
  storage: Pick<Storage, "getItem"> | undefined = typeof window === "undefined" ? undefined : window.localStorage,
) {
  if (!storage) {
    return undefined;
  }

  const storedValue = storage.getItem(CURYO_E2E_RPC_URL_STORAGE_KEY);
  if (!storedValue) {
    return DEFAULT_LOCAL_TEST_RPC_URL;
  }

  return normalizeRpcUrl(storedValue);
}

export function useLocalE2ETestWalletClient(address?: Address, chainId?: number): WalletClient | undefined {
  return useMemo(() => {
    if (chainId !== hardhat.id) {
      return undefined;
    }

    const privateKey = getStoredLocalE2EPrivateKey();
    if (!privateKey) {
      return undefined;
    }

    const account = privateKeyToAccount(privateKey);
    if (address && account.address.toLowerCase() !== address.toLowerCase()) {
      return undefined;
    }

    const rpcUrl = getStoredLocalE2ETestWalletRpcUrl();
    if (!rpcUrl) {
      return undefined;
    }

    return createWalletClient({
      account,
      chain: hardhat,
      transport: http(rpcUrl),
    });
  }, [address, chainId]);
}
