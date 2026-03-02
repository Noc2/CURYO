"use client";

import { useEffect, useState } from "react";
import { Address, AddressInput, Balance, EtherInput } from "@scaffold-ui/components";
import { useQueryClient } from "@tanstack/react-query";
import { Address as AddressType, createPublicClient, createWalletClient, http, parseUnits } from "viem";
import { hardhat } from "viem/chains";
import { useAccount } from "wagmi";
import { GiftIcon } from "@heroicons/react/24/outline";
import deployedContracts from "~~/contracts/deployedContracts";
import { useTargetNetwork, useTransactor } from "~~/hooks/scaffold-eth";
import { notification } from "~~/utils/scaffold-eth";

// Account index to use from generated hardhat accounts.
const FAUCET_ACCOUNT_INDEX = 0;

// cREP token has 6 decimals
const CREP_DECIMALS = 6;

const localWalletClient = createWalletClient({
  chain: hardhat,
  transport: http(),
});

const localPublicClient = createPublicClient({
  chain: hardhat,
  transport: http(),
});

// Minimal ABI for CuryoReputation token functions we need
const curyoBetaAbi = [
  {
    type: "function",
    name: "mint",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "transfer",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "balanceOf",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
] as const;

// Minimal ABI for VoterIdNFT functions we need
const voterIdNFTAbi = [
  {
    type: "function",
    name: "mint",
    inputs: [
      { name: "to", type: "address" },
      { name: "nullifier", type: "uint256" },
    ],
    outputs: [{ name: "tokenId", type: "uint256" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "hasVoterId",
    inputs: [{ name: "holder", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getTokenId",
    inputs: [{ name: "holder", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
] as const;

/**
 * Faucet modal which lets you send ETH and claim cREP tokens on local testnet.
 */
export const Faucet = () => {
  const [loading, setLoading] = useState(false);
  const [curyoLoading, setCuryoLoading] = useState(false);
  const [voterIdLoading, setVoterIdLoading] = useState(false);
  const [inputAddress, setInputAddress] = useState<AddressType>();
  const [faucetAddress, setFaucetAddress] = useState<AddressType>();
  const [sendValue, setSendValue] = useState("");
  const [curyoAmount, setCuryoAmount] = useState("1000");
  const [hasVoterId, setHasVoterId] = useState<boolean | null>(null);
  const [voterIdTokenId, setVoterIdTokenId] = useState<bigint | null>(null);
  const { targetNetwork } = useTargetNetwork();

  const { chain: ConnectedChain, address: connectedAddress } = useAccount();

  const isHardhat = ConnectedChain?.id === hardhat.id;

  const faucetTxn = useTransactor(localWalletClient);
  const queryClient = useQueryClient();

  // Get contract addresses from localhost deployment
  const crepTokenAddress = (deployedContracts as any)[31337]?.CuryoReputation?.address as AddressType | undefined;
  const voterIdNFTAddress = (deployedContracts as any)[31337]?.VoterIdNFT?.address as AddressType | undefined;

  useEffect(() => {
    if (!isHardhat) return;
    const getFaucetAddress = async () => {
      try {
        const accounts = await localWalletClient.getAddresses();
        setFaucetAddress(accounts[FAUCET_ACCOUNT_INDEX]);
      } catch {
        notification.error(
          <>
            <p className="font-bold mt-0 mb-1">Cannot connect to local provider</p>
            <p className="m-0">
              - Did you forget to run <code className="italic bg-base-300 text-base font-bold">yarn chain</code> ?
            </p>
            <p className="mt-1 break-normal">
              - Or you can change <code className="italic bg-base-300 text-base font-bold">targetNetwork</code> in{" "}
              <code className="italic bg-base-300 text-base font-bold">scaffold.config.ts</code>
            </p>
          </>,
        );
      }
    };
    getFaucetAddress();
  }, [isHardhat]);

  // Set input address to connected address by default
  useEffect(() => {
    if (connectedAddress && !inputAddress) {
      setInputAddress(connectedAddress);
    }
  }, [connectedAddress, inputAddress]);

  // Check if inputAddress has a Voter ID
  useEffect(() => {
    const checkVoterId = async () => {
      if (!inputAddress || !voterIdNFTAddress) {
        setHasVoterId(null);
        setVoterIdTokenId(null);
        return;
      }

      try {
        const hasId = await localPublicClient.readContract({
          address: voterIdNFTAddress,
          abi: voterIdNFTAbi,
          functionName: "hasVoterId",
          args: [inputAddress],
        });
        setHasVoterId(hasId);

        if (hasId) {
          const tokenId = await localPublicClient.readContract({
            address: voterIdNFTAddress,
            abi: voterIdNFTAbi,
            functionName: "getTokenId",
            args: [inputAddress],
          });
          setVoterIdTokenId(tokenId);
        } else {
          setVoterIdTokenId(null);
        }
      } catch (error) {
        console.error("Error checking Voter ID:", error);
        setHasVoterId(null);
        setVoterIdTokenId(null);
      }
    };

    checkVoterId();
  }, [inputAddress, voterIdNFTAddress, isHardhat]);

  const sendETH = async () => {
    if (!faucetAddress || !inputAddress) {
      return;
    }
    try {
      setLoading(true);
      await faucetTxn({
        to: inputAddress,
        value: parseUnits(sendValue as `${number}`, 18),
        account: faucetAddress,
      });
      setLoading(false);
      setSendValue("");
    } catch {
      setLoading(false);
    }
  };

  const claimCURYO = async () => {
    if (!inputAddress || !crepTokenAddress) {
      notification.error("Missing destination address or CuryoReputation contract");
      return;
    }

    const humanFaucetAddr = (deployedContracts as any)[31337]?.HumanFaucet?.address as AddressType | undefined;

    try {
      setCuryoLoading(true);
      const amount = parseUnits(curyoAmount, CREP_DECIMALS);

      if (humanFaucetAddr) {
        // Deploy script mints 100% of MAX_SUPPLY, so direct mint() reverts.
        // Instead, impersonate the HumanFaucet contract (holds ~52M cREP) and transfer.
        // The impersonated address needs ETH for gas.
        await (localPublicClient as any).request({
          method: "anvil_setBalance",
          params: [humanFaucetAddr, "0xDE0B6B3A7640000"], // 1 ETH
        });
        await (localPublicClient as any).request({
          method: "anvil_impersonateAccount",
          params: [humanFaucetAddr],
        });
        const txHash = await localWalletClient.writeContract({
          address: crepTokenAddress,
          abi: curyoBetaAbi,
          functionName: "transfer",
          args: [inputAddress, amount],
          account: humanFaucetAddr,
        });
        await localPublicClient.waitForTransactionReceipt({ hash: txHash });
        await (localPublicClient as any).request({
          method: "anvil_stopImpersonatingAccount",
          params: [humanFaucetAddr],
        });
      } else if (faucetAddress) {
        // Fallback: try mint (works only if supply allows)
        const txHash = await localWalletClient.writeContract({
          address: crepTokenAddress,
          abi: curyoBetaAbi,
          functionName: "mint",
          args: [inputAddress, amount],
          account: faucetAddress,
        });
        await localPublicClient.waitForTransactionReceipt({ hash: txHash });
      } else {
        notification.error("Missing faucet address");
        setCuryoLoading(false);
        return;
      }

      queryClient.invalidateQueries();
      notification.success(`Sent ${curyoAmount} cREP to ${inputAddress.slice(0, 6)}...${inputAddress.slice(-4)}`);
      setCuryoLoading(false);
    } catch (error: any) {
      notification.error(error?.message || "Failed to claim cREP tokens");
      setCuryoLoading(false);
    }
  };

  const claimVoterId = async () => {
    if (!inputAddress || !voterIdNFTAddress) {
      notification.error("Missing destination address or VoterIdNFT contract");
      return;
    }
    if (!faucetAddress) {
      notification.error("Missing faucet address");
      return;
    }

    if (hasVoterId) {
      notification.error("Address already has a Voter ID");
      return;
    }

    try {
      setVoterIdLoading(true);

      const nullifier = BigInt(inputAddress) ^ BigInt(Date.now());
      const mintHash = await localWalletClient.writeContract({
        address: voterIdNFTAddress,
        abi: voterIdNFTAbi,
        functionName: "mint",
        args: [inputAddress, nullifier],
        account: faucetAddress,
      });
      await localPublicClient.waitForTransactionReceipt({ hash: mintHash });

      const tokenId = await localPublicClient.readContract({
        address: voterIdNFTAddress,
        abi: voterIdNFTAbi,
        functionName: "getTokenId",
        args: [inputAddress],
      });
      setHasVoterId(true);
      setVoterIdTokenId(tokenId);
      notification.success(`Minted Voter ID #${tokenId} to ${inputAddress.slice(0, 6)}...${inputAddress.slice(-4)}`);

      setVoterIdLoading(false);
    } catch (error: any) {
      notification.error(error?.message || "Failed to mint Voter ID");
      setVoterIdLoading(false);
    }
  };

  // Only render on localhost (hardhat)
  if (!isHardhat) {
    return null;
  }

  return (
    <div className="w-full">
      <label
        htmlFor="faucet-modal"
        className="flex items-center justify-center xl:justify-start gap-3 xl:px-4 py-3 rounded-xl transition-colors text-base-content/60 hover:text-base-content hover:bg-base-200 w-full cursor-pointer"
      >
        <GiftIcon className="w-6 h-6 shrink-0" />
        <span className="hidden xl:inline">Faucet</span>
      </label>
      <input type="checkbox" id="faucet-modal" className="modal-toggle" />
      <label htmlFor="faucet-modal" className="modal cursor-pointer">
        <label className="modal-box relative">
          {/* dummy input to capture event onclick on modal box */}
          <input className="h-0 w-0 absolute top-0 left-0" />
          <h3 className="text-xl font-bold mb-3">Local Testnet Faucet</h3>
          <label htmlFor="faucet-modal" className="btn btn-ghost btn-sm btn-circle absolute right-3 top-3">
            ✕
          </label>
          <div className="space-y-4">
            {/* Destination Address */}
            <div>
              <span className="text-base font-bold">Destination Address:</span>
              <AddressInput
                placeholder="Destination Address"
                value={inputAddress ?? ""}
                onChange={value => setInputAddress(value as AddressType)}
              />
            </div>

            {/* Faucet Info + ETH Section (hardhat only) */}
            {isHardhat && (
              <>
                <div className="flex space-x-4">
                  <div>
                    <span className="text-base font-bold">From:</span>
                    <Address
                      address={faucetAddress}
                      onlyEnsOrAddress
                      blockExplorerAddressLink={
                        targetNetwork.id === hardhat.id ? `/blockexplorer/address/${faucetAddress}` : undefined
                      }
                    />
                  </div>
                  <div>
                    <span className="text-base font-bold pl-3">ETH Available:</span>
                    <Balance address={faucetAddress} />
                  </div>
                </div>

                <div className="bg-base-200 rounded-xl p-4 space-y-3">
                  <h4 className="font-semibold">Send ETH</h4>
                  <EtherInput
                    placeholder="Amount to send"
                    onValueChange={({ valueInEth }) => setSendValue(valueInEth)}
                    style={{ width: "100%" }}
                  />
                  <button
                    className="h-10 btn btn-outline btn-sm px-4 rounded-full w-full"
                    onClick={sendETH}
                    disabled={loading || !sendValue}
                  >
                    {!loading ? (
                      <GiftIcon className="h-5 w-5" />
                    ) : (
                      <span className="loading loading-spinner loading-sm"></span>
                    )}
                    <span>Send ETH</span>
                  </button>
                </div>
              </>
            )}

            {/* cREP Faucet Section */}
            <div className="bg-primary/10 rounded-xl p-4 space-y-3">
              <h4 className="font-semibold text-primary">Claim cREP Tokens</h4>
              <p className="text-base text-base-content/60">Mint cREP tokens directly to your wallet for testing.</p>
              <div className="flex gap-2">
                <input
                  type="number"
                  className="input input-bordered input-sm flex-1"
                  placeholder="Amount"
                  value={curyoAmount}
                  onChange={e => setCuryoAmount(e.target.value)}
                  min="1"
                />
                <span className="self-center text-base font-medium">cREP</span>
              </div>
              <button
                className="h-10 btn btn-primary btn-sm px-4 rounded-full w-full"
                onClick={claimCURYO}
                disabled={curyoLoading || !curyoAmount || !inputAddress}
              >
                {!curyoLoading ? (
                  <GiftIcon className="h-5 w-5" />
                ) : (
                  <span className="loading loading-spinner loading-sm"></span>
                )}
                <span>Claim cREP</span>
              </button>
            </div>

            {/* Voter ID Section */}
            <div className="bg-secondary/10 rounded-xl p-4 space-y-3">
              <h4 className="font-semibold text-secondary">Claim Voter ID</h4>
              <p className="text-base text-base-content/60">
                Create a non-transferable Voter ID. Required for voting and submitting content.
              </p>
              {hasVoterId === true && voterIdTokenId !== null ? (
                <div className="flex items-center gap-2 text-success">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span className="font-medium">Voter ID #{voterIdTokenId.toString()} owned</span>
                </div>
              ) : (
                <button
                  className="h-10 btn btn-secondary btn-sm px-4 rounded-full w-full"
                  onClick={claimVoterId}
                  disabled={voterIdLoading || !inputAddress || hasVoterId === true}
                >
                  {!voterIdLoading ? (
                    <GiftIcon className="h-5 w-5" />
                  ) : (
                    <span className="loading loading-spinner loading-sm"></span>
                  )}
                  <span>Claim Voter ID</span>
                </button>
              )}
            </div>
          </div>
        </label>
      </label>
    </div>
  );
};
