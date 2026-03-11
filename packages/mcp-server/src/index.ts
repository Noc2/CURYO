import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { startStreamableHttpServer } from "./http.js";
import { logEvent, serializeError } from "./lib/logging.js";
import { createServer } from "./server.js";

async function main() {
  const config = loadConfig();

  if (config.transport === "streamable-http") {
    const runningServer = await startStreamableHttpServer(config);
    logEvent("info", "mcp_http_server_started", {
      endpointUrl: runningServer.endpointUrl,
      healthUrl: new URL("/healthz", runningServer.endpointUrl).toString(),
      readinessUrl: new URL("/readyz", runningServer.endpointUrl).toString(),
      ponderBaseUrl: config.ponderBaseUrl,
      httpAuthMode: config.httpAuth.mode,
    });

    registerShutdownHandlers(async () => {
      logEvent("info", "mcp_http_server_stopping", {
        endpointUrl: runningServer.endpointUrl,
      });
      await runningServer.close();
    });
    return;
  }

  const server = createServer(config);
  const transport = new StdioServerTransport();

  await server.connect(transport);
  logEvent("info", "mcp_stdio_server_started", {
    ponderBaseUrl: config.ponderBaseUrl,
    httpAuthMode: config.httpAuth.mode,
  });
  registerShutdownHandlers(async () => {
    logEvent("info", "mcp_stdio_server_stopping", {
      ponderBaseUrl: config.ponderBaseUrl,
    });
    await server.close();
  });
}

main().catch((error) => {
  logEvent("error", "mcp_server_failed_to_start", serializeError(error));
  process.exit(1);
});

function registerShutdownHandlers(shutdown: () => Promise<void>): void {
  let isShuttingDown = false;

  const handleSignal = (signal: NodeJS.Signals) => {
    if (isShuttingDown) {
      return;
    }

    isShuttingDown = true;

    void shutdown()
      .then(() => {
        logEvent("info", "mcp_server_stopped", {
          signal,
        });
        process.exit(0);
      })
      .catch((error) => {
        logEvent("error", "mcp_server_shutdown_failed", {
          signal,
          ...serializeError(error),
        });
        process.exit(1);
      });
  };

  process.once("SIGINT", handleSignal);
  process.once("SIGTERM", handleSignal);
}
