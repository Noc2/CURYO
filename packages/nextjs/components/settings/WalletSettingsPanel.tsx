"use client";

import { defineChain } from "thirdweb";
import { BuyWidget } from "thirdweb/react";
import { formatEther, isAddress } from "viem";
import { celo } from "viem/chains";
import { useAccount, useBalance } from "wagmi";
import { ArrowsRightLeftIcon, BanknotesIcon, WalletIcon } from "@heroicons/react/24/outline";
import { useTargetNetwork } from "~~/hooks/scaffold-eth/useTargetNetwork";
import { useCuryoSwitchNetwork } from "~~/hooks/useCuryoSwitchNetwork";
import { thirdwebClient } from "~~/services/thirdweb/client";

const CELO_MAINNET_CHAIN_ID = 42220;
const DEFAULT_CELO_TOP_UP_AMOUNT = "1";
const CELO_TOP_UP_PRESET_OPTIONS: [number, number, number] = [5, 10, 20];
const THIRDWEB_CELO_CHAIN = defineChain(celo);

function formatCeloBalance(value: bigint | undefined) {
  if (value === undefined) return "Loading...";

  const formatted = Number(formatEther(value));
  return `${formatted.toLocaleString(undefined, {
    maximumFractionDigits: formatted >= 1 ? 3 : 6,
    minimumFractionDigits: 0,
  })} CELO`;
}

function shortAddress(value: string | undefined) {
  return value ? `${value.slice(0, 6)}...${value.slice(-4)}` : "Not connected";
}

export function WalletSettingsPanel({ address }: { address?: string }) {
  const { chain } = useAccount();
  const { targetNetwork } = useTargetNetwork();
  const { switchToChain, switchingChainId } = useCuryoSwitchNetwork();
  const walletAddress = address && isAddress(address) ? (address as `0x${string}`) : undefined;
  const targetIsCelo = targetNetwork.id === CELO_MAINNET_CHAIN_ID;
  const connectedToCelo = chain?.id === CELO_MAINNET_CHAIN_ID;
  const { data: celoBalance } = useBalance({
    address: walletAddress,
    chainId: CELO_MAINNET_CHAIN_ID,
    query: {
      enabled: Boolean(walletAddress && targetIsCelo),
    },
  });
  const canUseCeloTopUp = Boolean(thirdwebClient && walletAddress && targetIsCelo && connectedToCelo);

  const unavailableMessage = !thirdwebClient
    ? "CELO top-up is unavailable until thirdweb is configured for this deployment."
    : !targetIsCelo
      ? "CELO top-up is available on Celo mainnet deployments."
      : !connectedToCelo
        ? "Switch to Celo mainnet to buy CELO for gas."
        : "Connect a wallet to buy CELO for gas.";

  return (
    <section className="space-y-6">
      <div className="surface-card rounded-2xl p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-base-content/55">
              <WalletIcon className="h-4 w-4" />
              Wallet
            </div>
            <h2 className="mt-3 text-3xl font-semibold text-base-content sm:text-4xl">Gas and wallet funding</h2>
            <p className="mt-3 max-w-2xl text-base leading-relaxed text-base-content/65">
              Curyo uses Celo. External wallets need a small native CELO balance for transaction fees, while bounties
              and agent asks still use HREP or Celo USDC.
            </p>
          </div>

          <div className="rounded-2xl bg-base-300 px-4 py-3 text-sm text-base-content/70">
            <p className="font-medium text-base-content">{shortAddress(walletAddress)}</p>
            <p className="mt-1">{targetIsCelo ? formatCeloBalance(celoBalance?.value) : "Celo mainnet required"}</p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(340px,1.1fr)]">
        <div className="surface-card rounded-2xl p-6">
          <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-base-content/55">
            <BanknotesIcon className="h-4 w-4" />
            CELO for gas
          </div>
          <h3 className="mt-3 text-2xl font-semibold text-base-content">Top up network fees</h3>
          <p className="mt-3 text-base leading-relaxed text-base-content/65">
            Buy native CELO directly to the connected wallet. CELO covers Celo network gas for normal wallet
            transactions after sponsored Curyo Wallet transactions are used or unavailable.
          </p>

          {targetIsCelo && !connectedToCelo ? (
            <button
              type="button"
              className="btn btn-primary mt-5 gap-2"
              disabled={switchingChainId === CELO_MAINNET_CHAIN_ID}
              onClick={() => void switchToChain(CELO_MAINNET_CHAIN_ID)}
            >
              <ArrowsRightLeftIcon className="h-5 w-5" />
              {switchingChainId === CELO_MAINNET_CHAIN_ID ? "Switching..." : "Switch to Celo"}
            </button>
          ) : null}
        </div>

        <div className="min-w-0">
          {canUseCeloTopUp && thirdwebClient && walletAddress ? (
            <BuyWidget
              amount={DEFAULT_CELO_TOP_UP_AMOUNT}
              amountEditable
              buttonLabel="Add CELO"
              chain={THIRDWEB_CELO_CHAIN}
              client={thirdwebClient}
              description="Fund your connected wallet with native CELO for Celo gas costs."
              presetOptions={CELO_TOP_UP_PRESET_OPTIONS}
              receiverAddress={walletAddress}
              showThirdwebBranding={false}
              theme="dark"
              title="Add CELO"
              tokenEditable={false}
            />
          ) : (
            <div className="rounded-2xl border border-dashed border-base-300 bg-base-100/50 p-5">
              <p className="text-sm leading-relaxed text-base-content/65">{unavailableMessage}</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
