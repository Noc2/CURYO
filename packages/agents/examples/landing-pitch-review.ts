import { createCuryoAgentClient } from "@curyo/sdk/agent";
import { pathToFileURL } from "node:url";

const apiBaseUrl = process.env.CURYO_API_BASE_URL ?? "https://curyo.example";
const mcpAccessToken = process.env.CURYO_MCP_TOKEN;
const walletAddress = process.env.CURYO_AGENT_WALLET_ADDRESS;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function writeResultToMemory(memory: {
  clientRequestId: string;
  operationKey: string;
  publicUrl: string | null;
  answer: string;
  confidence: unknown;
}) {
  console.log("Persist this record in your agent memory store:", JSON.stringify(memory, null, 2));
}

export async function main() {
  if (!mcpAccessToken && !walletAddress) {
    throw new Error("Set CURYO_AGENT_WALLET_ADDRESS for wallet-direct asks, or CURYO_MCP_TOKEN for a managed agent.");
  }

  const agent = createCuryoAgentClient({
    apiBaseUrl,
    mcpAccessToken,
  });

  const clientRequestId = `landing-pitch-${Date.now()}`;
  const pitchUrl = process.env.CURYO_PITCH_URL ?? "https://example.com/landing-page";
  const bountyAmount = process.env.CURYO_BOUNTY_AMOUNT ?? "1000000";

  const question = {
    title: "Would this pitch make you want to learn more?",
    description:
      "Review the linked landing-page pitch. Vote up only if it is clear, credible, and interesting enough to keep reading.",
    contextUrl: pitchUrl,
    categoryId: "1",
    tags: ["agent", "landing-page", "pitch"],
  };

  const bounty = {
    amount: bountyAmount,
    requiredVoters: "3",
    requiredSettledRounds: "1",
  };

  const quote = await agent.quoteQuestion({
    clientRequestId,
    chainId: 42220,
    bounty,
    question,
    walletAddress,
  });

  console.log("Quote guidance:", JSON.stringify(quote.fastLane, null, 2));

  const ask = await agent.askHumans({
    clientRequestId,
    maxPaymentAmount: quote.payment?.amount ?? bounty.amount,
    bounty,
    question,
    walletAddress,
  });

  console.log("Prepared ask:", JSON.stringify(ask, null, 2));

  if (ask.transactionPlan?.calls?.length) {
    const hashes = (process.env.CURYO_CONFIRM_TX_HASHES ?? "")
      .split(",")
      .map(hash => hash.trim())
      .filter(Boolean);
    if (hashes.length === 0) {
      console.log("Execute transactionPlan.calls from walletAddress, then rerun with CURYO_CONFIRM_TX_HASHES.");
      return;
    }

    const confirmed = await agent.confirmAskTransactions({
      operationKey: ask.operationKey,
      transactionHashes: hashes,
    });
    console.log("Confirmed ask:", JSON.stringify(confirmed, null, 2));
  }

  for (;;) {
    const status = await agent.getQuestionStatus({ operationKey: ask.operationKey });
    console.log("Current status:", JSON.stringify(status, null, 2));

    if (status.ready || status.terminal) {
      break;
    }

    await sleep(status.pollAfterMs ?? 15_000);
  }

  const result = await agent.getResult({ operationKey: ask.operationKey });
  console.log("Structured result:", JSON.stringify(result, null, 2));

  await writeResultToMemory({
    answer: result.answer ?? "unknown",
    clientRequestId,
    confidence: result.confidence ?? null,
    operationKey: ask.operationKey,
    publicUrl: result.publicUrl ?? ask.publicUrl ?? null,
  });
}

const entryUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;

if (entryUrl && import.meta.url === entryUrl) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
