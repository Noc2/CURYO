import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createCuryoAgentClient } from "@curyo/sdk/agent";
import { loadAgentsRuntimeConfig } from "./config";
import {
  askHumansWithLocalSigner,
  generateLocalSignerWallet,
  loadLocalSignerConfig,
  loadLocalSignerWallet,
  withLocalSignerWallet,
  type LocalAskProgress,
} from "./localSigner";
import { listAgentResultTemplates } from "./templates";
import { lintAgentAskRequest, summarizeLintFindings } from "./questions/lint";

type CliOptions = Record<string, string | boolean>;

function printJson(value: unknown) {
  console.log(JSON.stringify(value, null, 2));
}

function redactSensitive(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactSensitive);
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => {
      if (["privateKey", "signature"].includes(key)) {
        return [key, "[redacted]"];
      }
      return [key, redactSensitive(entry)];
    }),
  );
}

function parseArgs(args: string[]): { command: string; options: CliOptions } {
  const [command = "help", ...rest] = args;
  const options: CliOptions = {};

  for (let index = 0; index < rest.length; index++) {
    const token = rest[index];
    if (!token.startsWith("--")) {
      throw new Error(`Unexpected argument: ${token}`);
    }

    const key = token.slice(2);
    const next = rest[index + 1];
    if (!next || next.startsWith("--")) {
      options[key] = true;
      continue;
    }

    options[key] = next;
    index++;
  }

  return { command, options };
}

function requireString(options: CliOptions, name: string): string {
  const value = options[name];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`--${name} is required`);
  }
  return value;
}

function readPaymentMode(options: CliOptions) {
  const value = options["payment-mode"];
  if (value === undefined) return undefined;
  if (value === "wallet_calls" || value === "x402_authorization") return value;
  throw new Error("--payment-mode must be wallet_calls or x402_authorization");
}

function printLocalAskProgress(event: LocalAskProgress) {
  switch (event.type) {
    case "ask_submitted":
      console.error(`Curyo ask prepared: ${event.response.operationKey ?? "operation pending"}`);
      return;
    case "x402_signed":
      console.error("Signed x402 authorization.");
      return;
    case "x402_resubmitted":
      console.error(`Curyo x402 ask prepared: ${event.response.operationKey ?? "operation pending"}`);
      return;
    case "transaction_sent":
      console.error(`Sent transactionPlan.calls[${event.index}]${event.phase ? ` (${event.phase})` : ""}: ${event.hash}`);
      return;
    case "transaction_confirmed":
      console.error(`Receipt confirmed for transactionPlan.calls[${event.index}]: ${event.hash}`);
      return;
    case "transactions_confirmed":
      console.error(`Confirmed hashes with Curyo: ${event.response.operationKey ?? "operation pending"}`);
      return;
  }
}

