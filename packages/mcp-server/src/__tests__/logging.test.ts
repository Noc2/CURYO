import { afterEach, describe, expect, it } from "vitest";
import { serializeError } from "../lib/logging.js";

describe("serializeError", () => {
  const originalLogStacks = process.env.CURYO_MCP_LOG_STACKS;

  afterEach(() => {
    if (originalLogStacks === undefined) {
      delete process.env.CURYO_MCP_LOG_STACKS;
      return;
    }

    process.env.CURYO_MCP_LOG_STACKS = originalLogStacks;
  });

  it("omits error stacks by default", () => {
    delete process.env.CURYO_MCP_LOG_STACKS;

    expect(serializeError(new Error("boom"))).toEqual({
      errorName: "Error",
      errorMessage: "boom",
    });
  });

  it("includes error stacks when enabled explicitly", () => {
    process.env.CURYO_MCP_LOG_STACKS = "1";

    expect(serializeError(new Error("boom"))).toEqual(
      expect.objectContaining({
        errorName: "Error",
        errorMessage: "boom",
        errorStack: expect.stringContaining("Error: boom"),
      }),
    );
  });
});
