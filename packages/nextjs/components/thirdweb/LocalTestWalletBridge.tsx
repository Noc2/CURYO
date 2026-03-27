"use client";

import { useEffect, useMemo, useRef } from "react";
import { defineChain } from "thirdweb";
import { useActiveAccount, useConnect as useThirdwebConnect } from "thirdweb/react";
import { foundry } from "viem/chains";
import { useAccount } from "wagmi";
import { useTargetNetwork } from "~~/hooks/scaffold-eth/useTargetNetwork";
import { useThirdwebWagmiSync } from "~~/hooks/useThirdwebWagmiSync";
import scaffoldConfig from "~~/scaffold.config";
import { useGlobalState } from "~~/services/store/store";
import { thirdwebClient } from "~~/services/thirdweb/client";
import { createLocalTestWallet } from "~~/services/thirdweb/localTestWallet";
import { CURYO_E2E_TEST_WALLET_PRIVATE_KEY_STORAGE_KEY } from "~~/services/thirdweb/testWalletStorage";
import { isLocalE2EWalletBridgeEnabled } from "~~/utils/env/e2eProduction";
import { publicEnv } from "~~/utils/env/public";
import { NETWORKS_EXTRA_DATA } from "~~/utils/scaffold-eth";

const LOCAL_TEST_CHAIN_ID = 31337;
const allowLocalE2EProductionBuild = process.env.NEXT_PUBLIC_CURYO_E2E_PRODUCTION_BUILD === "true";

function isLocalTestWalletEnabled() {
  if (typeof window === "undefined") {
    return false;
  }

  return isLocalE2EWalletBridgeEnabled({
    hostname: window.location.hostname,
    isProduction: publicEnv.isProduction,
    localE2EProductionBuild: allowLocalE2EProductionBuild,
  });
}

export function LocalTestWalletBridge() {
  const { targetNetwork } = useTargetNetwork();
  const { address } = useAccount();
  const activeThirdwebAccount = useActiveAccount();
  const { connect } = useThirdwebConnect();
  const { syncWalletToWagmi } = useThirdwebWagmiSync();
  const setTargetNetwork = useGlobalState(state => state.setTargetNetwork);
  const isSyncingRef = useRef(false);
  const thirdwebTargetChain = useMemo(() => defineChain(targetNetwork), [targetNetwork]);

  useEffect(() => {
    if (!isLocalTestWalletEnabled() || !thirdwebClient) {
      return;
    }

    const privateKey = window.localStorage.getItem(CURYO_E2E_TEST_WALLET_PRIVATE_KEY_STORAGE_KEY)?.trim();
    if (!privateKey) {
      return;
    }

    if (targetNetwork.id !== LOCAL_TEST_CHAIN_ID) {
      const localTestNetwork =
        scaffoldConfig.targetNetworks.find(network => network.id === LOCAL_TEST_CHAIN_ID) ?? foundry;
      setTargetNetwork({
        ...localTestNetwork,
        ...NETWORKS_EXTRA_DATA[LOCAL_TEST_CHAIN_ID],
      });
      return;
    }

    if (thirdwebTargetChain.id !== LOCAL_TEST_CHAIN_ID) {
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
      let thirdwebConnected = activeThirdwebAccount?.address?.toLowerCase() === targetAddress;

      try {
        if (!thirdwebConnected) {
          await connect(wallet);
          thirdwebConnected = true;
        }
      } catch (error) {
        // Keep going: local E2E only needs the wagmi session for most flows.
        console.error("Failed to connect local test wallet to thirdweb", error);
      }

      try {
        if (!cancelled && address?.toLowerCase() !== targetAddress) {
          await syncWalletToWagmi(wallet, thirdwebTargetChain.id);
        }
      } catch (error) {
        console.error("Failed to sync local test wallet to wagmi", error);
      } finally {
        isSyncingRef.current = false;
      }
    })();

    return () => {
      cancelled = true;
      isSyncingRef.current = false;
    };
  }, [
    activeThirdwebAccount?.address,
    address,
    connect,
    setTargetNetwork,
    syncWalletToWagmi,
    targetNetwork.id,
    thirdwebTargetChain,
  ]);

  return null;
}