async function readJsonFile(path: string) {
  const packageRoot = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
  const candidates = [
    resolve(path),
    path.startsWith("packages/agents/") ? resolve(packageRoot, path.replace(/^packages\/agents\//, "")) : null,
  ].filter((candidate): candidate is string => Boolean(candidate));

  let lastError: unknown;
  for (const candidate of candidates) {
    try {
      return JSON.parse(await readFile(candidate, "utf8")) as unknown;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
}

function usage() {
  return `Usage:
  yarn workspace @curyo/agents templates
  yarn workspace @curyo/agents lint --file packages/agents/examples/questions/landing-pitch-review.json
  yarn workspace @curyo/agents quote --file packages/agents/examples/questions/landing-pitch-review.json
  yarn workspace @curyo/agents ask --file packages/agents/examples/questions/landing-pitch-review.json
  yarn workspace @curyo/agents wallet --generate --keystore ~/.curyo/local-signer.json
  yarn workspace @curyo/agents wallet
  yarn workspace @curyo/agents local-ask --file packages/agents/examples/questions/landing-pitch-review.json
  yarn workspace @curyo/agents status --operation-key 0x...
  yarn workspace @curyo/agents result --operation-key 0x...

Environment:
  CURYO_API_BASE_URL     Hosted Curyo origin for HTTP and MCP flows
  CURYO_MCP_TOKEN        Optional managed agent bearer token
  CURYO_MCP_API_URL      Optional MCP endpoint override
  CURYO_RPC_URL          RPC URL used by local-ask to send wallet transactions
  CURYO_CHAIN_ID         Optional chain guard for CURYO_RPC_URL
  CURYO_LOCAL_SIGNER_KEYSTORE_PATH      Encrypted local signer keystore path
  CURYO_LOCAL_SIGNER_KEYSTORE_PASSWORD  Keystore password from a secret source
  CURYO_LOCAL_SIGNER_PRIVATE_KEY        Escape hatch for ephemeral CI only`;
}

function createAgentClient() {
  const config = loadAgentsRuntimeConfig();
  return createCuryoAgentClient({
    apiBaseUrl: config.apiBaseUrl,
    mcpAccessToken: config.mcpAccessToken,
    mcpApiUrl: config.mcpApiUrl,
    mcpProtocolVersion: config.mcpProtocolVersion,
  });
}

async function main() {
  const { command, options } = parseArgs(process.argv.slice(2));

  switch (command) {
    case "templates":
      printJson({ templates: listAgentResultTemplates() });
      return;

    case "lint": {
      const payload = await readJsonFile(requireString(options, "file"));
      const findings = lintAgentAskRequest(payload);
      printJson({ findings, ...summarizeLintFindings(findings) });
      if (findings.some(finding => finding.level === "error")) {
        process.exitCode = 1;
      }
      return;
    }

    case "quote": {
      const agent = createAgentClient();
      const payload = await readJsonFile(requireString(options, "file"));
      printJson(await agent.quoteQuestion(payload as never));
      return;
    }

    case "ask": {
      const agent = createAgentClient();
      const payload = await readJsonFile(requireString(options, "file"));
      const findings = lintAgentAskRequest(payload);
      if (findings.some(finding => finding.level === "error")) {
        printJson({ findings, ...summarizeLintFindings(findings) });
        process.exitCode = 1;
        return;
      }
      printJson(await agent.askHumans(payload as never));
      return;
    }

    case "wallet": {
      const localSignerConfig = loadLocalSignerConfig(options);
      if (options.generate) {
        const generated = await generateLocalSignerWallet(localSignerConfig, { overwrite: Boolean(options.overwrite) });
        printJson({
          address: generated.account.address,
          keystorePath: generated.keystorePath,
          source: generated.source,
        });
        return;
      }

      const wallet = await loadLocalSignerWallet(localSignerConfig);
      printJson({
        address: wallet.account.address,
        source: wallet.source,
        warnings:
          wallet.source === "private-key"
            ? ["Loaded CURYO_LOCAL_SIGNER_PRIVATE_KEY. Prefer an encrypted keystore for persistent agent wallets."]
            : [],
      });
      return;
    }

    case "local-ask": {
      const agent = createAgentClient();
      const localSignerConfig = loadLocalSignerConfig(options);
      const wallet = await loadLocalSignerWallet(localSignerConfig);
      const payload = await readJsonFile(requireString(options, "file"));
      const payloadWithWallet = withLocalSignerWallet(payload, wallet.account.address);
      const findings = lintAgentAskRequest(payloadWithWallet);
      if (findings.some(finding => finding.level === "error")) {
        printJson({ findings, ...summarizeLintFindings(findings) });
        process.exitCode = 1;
        return;
      }

      const result = await askHumansWithLocalSigner({
        account: wallet.account,
        agent,
        config: localSignerConfig,
        onProgress: printLocalAskProgress,
        paymentMode: readPaymentMode(options),
        payload: payloadWithWallet,
      });

      printJson(
        redactSensitive({
          ...result,
          walletSource: wallet.source,
          warnings:
            wallet.source === "private-key"
              ? ["Loaded CURYO_LOCAL_SIGNER_PRIVATE_KEY. Prefer an encrypted keystore for persistent agent wallets."]
              : [],
        }),
      );
      return;
    }

    case "status": {
      const agent = createAgentClient();
      printJson(
        await agent.getQuestionStatus({
          chainId: typeof options["chain-id"] === "string" ? Number(options["chain-id"]) : undefined,
          clientRequestId: typeof options["client-request-id"] === "string" ? options["client-request-id"] : undefined,
          operationKey: typeof options["operation-key"] === "string" ? options["operation-key"] : undefined,
          walletAddress: typeof options["wallet-address"] === "string" ? options["wallet-address"] : undefined,
        }),
      );
      return;
    }

    case "result": {
      const agent = createAgentClient();
      printJson(
        await agent.getResult({
          chainId: typeof options["chain-id"] === "string" ? Number(options["chain-id"]) : undefined,
          clientRequestId: typeof options["client-request-id"] === "string" ? options["client-request-id"] : undefined,
          contentId: typeof options["content-id"] === "string" ? options["content-id"] : undefined,
          operationKey: typeof options["operation-key"] === "string" ? options["operation-key"] : undefined,
          walletAddress: typeof options["wallet-address"] === "string" ? options["wallet-address"] : undefined,
        }),
      );
      return;
    }

    default:
      console.log(usage());
      process.exitCode = command === "help" || command === "--help" ? 0 : 1;
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
