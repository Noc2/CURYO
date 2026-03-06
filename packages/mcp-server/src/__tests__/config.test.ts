import { describe, expect, it } from "vitest";
import { loadConfig, normalizeBaseUrl } from "../config.js";

describe("normalizeBaseUrl", () => {
  it("strips trailing slashes", () => {
    expect(normalizeBaseUrl("https://ponder.curyo.xyz/")).toBe("https://ponder.curyo.xyz");
    expect(normalizeBaseUrl("https://ponder.curyo.xyz/api/")).toBe("https://ponder.curyo.xyz/api");
  });

  it("rejects non-http protocols", () => {
    expect(() => normalizeBaseUrl("ftp://ponder.curyo.xyz")).toThrow("Ponder URL must use http or https");
  });
});

describe("loadConfig", () => {
  it("uses CURYO_PONDER_URL when present", () => {
    const config = loadConfig({
      CURYO_PONDER_URL: "https://ponder.curyo.xyz/",
      CURYO_MCP_SERVER_NAME: "curyo-test",
      CURYO_MCP_SERVER_VERSION: "1.2.3",
    });

    expect(config).toEqual({
      ponderBaseUrl: "https://ponder.curyo.xyz",
      serverName: "curyo-test",
      serverVersion: "1.2.3",
    });
  });
});
