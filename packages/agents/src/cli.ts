import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createCuryoAgentClient } from "@curyo/sdk/agent";
import { loadAgentsRuntimeConfig } from "./config.js";
import { listAgentResultTemplates } from "./templates.js";
import { lintAgentAskRequest, summarizeLintFindings } from "./questions/lint.js";

type CliOptions = Record<string, string | boolean>;

function printJson(value: unknown) {
  console.log(JSON.stringify(value, null, 2));
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
  yarn workspace @curyo/agents status --operation-key 0x...
  yarn workspace @curyo/agents result --operation-key 0x...

Environment:
  CURYO_API_BASE_URL     Hosted Curyo origin for HTTP/x402 flows
  CURYO_MCP_TOKEN        Optional managed agent bearer token
  CURYO_MCP_API_URL      Optional MCP endpoint override`;
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

    case "status": {
      const agent = createAgentClient();
      printJson(
        await agent.getQuestionStatus({
          chainId: typeof options["chain-id"] === "string" ? Number(options["chain-id"]) : undefined,
          clientRequestId: typeof options["client-request-id"] === "string" ? options["client-request-id"] : undefined,
          operationKey: typeof options["operation-key"] === "string" ? options["operation-key"] : undefined,
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
