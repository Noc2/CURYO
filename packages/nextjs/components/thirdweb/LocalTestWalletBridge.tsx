"use client";

import { useEffect, useMemo, useRef } from "react";
import { defineChain } from "thirdweb";
import { useActiveAccount, useConnect as useThirdwebConnect } from "thirdweb/react";
import { useAccount } from "wagmi";
import { useTargetNetwork } from "~~/hooks/scaffold-eth/useTargetNetwork";
import { useThirdwebWagmiSync } from "~~/hooks/useThirdwebWagmiSync";
import { thirdwebClient } from "~~/services/thirdweb/client";
import { createLocalTestWallet } from "~~/services/thirdweb/localTestWallet";
import { CURYO_E2E_TEST_WALLET_PRIVATE_KEY_STORAGE_KEY } from "~~/services/thirdweb/testWalletStorage";
import { publicEnv } from "~~/utils/env/public";

const LOCALHOST_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1"]);
const LOCAL_TEST_CHAIN_ID = 31337;

function isLocalTestWalletEnabled() {
  if (typeof window === "undefined") {
    return false;
  }

  return !publicEnv.isProduction && LOCALHOST_HOSTNAMES.has(window.location.hostname);
}

export function LocalTestWalletBridge() {
  const { targetNetwork } = useTargetNetwork();
  const { address } = useAccount();
  const activeThirdwebAccount = useActiveAccount();
  const { connect } = useThirdwebConnect();
  const { syncWalletToWagmi } = useThirdwebWagmiSync();
  const isSyncingRef = useRef(false);
  const thirdwebTargetChain = useMemo(() => defineChain(targetNetwork), [targetNetwork]);

  useEffect(() => {
    if (!isLocalTestWalletEnabled() || !thirdwebClient || thirdwebTargetChain.id !== LOCAL_TEST_CHAIN_ID) {
      return;
    }

    const privateKey = window.localStorage.getItem(CURYO_E2E_TEST_WALLET_PRIVATE_KEY_STORAGE_KEY)?.trim();
    if (!privateKey) {
      return;
    }

    const wallet = createLocalTestWallet({
      chain: thirdwebTargetChain,
      client: thirdwebClient,
      privateKey,
    });
    const targetAddress = wallet.getAccount()?.address?.toLowerCase();

    if (!targetAddress) {
      return;
    }

    if (address?.toLowerCase() === targetAddress && activeThirdwebAccount?.address?.toLowerCase() === targetAddress) {
      return;
    }

    if (isSyncingRef.current) {
      return;
    }

    let cancelled = false;
    isSyncingRef.current = true;

    void (async () => {
      try {
        if (activeThirdwebAccount?.address?.toLowerCase() !== targetAddress) {
          await connect(wallet);
        }

        if (!cancelled && address?.toLowerCase() !== targetAddress) {
          await syncWalletToWagmi(wallet, thirdwebTargetChain.id);
        }
      } catch (error) {
        console.error("Failed to connect local test wallet", error);
      } finally {
        isSyncingRef.current = false;
      }
    })();

    return () => {
      cancelled = true;
      isSyncingRef.current = false;
    };
  }, [activeThirdwebAccount?.address, address, connect, syncWalletToWagmi, thirdwebTargetChain]);

  return null;
}
