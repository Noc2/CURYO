import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { createServer } from "./server.js";

async function main() {
  const config = loadConfig();
  const server = createServer(config);
  const transport = new StdioServerTransport();

  await server.connect(transport);
  console.error(`[curyo-mcp] connected to ${config.ponderBaseUrl}`);
}

main().catch((error) => {
  console.error("[curyo-mcp] failed to start", error);
  process.exit(1);
});
