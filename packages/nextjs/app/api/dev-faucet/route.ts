import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, createWalletClient, http, parseUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { hardhat } from "viem/chains";
import deployedContracts from "~~/contracts/deployedContracts";
import { getKeystoreAccount } from "~~/utils/keystore";

// Only available in development on localhost chain
const DEV_FAUCET_ENABLED = process.env.DEV_FAUCET_ENABLED === "true" && process.env.NODE_ENV === "development";

const CREP_DECIMALS = 6;
const MAX_MINT_AMOUNT = 10_000; // Cap per request

const mintERC20Abi = [
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
] as const;

const mintVoterIdAbi = [
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
] as const;

const hasVoterIdAbi = [
  {
    type: "function",
    name: "hasVoterId",
    inputs: [{ name: "holder", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
] as const;

export async function POST(request: NextRequest) {
  if (!DEV_FAUCET_ENABLED) {
    return NextResponse.json({ error: "Dev faucet is disabled" }, { status: 403 });
  }

  try {
    const { address, action, amount } = await request.json();

    if (!address || !action) {
      return NextResponse.json({ error: "Missing address or action" }, { status: 400 });
    }

    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      return NextResponse.json({ error: "Invalid wallet address" }, { status: 400 });
    }

    if (!["mint-crep", "mint-voter-id"].includes(action)) {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    // Resolve deployer account: keystore first, then raw private key fallback
    const faucetPrivateKey = process.env.FAUCET_PRIVATE_KEY;
    const account =
      getKeystoreAccount() ?? (faucetPrivateKey ? privateKeyToAccount(faucetPrivateKey as `0x${string}`) : null);

    if (!account) {
      console.error("[DevFaucet] No keystore or FAUCET_PRIVATE_KEY configured");
      return NextResponse.json({ error: "Dev faucet not configured" }, { status: 500 });
    }

    const HARDHAT_CHAIN_ID = hardhat.id; // 31337
    const contracts = (deployedContracts as any)[HARDHAT_CHAIN_ID];
    if (!contracts) {
      return NextResponse.json({ error: "No contracts deployed on localhost" }, { status: 500 });
    }

    const rpcUrl = "http://127.0.0.1:8545";

    const walletClient = createWalletClient({
      account,
      chain: hardhat,
      transport: http(rpcUrl),
    });

    const publicClient = createPublicClient({
      chain: hardhat,
      transport: http(rpcUrl),
    });

    if (action === "mint-crep") {
      const crepAddress = contracts.CuryoReputation?.address;
      if (!crepAddress) {
        return NextResponse.json({ error: "CuryoReputation not deployed on localhost" }, { status: 500 });
      }

      const requestedAmount = Number(amount) || 1000;
      if (requestedAmount <= 0 || requestedAmount > MAX_MINT_AMOUNT) {
        return NextResponse.json({ error: `Amount must be between 1 and ${MAX_MINT_AMOUNT}` }, { status: 400 });
      }
      const mintAmount = parseUnits(requestedAmount.toString(), CREP_DECIMALS);

      const txHash = await walletClient.writeContract({
        address: crepAddress,
        abi: mintERC20Abi,
        functionName: "mint",
        args: [address as `0x${string}`, mintAmount],
      });

      await publicClient.waitForTransactionReceipt({ hash: txHash });

      return NextResponse.json({
        success: true,
        txHash,
        action: "mint-crep",
        amount: requestedAmount.toString(),
      });
    }

    if (action === "mint-voter-id") {
      const voterIdAddress = contracts.VoterIdNFT?.address;
      if (!voterIdAddress) {
        return NextResponse.json({ error: "VoterIdNFT not deployed on localhost" }, { status: 500 });
      }

      const hasId = await publicClient.readContract({
        address: voterIdAddress,
        abi: hasVoterIdAbi,
        functionName: "hasVoterId",
        args: [address as `0x${string}`],
      });

      if (hasId) {
        return NextResponse.json({ error: "Address already has a Voter ID" }, { status: 409 });
      }

      const nullifier = BigInt(address) ^ BigInt(Date.now());

      const txHash = await walletClient.writeContract({
        address: voterIdAddress,
        abi: mintVoterIdAbi,
        functionName: "mint",
        args: [address as `0x${string}`, nullifier],
      });

      await publicClient.waitForTransactionReceipt({ hash: txHash });

      return NextResponse.json({
        success: true,
        txHash,
        action: "mint-voter-id",
      });
    }
  } catch (error: any) {
    console.error("[DevFaucet] Error:", error);
    return NextResponse.json(
      { error: error?.shortMessage || error?.message || "Failed to execute dev faucet action" },
      { status: 500 },
    );
  }
}
