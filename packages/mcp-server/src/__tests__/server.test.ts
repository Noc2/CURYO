import { describe, expect, it } from "vitest";
import { createServer } from "../server.js";

describe("createServer", () => {
  it("builds a disconnected MCP server with the read-only toolset", () => {
    const server = createServer({
      ponderBaseUrl: "https://ponder.curyo.xyz",
      serverName: "curyo-test",
      serverVersion: "0.0.1",
    });

    expect(server.isConnected()).toBe(false);
  });
});
