import { afterEach, describe, expect, it, vi } from "vitest";

type BotIndexOptions = {
  command: "claim" | "status" | "submit" | "vote";
  connectivityError?: Error;
};

async function loadBotIndex(options: BotIndexOptions) {
  vi.resetModules();

  const validateConfig = vi.fn();
  const validateBotConnectivity = vi.fn().mockImplementation(async () => {
    if (options.connectivityError) {
      throw options.connectivityError;
    }
  });
  const runStatus = vi.fn().mockResolvedValue(undefined);
  const runSubmit = vi.fn().mockResolvedValue(undefined);
  const runVote = vi.fn().mockResolvedValue(undefined);
  const runClaim = vi.fn().mockResolvedValue(undefined);
  const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  const exitSpy = vi.spyOn(process, "exit").mockImplementation((code?: string | number | null) => {
    throw new Error(`process.exit:${code ?? ""}`);
  }) as any;
  const originalArgv = process.argv;

  process.argv = ["node", "src/index.ts", options.command];

  vi.doMock("../config.js", () => ({
    validateConfig,
  }));
  vi.doMock("../client.js", () => ({
    validateBotConnectivity,
  }));
  vi.doMock("../commands/status.js", () => ({
    runStatus,
  }));
  vi.doMock("../commands/submit.js", () => ({
    runSubmit,
  }));
  vi.doMock("../commands/vote.js", () => ({
    runVote,
  }));
  vi.doMock("../commands/claim.js", () => ({
    runClaim,
  }));

  let importError: unknown = null;
  try {
    await import("../index.js");
    await vi.dynamicImportSettled();
  } catch (error) {
    importError = error;
  } finally {
    process.argv = originalArgv;
  }

  return {
    errorSpy,
    exitSpy,
    importError,
    runClaim,
    runStatus,
    runSubmit,
    runVote,
    validateBotConnectivity,
    validateConfig,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("bot index", () => {
  it("validates connectivity before running the status command", async () => {
    const bot = await loadBotIndex({ command: "status" });

    expect(bot.validateConfig).not.toHaveBeenCalled();
    expect(bot.validateBotConnectivity).not.toHaveBeenCalled();
    expect(bot.runStatus).toHaveBeenCalledOnce();
  });

  it("validates the selected bot role before running vote", async () => {
    const bot = await loadBotIndex({ command: "vote" });

    expect(bot.validateConfig).toHaveBeenCalledWith("rate");
    expect(bot.validateBotConnectivity).toHaveBeenCalledWith("rate");
    expect(bot.runVote).toHaveBeenCalledOnce();
  });

  it("runs the claim command without submit/vote connectivity preflight", async () => {
    const bot = await loadBotIndex({ command: "claim" });

    expect(bot.validateConfig).not.toHaveBeenCalled();
    expect(bot.validateBotConnectivity).not.toHaveBeenCalled();
    expect(bot.runClaim).toHaveBeenCalledOnce();
  });

  it("exits before running commands when connectivity validation fails", async () => {
    const bot = await loadBotIndex({
      command: "submit",
      connectivityError: new Error("RPC mismatch"),
    });

    expect(String(bot.importError)).toContain("process.exit:1");
    expect(bot.errorSpy).toHaveBeenCalledWith("[Bot] ERROR: RPC mismatch");
    expect(bot.exitSpy).toHaveBeenCalledWith(1);
    expect(bot.validateBotConnectivity).toHaveBeenCalledWith("submit");
    expect(bot.runSubmit).not.toHaveBeenCalled();
  });
});
